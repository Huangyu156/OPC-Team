//! `KnowledgeSearch` tool: find entries across the agent's knowledge bases.

use super::{ensure_local_knowledge_session, knowledge_permission_intent, open_knowledge_database};
use crate::agentic::knowledge::{
    resolve_knowledge_access, KnowledgeSearchRequest, MAX_KNOWLEDGE_QUERY_LIMIT,
};
use crate::agentic::tools::framework::{PermissionIntent, Tool, ToolResult, ToolUseContext};
use crate::util::errors::{OpcTeamError, OpcTeamResult};
use async_trait::async_trait;
use serde_json::{json, Value};

/// Searches knowledge entries and returns snippets, never full bodies.
pub struct KnowledgeSearchTool;

impl KnowledgeSearchTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for KnowledgeSearchTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for KnowledgeSearchTool {
    fn name(&self) -> &str {
        "KnowledgeSearch"
    }

    async fn description(&self) -> OpcTeamResult<String> {
        Ok(r###"Search this agent's knowledge bases and return short snippets. Use it before answering when the user's question may be covered by stored team knowledge.

Scope rules:
- Search covers only the knowledge bases configured on this agent. Asking for a base the agent does not reference is refused.
- Omitting knowledge_base_id searches every configured base.
- Omit knowledge_base_id when you do not know which base holds the answer.

Query rules:
- Use keywords, not full sentences. Two or three distinctive terms work better than a question.
- Chinese and other non-space-delimited languages match by trigram; a query shorter than three characters falls back to a bounded substring scan.
- An empty query lists recently updated entries instead of searching.

Follow-up:
- Search returns entry_id and a snippet. Read the full body with KnowledgeRead before relying on a detail that the snippet truncates.
- If nothing matches, rephrase with different terms or a shorter phrase before concluding the knowledge base has no answer.
"###.to_string())
    }

    fn short_description(&self) -> String {
        "Search the agent's configured knowledge bases.".to_string()
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords to search for. Empty lists recently updated entries."
                },
                "knowledge_base_id": {
                    "type": "string",
                    "description": "Restrict the search to one configured knowledge base. Omit to search all of them."
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_KNOWLEDGE_QUERY_LIMIT,
                    "description": "Maximum number of entries to return."
                }
            },
            "additionalProperties": false
        })
    }

    fn is_readonly(&self) -> bool {
        true
    }

    fn is_concurrency_safe(&self, _input: Option<&Value>) -> bool {
        true
    }

    fn permission_intents(
        &self,
        _input: &Value,
        context: &ToolUseContext,
    ) -> OpcTeamResult<Vec<PermissionIntent>> {
        let access = resolve_knowledge_access(context);
        access.require_enabled()?;
        Ok(vec![knowledge_permission_intent("read", &access.readable)])
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> OpcTeamResult<Vec<ToolResult>> {
        ensure_local_knowledge_session(context)?;
        let access = resolve_knowledge_access(context);
        access.require_enabled()?;

        let query = input
            .get("query")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let limit = match input.get("limit") {
            None | Some(Value::Null) => None,
            Some(value) => Some(value.as_u64().ok_or_else(|| {
                OpcTeamError::validation("limit must be a positive integer".to_string())
            })? as usize),
        };

        let knowledge_base_ids = match input
            .get("knowledge_base_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|id| !id.is_empty())
        {
            Some(requested) => vec![access.resolve_base(Some(requested))?.to_string()],
            None => access.readable.clone(),
        };

        let database = open_knowledge_database();
        database.initialize().await?;
        let outcome = database
            .search_knowledge_entries(KnowledgeSearchRequest {
                knowledge_base_ids: knowledge_base_ids.clone(),
                query: query.clone(),
                limit,
                ..Default::default()
            })
            .await?;

        let hits = outcome
            .hits
            .iter()
            .map(|hit| {
                json!({
                    "entry_id": hit.entry_id,
                    "knowledge_base_id": hit.knowledge_base_id,
                    "title": hit.title,
                    "snippet": hit.snippet,
                    "updated_at": hit.updated_at_unix_secs,
                })
            })
            .collect::<Vec<_>>();

        let mode = match outcome.mode {
            crate::agentic::knowledge::KnowledgeSearchMode::FullText => "full_text",
            crate::agentic::knowledge::KnowledgeSearchMode::Substring => "substring",
            crate::agentic::knowledge::KnowledgeSearchMode::Recent => "recent",
        };
        let summary = if hits.is_empty() {
            format!(
                "No knowledge entries matched {} in {} configured knowledge base(s).",
                if query.trim().is_empty() {
                    "the recent-entries listing".to_string()
                } else {
                    format!("'{query}'")
                },
                knowledge_base_ids.len()
            )
        } else {
            format!(
                "Found {} knowledge entr{} ({mode}) in {} configured knowledge base(s).",
                hits.len(),
                if hits.len() == 1 { "y" } else { "ies" },
                knowledge_base_ids.len()
            )
        };

        Ok(vec![ToolResult::Result {
            data: json!({
                "success": true,
                "query": query,
                "mode": mode,
                "knowledge_base_ids": knowledge_base_ids,
                "count": hits.len(),
                "hits": hits,
                "summary": summary,
            }),
            result_for_assistant: Some(summary),
            image_attachments: None,
        }])
    }

    fn render_tool_use_message(
        &self,
        input: &Value,
        _options: &crate::agentic::tools::framework::ToolRenderOptions,
    ) -> String {
        match input.get("query").and_then(Value::as_str) {
            Some(query) if !query.trim().is_empty() => format!("Searching knowledge for: {query}"),
            _ => "Listing recent knowledge entries".to_string(),
        }
    }
}
