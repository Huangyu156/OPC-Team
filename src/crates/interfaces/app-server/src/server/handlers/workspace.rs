use std::sync::Arc;

use agent_client_protocol::{Builder, HandleDispatchFrom};
use opc_app_server_protocol::workspace::*;

use crate::agent::{runtime_call, OpcTeamAppRuntime};
use crate::role::{AppClient, AppServer};

pub(in crate::server) fn builder(
    runtime: Arc<OpcTeamAppRuntime>,
) -> Builder<AppServer, impl HandleDispatchFrom<AppClient>> {
    AppServer
        .builder()
        .name("workspace handlers")
        .on_receive_request(
            {
                let runtime = runtime.clone();
                async move |_: WorkspaceDiffRequest, responder, _cx| {
                    responder.respond_with_result(runtime_call(
                        runtime
                            .runtime()
                            .workspace_diff()
                            .await
                            .map(WorkspaceDiffResponse),
                    ))
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let runtime = runtime.clone();
                async move |request: SearchWorkspaceReferencesRequest, responder, _cx| {
                    responder.respond_with_result(runtime_call(
                        runtime
                            .runtime()
                            .search_workspace_references(request.0)
                            .await
                            .map(SearchWorkspaceReferencesResponse),
                    ))
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |request: MessageReferencesRequest, responder, _cx| {
                responder.respond_with_result(runtime_call(
                    runtime
                        .runtime()
                        .workspace_references_for_message(request.0)
                        .await
                        .map(MessageReferencesResponse),
                ))
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |_: AssistantWorkspaceLocationsRequest, responder, _cx| {
                // The PathManager singleton is the owner of assistant workspace
                // path policy; the handler only converts its view to the wire.
                let manager =
                    opc_core::infrastructure::app_paths::get_path_manager_arc();
                let base_dirs = manager.assistant_workspace_base_dirs();
                let fallback = std::path::PathBuf::new();
                let (active_root, legacy_root) = match base_dirs.as_slice() {
                    [active, legacy, ..] => (active.clone(), legacy.clone()),
                    [active] => (active.clone(), active.clone()),
                    _ => (fallback.clone(), fallback),
                };
                let custom_root_active = manager.assistant_workspace_root_override().is_some();
                responder.respond_with_result(Ok(AssistantWorkspaceLocationsResponse {
                    active_root: active_root.to_string_lossy().into_owned(),
                    legacy_root: legacy_root.to_string_lossy().into_owned(),
                    custom_root_active,
                }))
            },
            agent_client_protocol::on_receive_request!(),
        )
}
