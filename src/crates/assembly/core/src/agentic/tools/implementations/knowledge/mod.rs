//! Knowledge base tools.
//!
//! Three tools share one access scope resolved from the calling agent's
//! definition (`crate::agentic::knowledge::access`). They are ordinary tools in
//! the registry, but they are only *useful* to an agent that declared
//! `knowledge_base_refs`; an agent without references gets a structured
//! refusal instead of an empty result so the model stops retrying.
//!
//! Scope checks live in the tools rather than in `is_available_in_context`
//! because tool-listing contexts carry no `agent_type`. Filtering availability
//! there would hide the tools from every agent's manifest.

mod knowledge_read_tool;
mod knowledge_search_tool;
mod knowledge_write_tool;

pub use knowledge_read_tool::KnowledgeReadTool;
pub use knowledge_search_tool::KnowledgeSearchTool;
pub use knowledge_write_tool::KnowledgeWriteTool;

use crate::agentic::knowledge::KnowledgeDatabase;
use crate::agentic::tools::framework::{PermissionIntent, ToolUseContext};
use crate::infrastructure::get_path_manager_arc;
use crate::util::errors::OpcTeamResult;
use serde_json::json;

/// Open the user-level knowledge database for one tool call.
///
/// Remote sessions are rejected before this is reached; the database is a
/// user-level local resource, so a remote workspace would otherwise read the
/// controlling machine's knowledge while the user expects the remote host's.
pub(crate) fn open_knowledge_database() -> KnowledgeDatabase {
    KnowledgeDatabase::new(get_path_manager_arc())
}

/// Reject knowledge tool calls that would leak local knowledge into a remote
/// workspace session.
pub(crate) fn ensure_local_knowledge_session(context: &ToolUseContext) -> OpcTeamResult<()> {
    if context.is_remote() {
        return Err(crate::util::errors::OpcTeamError::tool(
            json!({
                "code": "knowledge_unsupported_for_remote_workspace",
                "message": "Knowledge base tools are unsupported for remote workspaces. The knowledge base is a user-level local resource.",
            })
            .to_string(),
        ));
    }
    Ok(())
}

/// Permission intent for a read of knowledge bases.
///
/// The resources are knowledge base ids, not filesystem paths, so this does not
/// go through `file_permission_intents` (that helper resolves and canonicalizes
/// paths). The toolkit is account scoped: a user-level knowledge base is not
/// owned by a workspace, so callers without a workspace still authorize it.
pub(crate) fn knowledge_permission_intent(
    action: &str,
    knowledge_base_ids: &[String],
) -> PermissionIntent {
    let mut intent = PermissionIntent::new(
        action,
        knowledge_base_ids
            .iter()
            .map(|id| format!("knowledge:{id}"))
            .collect(),
    );
    intent
        .display_metadata
        .insert("permissionScope".to_string(), json!("account"));
    intent
}
