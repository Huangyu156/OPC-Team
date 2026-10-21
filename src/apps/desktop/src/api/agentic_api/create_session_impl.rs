//! Session creation body for the `create_session` Tauri command.
//!
//! Extracted verbatim from the command so the entry point stays thin. Declared
//! as a child module of `agentic_api`, so `use super::*` gives it the parent's
//! private helpers (`sanitize_create_session_review_metadata`,
//! `is_idempotent_review_create`, `existing_session_create_response`,
//! `desktop_session_scope`, `worktree_error`) without widening any visibility.
//!
//! The command name, its `request` shape, and `CreateSessionResponse` are
//! unchanged; only the body moved.

use super::*;

/// Create a session, resolving the workspace identity, execution target, and
/// idempotent-create repairs before handing off to the coordinator.
pub(super) async fn run_create_session(
    coordinator: State<'_, Arc<ConversationCoordinator>>,
    app_state: State<'_, AppState>,
    runtime: State<'_, DesktopRuntimeContext>,
    mut request: CreateSessionRequest,
) -> Result<CreateSessionResponse, String> {
    fn norm_conn(s: Option<String>) -> Option<String> {
        s.map(|x| x.trim().to_string()).filter(|x| !x.is_empty())
    }
    sanitize_create_session_review_metadata(&mut request);
    let remote_conn = norm_conn(request.remote_connection_id.clone()).or_else(|| {
        request
            .config
            .as_ref()
            .and_then(|c| norm_conn(c.remote_connection_id.clone()))
    });
    let mut remote_ssh_host = norm_conn(request.remote_ssh_host.clone()).or_else(|| {
        request
            .config
            .as_ref()
            .and_then(|c| norm_conn(c.remote_ssh_host.clone()))
    });

    // The source workspace record is the identity authority for this command.
    // ID-aware clients send `workspaceId`; pre-ID clients are upgraded once
    // through the legacy adapter. Remote-ness comes from `workspace_kind`, never
    // from whether the request happened to carry an SSH connection.
    let source_workspace = if let Some(id) = norm_conn(request.workspace_id.clone()) {
        app_state
            .workspace_service
            .require_workspace(&id)
            .await
            .map_err(|error| error.to_string())?
    } else {
        app_state
            .workspace_service
            .resolve_legacy_workspace_reference(
                None,
                &request.workspace_path,
                remote_conn.as_deref(),
                remote_ssh_host.as_deref(),
            )
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| {
                format!(
                    "Workspace ID is unavailable for session creation: {}",
                    request.workspace_path
                )
            })?
    };
    request.workspace_id = Some(source_workspace.id.clone());
    let source_is_remote = source_workspace.workspace_kind == WorkspaceKind::Remote;
    let remote_conn = if source_is_remote {
        source_workspace
            .remote_ssh_connection_id()
            .map(str::to_owned)
            .or(remote_conn)
    } else {
        None
    };
    if source_is_remote {
        remote_ssh_host = source_workspace
            .metadata
            .get("sshHost")
            .and_then(|value| value.as_str())
            .map(str::to_owned)
            .or(remote_ssh_host);
        runtime
            .session_application()
            .ensure_workspace_runtime_ownership(desktop_session_scope(
                request.workspace_id.clone(),
                request.workspace_path.clone(),
                remote_conn.clone(),
                remote_ssh_host.clone(),
            ))
            .await
            .map_err(|error| error.to_string())?;
    } else {
        remote_ssh_host = None;
    }

    let source_workspace_path = request.workspace_path.clone();
    let is_idempotent_managed_create = matches!(
        request.execution_target.as_ref(),
        Some(SessionExecutionTargetRequest::NewManagedWorktree { .. })
    );
    if is_idempotent_managed_create {
        let request_id = request
            .request_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        if request.session_id.is_none() {
            request.session_id = Some(
                WorktreeService::session_id_for_request(&request_id)
                    .map_err(|error| error.to_string())?,
            );
        }
        request.request_id = Some(request_id);
    }
    let mut project_workspace_path = request
        .project_workspace_path
        .clone()
        .unwrap_or_else(|| source_workspace_path.clone());
    let requested_execution_target = request.execution_target.clone().unwrap_or_default();
    let mut created_worktree_id = None;
    let resolved_execution_target = match requested_execution_target {
        SessionExecutionTargetRequest::Local => {
            SessionExecutionTarget::local(source_workspace_path.clone())
        }
        SessionExecutionTargetRequest::NewManagedWorktree {
            base_ref,
            copy_local_changes,
        } => {
            if source_is_remote {
                return Err(worktree_error(
                    WorktreeErrorCode::RemoteUnsupported,
                    "Managed worktrees are not supported for remote SSH workspaces yet",
                    None,
                ));
            }
            let result = WorktreeService::create(WorktreeCreateRequest {
                request_id: request
                    .request_id
                    .clone()
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                project_workspace_id: None,
                project_workspace_path: project_workspace_path.clone(),
                source_workspace_path: Some(source_workspace_path.clone()),
                base_ref,
                copy_local_changes,
                // A user-created worktree is claimed by the sessions bound to
                // it, which already block automatic removal.
                claimed_by: None,
            })
            .await
            .map_err(|error| serde_json::to_string(&error).unwrap_or_else(|_| error.to_string()))?;
            project_workspace_path = result.worktree.project_workspace_path.clone();
            request.workspace_path = result.execution_target.root_path.clone();
            if result.created {
                created_worktree_id = result.execution_target.worktree_id.clone();
            }
            result.execution_target
        }
        SessionExecutionTargetRequest::ExistingWorktree { worktree_id } => {
            if source_is_remote {
                return Err(worktree_error(
                    WorktreeErrorCode::RemoteUnsupported,
                    "Managed worktrees are not supported for remote SSH workspaces yet",
                    None,
                ));
            }
            let worktree = WorktreeService::list(WorktreeListRequest {
                project_workspace_id: None,
                project_workspace_path: project_workspace_path.clone(),
            })
            .await
            .map_err(|error| serde_json::to_string(&error).unwrap_or_else(|_| error.to_string()))?
            .into_iter()
            .find(|worktree| worktree.worktree_id == worktree_id)
            .ok_or_else(|| {
                worktree_error(
                    WorktreeErrorCode::WorktreeNotFound,
                    "The selected worktree no longer exists",
                    None,
                )
            })?;
            if worktree.missing {
                return Err(worktree_error(
                    WorktreeErrorCode::WorktreeNotFound,
                    "The selected worktree directory is missing; recreate it first",
                    Some(worktree.path),
                ));
            }
            project_workspace_path = worktree.project_workspace_path.clone();
            request.workspace_path = worktree.path.clone();
            SessionExecutionTarget {
                kind: SessionExecutionTargetKind::ExistingWorktree,
                worktree_id: Some(worktree.worktree_id),
                root_path: worktree.path,
                base_ref: worktree.branch.clone(),
                base_commit: Some(worktree.head),
                branch: worktree.branch,
                lifecycle: Some(worktree.lifecycle),
            }
        }
    };
    request.project_workspace_path = Some(project_workspace_path.clone());
    // The project (storage) workspace is the source record's owning project:
    // itself for a main checkout, or `main_workspace_id` for a linked worktree.
    let project_workspace_id = source_workspace
        .project_workspace_id()
        .ok()
        .map(str::to_owned);

    let tracked_worktree_workspace_id = if resolved_execution_target.kind
        != SessionExecutionTargetKind::Local
    {
        match app_state
            .workspace_service
            .track_workspace_activity(
                PathBuf::from(&request.workspace_path),
                WorkspaceCreateOptions::default(),
                WorkspaceActivityMode::RefreshMetadata,
            )
            .await
        {
            Ok(workspace) => {
                request.workspace_id = Some(workspace.id.clone());
                Some(workspace.id)
            }
            Err(track_error) => {
                if let Some(worktree_id) = created_worktree_id.as_deref() {
                    if let Err(rollback_error) =
                        WorktreeService::rollback_created(&project_workspace_path, worktree_id)
                            .await
                    {
                        return Err(worktree_error(
                                WorktreeErrorCode::RollbackIncomplete,
                                format!(
                                    "Failed to register worktree workspace: {track_error}; rollback failed: {rollback_error}"
                                ),
                                Some(resolved_execution_target.root_path.clone()),
                            ));
                    }
                }
                return Err(worktree_error(
                    WorktreeErrorCode::IoFailed,
                    format!("Failed to register worktree workspace: {track_error}"),
                    None,
                ));
            }
        }
    } else {
        None
    };

    if let Err(error) = runtime
        .session_application()
        .ensure_configured_plugin_instance(desktop_session_scope(
            request.workspace_id.clone(),
            request.workspace_path.clone(),
            remote_conn.clone(),
            remote_ssh_host.clone(),
        ))
        .await
    {
        opc_core::plugin_host::report_configured_plugin_activation_failure(
            "Desktop session creation",
            request.workspace_id.as_deref(),
            error,
        )
        .await;
    }

    if is_idempotent_managed_create {
        let session_id = request
            .session_id
            .as_deref()
            .ok_or_else(|| "Idempotent worktree session requires a session ID".to_string())?;
        let effective_path = desktop_session_storage_root(
            &coordinator,
            project_workspace_id.as_deref(),
            Some(&project_workspace_path),
            remote_conn.as_deref(),
            remote_ssh_host.as_deref(),
        )
        .await?;
        let existing = coordinator
            .get_session_manager()
            .load_session_metadata(&effective_path, session_id)
            .await
            .map_err(|error| format!("Failed to check existing worktree session: {error}"))?;
        if let Some(metadata) = existing {
            let target_matches = metadata.workspace_path.as_deref()
                == Some(request.workspace_path.as_str())
                && metadata
                    .execution_target
                    .as_ref()
                    .and_then(|target| target.worktree_id.as_deref())
                    == resolved_execution_target.worktree_id.as_deref();
            if !target_matches {
                return Err(format!(
                    "Session ID {session_id} already exists with a different worktree target"
                ));
            }
            return existing_session_create_response(&request, &metadata);
        }
    }

    if is_idempotent_review_create(&request) {
        let session_id = request
            .session_id
            .as_deref()
            .ok_or_else(|| "Idempotent Review session requires a session ID".to_string())?;
        let effective_path = desktop_session_storage_root(
            &coordinator,
            project_workspace_id.as_deref(),
            Some(&project_workspace_path),
            remote_conn.as_deref(),
            remote_ssh_host.as_deref(),
        )
        .await?;
        let existing = coordinator
            .get_session_manager()
            .load_session_metadata(&effective_path, session_id)
            .await
            .map_err(|error| format!("Failed to check existing session: {error}"))?;
        if let Some(mut metadata) = existing {
            let response = existing_session_create_response(&request, &metadata)?;
            let mut repaired = false;
            if metadata.relationship.is_none() && request.relationship.is_some() {
                metadata.relationship = request.relationship.clone();
                repaired = true;
            }
            if metadata.deep_review_run_manifest.is_none()
                && request.deep_review_run_manifest.is_some()
            {
                metadata.deep_review_run_manifest = request.deep_review_run_manifest.clone();
                repaired = true;
            }
            if metadata.review_target_evidence.is_none() && request.review_target_evidence.is_some()
            {
                metadata.review_target_evidence = request.review_target_evidence.clone();
                repaired = true;
            }
            if repaired {
                // Repairing persisted metadata is a session mutation; it must
                // hold runtime ownership of the project workspace, resolved by
                // record ID first like every other desktop mutation.
                runtime
                    .session_application()
                    .ensure_workspace_runtime_ownership(desktop_session_scope(
                        project_workspace_id.clone(),
                        project_workspace_path.clone(),
                        remote_conn.clone(),
                        remote_ssh_host.clone(),
                    ))
                    .await
                    .map_err(|error| error.to_string())?;
                let relationship = request.relationship.clone();
                let deep_review_run_manifest = request.deep_review_run_manifest.clone();
                let review_target_evidence = request.review_target_evidence.clone();
                coordinator
                    .get_session_manager()
                    .update_session_metadata(&effective_path, session_id, |current| {
                        if current.relationship.is_none() {
                            current.relationship = relationship;
                        }
                        if current.deep_review_run_manifest.is_none() {
                            current.deep_review_run_manifest = deep_review_run_manifest;
                        }
                        if current.review_target_evidence.is_none() {
                            current.review_target_evidence = review_target_evidence;
                        }
                    })
                    .await
                    .map_err(|error| {
                        format!("Failed to repair Review session metadata: {error}")
                    })?;
            }
            return Ok(response);
        }
    }

    let config = request
        .config
        .map(|c| SessionConfig {
            max_context_tokens: c.max_context_tokens.unwrap_or(128128),
            auto_compact: c.auto_compact.unwrap_or(true),
            enable_tools: c.enable_tools.unwrap_or(true),
            safe_mode: c.safe_mode.unwrap_or(true),
            max_turns: c.max_turns.unwrap_or(200),
            enable_context_compression: c.enable_context_compression.unwrap_or(true),
            workspace_path: Some(request.workspace_path.clone()),
            project_workspace_path: Some(project_workspace_path.clone()),
            execution_target: Some(resolved_execution_target.clone()),
            workspace_id: request.workspace_id.clone(),
            remote_connection_id: remote_conn.clone(),
            remote_ssh_host: remote_ssh_host.clone(),
            model_id: c.model_name,
            reasoning_preset: c.reasoning_preset,
            ..Default::default()
        })
        .unwrap_or(SessionConfig {
            workspace_path: Some(request.workspace_path.clone()),
            project_workspace_path: Some(project_workspace_path.clone()),
            execution_target: Some(resolved_execution_target),
            workspace_id: request.workspace_id.clone(),
            remote_connection_id: remote_conn.clone(),
            remote_ssh_host: remote_ssh_host.clone(),
            ..Default::default()
        });

    let session_kind = request.session_kind.unwrap_or_default();
    let execution_workspace_path = request.workspace_path.clone();
    let worktree_recovery_path = execution_workspace_path.clone();
    let create_result = if matches!(session_kind, SessionKind::Subagent) {
        coordinator
            .create_hidden_subagent_session_with_workspace(
                request.session_id,
                request.session_name.clone(),
                request.agent_type.clone(),
                config,
                execution_workspace_path,
                None,
            )
            .await
    } else {
        coordinator
            .create_session_with_workspace(
                request.session_id,
                request.session_name.clone(),
                request.agent_type.clone(),
                config,
                execution_workspace_path,
            )
            .await
    };
    let session = match create_result {
        Ok(session) => session,
        Err(create_error) => {
            let mut rollback_issues = Vec::new();
            if let Some(workspace_id) = tracked_worktree_workspace_id.as_deref() {
                if let Err(remove_error) = app_state
                    .workspace_service
                    .remove_workspace(workspace_id)
                    .await
                {
                    warn!(
                        "Failed to remove rolled back worktree workspace registration: {}",
                        remove_error
                    );
                    rollback_issues.push(format!(
                        "workspace registration could not be removed: {remove_error}"
                    ));
                }
            }
            if let Some(worktree_id) = created_worktree_id.as_deref() {
                if let Err(rollback_error) =
                    WorktreeService::rollback_created(&project_workspace_path, worktree_id).await
                {
                    rollback_issues
                        .push(format!("worktree could not be removed: {rollback_error}"));
                }
            }
            if !rollback_issues.is_empty() {
                return Err(worktree_error(
                    WorktreeErrorCode::RollbackIncomplete,
                    format!(
                        "Failed to create session: {create_error}; {}",
                        rollback_issues.join("; ")
                    ),
                    Some(worktree_recovery_path),
                ));
            }
            return Err(format!("Failed to create session: {create_error}"));
        }
    };

    if let Some(relationship) = request.relationship {
        coordinator
            .get_session_manager()
            .merge_session_relationship(&session.session_id, relationship)
            .await
            .map_err(|e| format!("Failed to persist session relationship: {}", e))?;
    }

    if let Some(run_manifest) = request.deep_review_run_manifest {
        coordinator
            .get_session_manager()
            .set_session_deep_review_run_manifest(&session.session_id, Some(run_manifest))
            .await
            .map_err(|e| format!("Failed to persist Deep Review run manifest: {}", e))?;
    }

    if let Some(target_evidence) = request.review_target_evidence {
        coordinator
            .get_session_manager()
            .set_session_review_target_evidence(&session.session_id, Some(target_evidence))
            .await
            .map_err(|e| format!("Failed to persist Review target evidence: {}", e))?;
    }

    Ok(session.into())
}
