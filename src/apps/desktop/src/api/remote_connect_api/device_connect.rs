//! Device routing connection body for `account_connect_devices`.
//!
//! Extracted verbatim from the Tauri command so the entry point stays thin.
//! Declared as a child module of `remote_connect_api`, so `use super::*` gives
//! it the parent's private helpers without widening any visibility.

use super::*;

/// Connect to the account relay and start consuming the device routing stream.
pub(super) async fn connect_devices() -> Result<Vec<OnlineDeviceInfo>, String> {
    let account_generation = account_context_generation();
    let operation_guard = lock_account_operation(account_generation).await?;
    let (session, relay_url) = read_account_context_for_generation(account_generation).await?;
    let identity = current_device_identity()?;
    let device_name = identity.device_name.clone();
    let holder = get_service_holder().read().await;
    let service = holder
        .as_ref()
        .ok_or_else(|| "remote connect service not initialized".to_string())?;

    // Reuse is allowed only when the active socket is explicitly owned by the
    // current account generation and token. A service-level connected flag by
    // itself may still describe the account that was just replaced.
    if let Some(devices) = device_presence_for_account(account_generation, &session.token) {
        let is_connected = service.is_device_connected().await;
        if !account_context_matches(account_generation, &session.token).await {
            return Err("account context changed".to_string());
        }
        if is_connected {
            let local_id = DeviceIdentity::from_current_machine()
                .ok()
                .map(|d| d.device_id);
            let local_known = local_id
                .as_ref()
                .is_some_and(|id| devices.iter().any(|d| d.device_id == *id));
            if local_known {
                return Ok(devices);
            }
            log::info!(
            "Device WS connected but local device_id not in online set; reconnecting to heal identity"
        );
        }
    }

    cancel_pending_device_rpcs();
    let routing_lifecycle = DEVICE_ROUTING_LIFECYCLE_LOCK.write().await;

    // Invalidate the prior loop before `start_device_connection` swaps the
    // service client. Its compare-and-clear exit path must not touch this new
    // connection's controllers or presence.
    clear_device_routing_state();
    disconnect_peer_controllers("Device routing reconnecting").await;

    let (mut event_rx, auth_device_id, service_connection_id) = match service
        .start_device_connection(
            &relay_url,
            &session.token,
            &device_name,
            Arc::new(DesktopHostStreamNotifier),
        )
        .await
    {
        Ok(result) => result,
        Err(e) => {
            let msg = format!("{e}");
            clear_device_routing_state();
            // Token invalidation re-enters the account transition path, so the
            // current account-operation lease must be released first.
            drop(routing_lifecycle);
            drop(operation_guard);
            drop(holder);
            if error_indicates_expired_token(&msg) {
                invalidate_local_account_session_if_current(
                    account_generation,
                    &session.token,
                    &msg,
                )
                .await;
            }
            return Err(msg);
        }
    };

    if !account_context_matches(account_generation, &session.token).await {
        service.stop_device_connection().await;
        clear_device_routing_state();
        return Err("account context changed".to_string());
    }
    let routing_owner =
        new_device_routing_owner(account_generation, &session.token, service_connection_id);
    install_device_routing_owner(routing_owner.clone());

    if let Err(e) = session_store::save_session_with_device(
        &session.token,
        &session.user_id,
        &session.master_key,
        &relay_url,
        Some(auth_device_id.as_str()),
    ) {
        log::warn!("Failed to persist AuthOk device_id into session: {e}");
    }

    if let Err(error) = AccountClient::new()
        .report_local_metadata(&relay_url, &session, &auth_device_id)
        .await
    {
        log::warn!("Failed to report device metadata on connection: {error}");
    }

    // Background task: consume events (presence / device messages / auth errors)
    // Note: AuthOk is consumed inside start_device_connection (adopt happens there).
    let event_relay_url = relay_url.clone();
    let event_session = session.clone();
    let event_owner = routing_owner.clone();
    tokio::spawn(async move {
        use opc_core::service::remote_connect::relay_client::RelayEvent;
        'routing_events: while let Some(event) = event_rx.recv().await {
            if !device_routing_owner_is_current(&event_owner).await {
                break;
            }
            match event {
                RelayEvent::AuthOk { user_id, device_id } => {
                    // Should not normally arrive — start_device_connection consumes AuthOk.
                    log::info!(
                        "Device routing auth ok (forwarded unexpectedly): user={user_id} device={device_id}"
                    );
                }
                RelayEvent::AuthError { message } => {
                    log::warn!("Device routing auth error: {message}");
                    // The socket can be rejected while the account panel is
                    // closed. Fully invalidate local state here so desktop
                    // capabilities and every UI surface agree immediately.
                    invalidate_local_account_session_if_current(
                        account_generation,
                        &event_session.token,
                        &message,
                    )
                    .await;
                    break;
                }
                RelayEvent::DevicePresence { devices } => {
                    event_session.clear_peer_keys().await;
                    let Some(_routing_effect) = lock_current_device_routing(&event_owner).await
                    else {
                        break 'routing_events;
                    };
                    if !replace_device_presence_if_owner(&event_owner, devices.clone()) {
                        break 'routing_events;
                    }
                    log::info!("Device presence updated: {} online", devices.len());
                    // Presence is authoritative for who can still receive stream
                    // hints; a device that dropped off stops holding streams alive.
                    if let Some(hub) = host_stream_hub().await {
                        let online: Vec<String> =
                            devices.iter().map(|d| d.device_id.clone()).collect();
                        hub.retain_online(&online);
                    }
                    // Offline presence does not revoke an account device or its
                    // permission mailbox. Reconnect resumes the same ownership.
                    if !device_routing_owner_is_current(&event_owner).await {
                        break 'routing_events;
                    }
                    emit_device_presence(&devices);
                }
                RelayEvent::DeviceMessageReceived {
                    source_device_id,
                    correlation_id,
                    encrypted_data,
                    nonce,
                } => {
                    match event_session
                        .decrypt_from_peer(
                            &event_relay_url,
                            &source_device_id,
                            &encrypted_data,
                            &nonce,
                        )
                        .await
                    {
                        Ok(plaintext) => {
                            use opc_core::service::remote_connect::remote_server::RemoteCommand;
                            match serde_json::from_str::<RemoteCommand>(&plaintext) {
                                Ok(RemoteCommand::DeviceEvent { event, payload }) => {
                                    let Some(_routing_effect) =
                                        lock_current_device_routing(&event_owner).await
                                    else {
                                        break 'routing_events;
                                    };
                                    // Controller receiving peer UI events — re-emit locally
                                    // under the same event name so PeerDeviceTransport listen
                                    // works. The source device is tagged onto the payload so a
                                    // controller that is also running local work can route each
                                    // stream to the right device surface.
                                    log::debug!("DeviceEvent from {source_device_id}: {event}");
                                    if event_session.deliver_device_event(
                                        &source_device_id,
                                        &event,
                                        &payload,
                                    ) {
                                        // Host stream hints drive Rust subscribers; the
                                        // webview only sees the records they read back.
                                        continue;
                                    }
                                    emit_account_event(
                                        &event,
                                        tag_peer_event_source(payload, &source_device_id),
                                    );
                                }
                                Ok(RemoteCommand::ExecuteOnDevice {
                                    session_id,
                                    content,
                                    agent_type,
                                    workspace_path,
                                }) => {
                                    let Some(_routing_effect) =
                                        lock_current_device_routing(&event_owner).await
                                    else {
                                        break 'routing_events;
                                    };
                                    log::info!(
                                        "ExecuteOnDevice from {source_device_id}: \
                                         session={:?} content_len={}",
                                        session_id,
                                        content.len()
                                    );
                                    if let Some(scheduler) = DIALOG_SCHEDULER.get() {
                                        use opc_core::agentic::coordination::{
                                            DialogSubmissionPolicy, DialogTriggerSource,
                                        };
                                        let session_id = session_id
                                            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                                        let policy = DialogSubmissionPolicy::for_source(
                                            DialogTriggerSource::RemoteRelay,
                                        );
                                        let wp = match resolve_requested_local_workspace_path(
                                            workspace_path.as_deref(),
                                        ) {
                                            Ok(path) => path,
                                            Err(error) => {
                                                log::warn!(
                                                    "ExecuteOnDevice rejected invalid workspace: {error}"
                                                );
                                                continue;
                                            }
                                        };
                                        let agent =
                                            agent_type.unwrap_or_else(|| "Standard".to_string());
                                        if let Err(e) = scheduler
                                            .submit(
                                                session_id,
                                                content,
                                                None,
                                                None,
                                                agent,
                                                Some(wp),
                                                None,
                                                None,
                                                policy,
                                                None,
                                                None,
                                                None,
                                            )
                                            .await
                                        {
                                            log::warn!("ExecuteOnDevice failed: {e}");
                                        }
                                    } else {
                                        log::warn!(
                                            "DialogScheduler not available for ExecuteOnDevice"
                                        );
                                    }
                                    if !device_routing_owner_is_current(&event_owner).await {
                                        break 'routing_events;
                                    }
                                }
                                Ok(cmd) => {
                                    // The lease is taken here, on the loop, so a
                                    // retiring loop still notices it has been
                                    // replaced and stops reading events at once.
                                    let mut cancelled = device_rpc_cancellation().subscribe();
                                    let Some(routing_effect) =
                                        lock_current_device_routing(&event_owner).await
                                    else {
                                        break 'routing_events;
                                    };
                                    // HTTP RPC request from another device via relay.
                                    // Execute the command locally and send back
                                    // the encrypted response (including errors).
                                    log::info!(
                                        "RPC request received from relay: corr={correlation_id}"
                                    );
                                    // Spawned rather than awaited. Most commands
                                    // are answered by the webview, which can take
                                    // up to DEFAULT_INVOKE_TIMEOUT (120s) to reply;
                                    // awaiting here meant one slow command stalled
                                    // every device behind it, so a `ping` from the
                                    // watch could take 40s to come back for no
                                    // reason of its own. Each RPC carries its own
                                    // correlation id, so nothing about the reply
                                    // path depends on them finishing in order.
                                    let rpc_owner = event_owner.clone();
                                    let rpc_session = event_session.clone();
                                    let ping_generation = control_ping_generation(&rpc_owner);
                                    let ping_received_at = std::time::Instant::now();
                                    tokio::spawn(async move {
                                        tokio::select! {
                                            biased;
                                            _ = cancelled.changed() => {},
                                            _ = async move {
                                        // A transition cancels this future before
                                        // taking the write lease. Captured account
                                        // ownership cannot cross into its replacement.
                                        let _routing_effect = routing_effect;
                                        // Host streams are answered from this host's
                                        // memory for the requesting device; every
                                        // other command goes to the local dispatcher.
                                        let hub = host_stream_hub().await;
                                        let execution = match opc_core::service::remote_connect::handle_host_stream_command(
                                            hub.as_ref(),
                                            &source_device_id,
                                            &cmd,
                                        )
                                        .await
                                        {
                                            Some(response) => serde_json::to_value(response)
                                                .map_err(anyhow::Error::from),
                                            None => execute_local_remote_command(&cmd).await,
                                        };
                                        // Returning drops this reply only. The loop
                                        // re-checks ownership at the top of every
                                        // iteration, so a stale connection is still
                                        // retired there — just not from in here.
                                        if !device_routing_owner_is_current(&rpc_owner).await {
                                            return;
                                        }
                                        match execution {
                                            Ok(resp_value) => {
                                                let control_ping =
                                                    is_successful_control_ping(&cmd, &resp_value);
                                                let sent = send_rpc_envelope(
                                                    &rpc_owner,
                                                    &rpc_session,
                                                    &source_device_id,
                                                    &correlation_id,
                                                    resp_value,
                                                )
                                                .await;
                                                if let Some(generation) =
                                                    ping_generation.filter(|_| sent && control_ping)
                                                {
                                                    record_control_ping_if_owner(
                                                        &rpc_owner,
                                                        generation,
                                                        ping_received_at,
                                                        match &cmd {
                                                            RemoteCommand::Ping { client } => {
                                                                client.as_ref()
                                                            }
                                                            _ => None,
                                                        },
                                                    );
                                                }
                                            }
                                            Err(e) => {
                                                log::warn!("RPC: execute command failed: {e}");
                                                send_rpc_error(
                                                    &rpc_owner,
                                                    &rpc_session,
                                                    &source_device_id,
                                                    &correlation_id,
                                                    format!("RPC execute failed: {e}"),
                                                )
                                                .await;
                                            }
                                        }

                                            } => {}
                                        }
                                    });
                                }
                                Err(e) => {
                                    log::warn!("Could not parse device command: {e}");
                                    if !correlation_id.is_empty() {
                                        let Some(_routing_effect) =
                                            lock_current_device_routing(&event_owner).await
                                        else {
                                            break 'routing_events;
                                        };
                                        send_rpc_error(
                                            &event_owner,
                                            &event_session,
                                            &source_device_id,
                                            &correlation_id,
                                            format!("invalid RPC command: {e}"),
                                        )
                                        .await;
                                        if !device_routing_owner_is_current(&event_owner).await {
                                            break 'routing_events;
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            log::warn!("Failed to decrypt device message: {e}");
                            if !correlation_id.is_empty() {
                                let Some(_routing_effect) =
                                    lock_current_device_routing(&event_owner).await
                                else {
                                    break 'routing_events;
                                };
                                send_rpc_error(
                                    &event_owner,
                                    &event_session,
                                    &source_device_id,
                                    &correlation_id,
                                    format!("failed to decrypt RPC request: {e}"),
                                )
                                .await;
                                if !device_routing_owner_is_current(&event_owner).await {
                                    break 'routing_events;
                                }
                            }
                        }
                    }
                }
                RelayEvent::Disconnected => {
                    let Some(_routing_effect) = lock_current_device_routing(&event_owner).await
                    else {
                        break 'routing_events;
                    };
                    if !replace_device_presence_if_owner(&event_owner, Vec::new()) {
                        break 'routing_events;
                    }
                    clear_control_ping_if_owner(&event_owner);
                    log::info!("Device routing disconnected");
                    // Preserve pending permissions across network loss. Explicit
                    // account retirement retains the revocation path.
                    if !device_routing_owner_is_current(&event_owner).await {
                        break 'routing_events;
                    }
                    emit_device_presence(&[]);
                }
                RelayEvent::Reconnected => {
                    let Some(_routing_effect) = lock_current_device_routing(&event_owner).await
                    else {
                        break 'routing_events;
                    };
                    if let Ok(identity) = current_device_identity() {
                        if let Err(error) = AccountClient::new()
                            .report_local_metadata(
                                &event_relay_url,
                                &event_session,
                                &identity.device_id,
                            )
                            .await
                        {
                            log::warn!("Failed to report device metadata after reconnect: {error}");
                        }
                    }
                    log::info!("Device routing reconnected — AuthConnect re-sent by transport");
                }
                _ => {}
            }
        }
        finish_device_routing_event_loop(&event_owner).await;
    });

    drop(routing_lifecycle);
    if !account_context_matches(account_generation, &session.token).await {
        return Err("account context changed".to_string());
    }
    Ok(device_presence_for_account(account_generation, &session.token).unwrap_or_default())
}
