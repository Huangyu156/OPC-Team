//! Filename/content search implementation behind the `search_files` command.
//!
//! The Tauri command in `commands.rs` only forwards its arguments here. Keeping the
//! workspace resolution, remote-vs-local dispatch, and result serialization in one
//! function keeps the command surface thin while leaving the wire shape untouched.

use crate::api::app_state::AppState;
use crate::api::commands::{
    register_search, resolve_search_limit, serialize_search_results, unregister_search,
    SearchFilesRequest, DEFAULT_CONTENT_SEARCH_RESULTS, DEFAULT_FILENAME_SEARCH_RESULTS,
};
use crate::api::path_target::DesktopPathTarget;
use crate::api::search_api::{
    remote_content_search_refusal, remote_content_search_refusal_message, resolve_search_workspace,
    search_file_contents_via_workspace_search, should_use_workspace_search,
};
use log::{debug, error, info};
use opc_core::service::remote_ssh::{search_remote_file_names, RemoteFileNameSearch};
use opc_core::service::workspace::WorkspaceKind;
use tauri::State;

pub(crate) async fn run_search_files(
    state: State<'_, AppState>,
    mut request: SearchFilesRequest,
) -> Result<serde_json::Value, String> {
    use opc_core::service::filesystem::FileSearchOptions;
    let workspace = resolve_search_workspace(
        &state,
        request.workspace_id.as_deref(),
        &request.root_path,
        request.remote_connection_id.as_deref(),
    )
    .await?;
    request.root_path = workspace.root_path.to_string_lossy().into_owned();
    request.remote_connection_id = Some(
        workspace
            .filesystem_connection_id()?
            .unwrap_or("")
            .to_owned(),
    );

    let search_id = request.search_id.clone();
    let cancel_flag = register_search(&state, search_id.as_deref());
    let max_results = resolve_search_limit(
        request.max_results,
        if request.search_content {
            DEFAULT_CONTENT_SEARCH_RESULTS
        } else {
            DEFAULT_FILENAME_SEARCH_RESULTS
        },
    );
    let options = FileSearchOptions {
        include_content: request.search_content,
        case_sensitive: request.case_sensitive,
        use_regex: request.use_regex,
        whole_word: request.whole_word,
        max_results: Some(max_results),
        file_extensions: None,
        include_directories: request.include_directories,
    };

    let use_workspace_search =
        request.search_content && should_use_workspace_search(&state, &workspace).await;
    let result = if request.search_content {
        if workspace.workspace_kind == WorkspaceKind::Remote {
            if !use_workspace_search {
                Err(
                    remote_content_search_refusal(&state, "search_files", &workspace)
                        .await
                        .unwrap_or_else(|| {
                            remote_content_search_refusal_message(
                                "search_files",
                                &request.root_path,
                                "remote workspace search is unavailable",
                            )
                        }),
                )
            } else {
                search_file_contents_via_workspace_search(
                    &state,
                    &workspace,
                    &request.pattern,
                    request.case_sensitive,
                    request.use_regex,
                    request.whole_word,
                    max_results,
                )
                .await
                .map(|result| result.outcome.results)
            }
        } else {
            let filename_outcome = state
                .filesystem_service
                .search_file_names(
                    &request.root_path,
                    &request.pattern,
                    FileSearchOptions {
                        include_content: false,
                        include_directories: request.include_directories,
                        ..options.clone()
                    },
                    cancel_flag.clone(),
                )
                .await?;
            let mut filename_results = filename_outcome.results;

            if filename_results.len() >= max_results {
                Ok(filename_results)
            } else {
                let remaining = max_results - filename_results.len();
                let mut content_outcome = if use_workspace_search {
                    search_file_contents_via_workspace_search(
                        &state,
                        &workspace,
                        &request.pattern,
                        request.case_sensitive,
                        request.use_regex,
                        request.whole_word,
                        remaining,
                    )
                    .await
                    .map(|result| result.outcome)?
                } else {
                    state
                        .filesystem_service
                        .search_file_contents(
                            &request.root_path,
                            &request.pattern,
                            FileSearchOptions {
                                include_content: true,
                                include_directories: false,
                                max_results: Some(remaining),
                                ..options
                            },
                            cancel_flag,
                        )
                        .await?
                };
                if filename_outcome.truncated || content_outcome.truncated {
                    debug!(
                        "Legacy search truncated: root_path={}, pattern={}, search_content={}, limit={}",
                        request.root_path,
                        request.pattern,
                        request.search_content,
                        max_results
                    );
                }
                filename_results.append(&mut content_outcome.results);
                Ok(filename_results)
            }
        }
    } else {
        match crate::api::path_target::resolve_desktop_workspace_target(&state, &workspace.id)
            .await
        {
            Ok(DesktopPathTarget::Remote {
                requested_path,
                entry,
            }) => match state.get_remote_file_service_async().await {
                Ok(remote_fs) => search_remote_file_names(RemoteFileNameSearch {
                    remote_fs,
                    workspace: entry,
                    root_path: requested_path,
                    pattern: request.pattern.clone(),
                    case_sensitive: request.case_sensitive,
                    use_regex: request.use_regex,
                    whole_word: request.whole_word,
                    include_directories: request.include_directories,
                    limit: max_results,
                    cancel_flag,
                    progress_sink: None,
                })
                .await
                .map(|outcome| outcome.results),
                Err(error) => Err(format!(
                    "search_files cannot list remote workspace path '{}': remote file service is unavailable ({}); local filesystem fallback was not attempted",
                    request.root_path, error
                )),
            },
            Ok(DesktopPathTarget::Local { .. }) => state
                .filesystem_service
                .search_file_names(&request.root_path, &request.pattern, options, cancel_flag)
                .await
                .map(|outcome| outcome.results)
                .map_err(|error| format!("Failed to search filenames: {}", error)),
            Err(error) => Err(error),
        }
    };
    unregister_search(&state, search_id.as_deref());

    match result {
        Ok(results) => {
            info!(
                "Legacy search completed: root_path={}, pattern={}, search_content={}, results_count={}",
                request.root_path,
                request.pattern,
                request.search_content,
                results.len()
            );
            Ok(serde_json::json!(serialize_search_results(results)))
        }
        Err(e) => {
            error!(
                "Failed to execute legacy search: root_path={}, pattern={}, search_content={}, error={}",
                request.root_path, request.pattern, request.search_content, e
            );
            Err(format!("Failed to execute legacy search: {}", e))
        }
    }
}
