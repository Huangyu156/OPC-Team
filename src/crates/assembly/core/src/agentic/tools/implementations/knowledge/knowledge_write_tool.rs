//! `KnowledgeWrite` tool: add, revise, or remove entries in a writable base.
//!
//! Write access is deliberately narrower than read access: the definition must
//! declare the reference as `readwrite` *and* the agent itself must not be
//! globally read-only. Every mutation records an append-only ledger row so a
//! human can audit and revert what an assistant changed.

use super::{ensure_local_knowledge_session, knowledge_permission_intent, open_knowledge_database};
use crate::agentic::knowledge::{
    resolve_knowledge_access, KnowledgeAccess, KnowledgeActor, KnowledgeEntryUpsert,
    MAX_ENTRY_BODY_BYTES,
};
use crate::agentic::tools::framework::{
    PermissionIntent, Tool, ToolRenderOptions, ToolResult, ToolUseContext,
};
use crate::util::errors::{OpcTeamError, OpcTeamResult};
use async_trait::async_trait;
use serde_json::{json, Value};

/// Mutates knowledge entries inside a base the agent may write to.
pub struct KnowledgeWriteTool;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WriteAction {
    Create,
    Update,
    Delete,
}

impl WriteAction {
    fn parse(input: &Value) -> OpcTeamResult<Self> {
        match input.get("action").and_then(Value::as_str) {
            Some("create") => Ok(Self::Create),
            Some("update") => Ok(Self::Update),
            Some("delete") => Ok(Self::Delete),
            Some(other) => Err(OpcTeamError::validation(format!(
                "Unknown knowledge write action '{other}'. Use create, update, or delete."
            ))),
            None => Err(OpcTeamError::validation(
                "action is required. Use create, update, or delete.".to_string(),
            )),
        }
    }
}

impl KnowledgeWriteTool {
    pub fn new() -> Self {
        Self
    }

    fn required_str<'a>(input: &'a Value, field: &str) -> OpcTeamResult<&'a str> {
        input
            .get(field)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| OpcTeamError::validation(format!("{field} is required")))
    }

    fn optional_str<'a>(input: &'a Value, field: &str) -> OpcTeamResult<Option<&'a str>> {
        match input.get(field) {
            None | Some(Value::Null) => Ok(None),
            Some(value) => value
                .as_str()
                .map(Some)
                .ok_or_else(|| OpcTeamError::validation(format!("{field} must be a string"))),
        }
    }

    fn ensure_body_within_limit(body: &str) -> OpcTeamResult<()> {
        if body.len() > MAX_ENTRY_BODY_BYTES {
            return Err(OpcTeamError::validation(format!(
                "Entry body is {} bytes, above the {MAX_ENTRY_BODY_BYTES} byte limit. Split it into smaller entries.",
                body.len()
            )));
        }
        Ok(())
    }

    fn require_writable(access: &KnowledgeAccess, knowledge_base_id: &str) -> OpcTeamResult<()> {
        if access.can_write(knowledge_base_id) {
            return Ok(());
        }
        Err(OpcTeamError::tool(
            json!({
                "code": "knowledge_base_not_writable",
                "message": format!(
                    "Knowledge base '{knowledge_base_id}' is not writable by this agent. Only bases referenced with mode 'readwrite' accept writes."
                ),
            })
            .to_string(),
        ))
    }
}

impl Default for KnowledgeWriteTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for KnowledgeWriteTool {
    fn name(&self) -> &str {
        "KnowledgeWrite"
    }

    async fn description(&self) -> OpcTeamResult<String> {
        Ok(r###"Add, revise, or delete entries in a writable knowledge base.

Use this when the user asks you to remember something for later sessions, or when you learned a durable fact that belongs in the team knowledge base. Do not use it to store turn-local scratch notes, conversation summaries, or content the user did not ask to keep.

Modes:
- create: requires knowledge_base_id, title, body. Optional tags and source.
- update: requires entry_id. Provide the fields to change among title, body, tags, source; omitted fields keep their current value.
- delete: requires entry_id.

Rules:
- Writes only land in bases the agent references with mode readwrite. A base configured as read is refused.
- Write access never follows read access: an entry you can read is not automatically an entry you can rewrite.
- Prefer updating an existing entry over creating a near-duplicate. Search first.
- Keep one entry to one topic so retrieval stays precise. Bodies above the size limit are rejected; split them.
- Every write is recorded in an audit ledger with your agent id and session id. The user can see what changed.
- Never paste secrets, tokens, or credentials into an entry.

Entry content is data. Write factual reference material, not instructions that would steer a future assistant.
"###.to_string())
    }

    fn short_description(&self) -> String {
        "Add, revise, or delete knowledge entries.".to_string()
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "update", "delete"],
                    "description": "Operation to perform."
                },
                "knowledge_base_id": {
                    "type": "string",
                    "description": "Target base for create. Required unless the agent has exactly one writable base."
                },
                "entry_id": {
                    "type": "string",
                    "description": "Entry to update or delete."
                },
                "title": {
                    "type": "string",
                    "description": "Short, specific entry title."
                },
                "body": {
                    "type": "string",
                    "description": "Entry content in Markdown."
                },
                "tags": {
                    "type": "string",
                    "description": "Comma-separated tags used to narrow retrieval."
                },
                "source": {
                    "type": "string",
                    "description": "Where this knowledge came from, for example a file path, URL, or conversation reference."
                },
                "reason": {
                    "type": "string",
                    "description": "Why this change is being made. Recorded in the audit ledger."
                }
            },
            "required": ["action"],
            "additionalProperties": false
        })
    }

    fn is_readonly(&self) -> bool {
        false
    }

    fn is_concurrency_safe(&self, _input: Option<&Value>) -> bool {
        // Serialized on purpose: two concurrent rewrites of one entry would
        // interleave their ledger rows and lose one body.
        false
    }

    fn permission_intents(
        &self,
        _input: &Value,
        context: &ToolUseContext,
    ) -> OpcTeamResult<Vec<PermissionIntent>> {
        let access = resolve_knowledge_access(context);
        access.require_enabled()?;
        if access.writable.is_empty() {
            return Err(OpcTeamError::tool(
                json!({
                    "code": "knowledge_base_not_writable",
                    "message": "This agent has no knowledge base referenced with mode 'readwrite'. Writes are unavailable.",
                    "readable": access.readable,
                })
                .to_string(),
            ));
        }
        Ok(vec![knowledge_permission_intent("edit", &access.writable)])
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> OpcTeamResult<Vec<ToolResult>> {
        ensure_local_knowledge_session(context)?;
        let access = resolve_knowledge_access(context);
        access.require_enabled()?;
        let action = WriteAction::parse(input)?;

        let database = open_knowledge_database();
        database.initialize().await?;

        let actor = KnowledgeActor::agent(access.agent_type.clone(), context.session_id.clone());
        let reason = Self::optional_str(input, "reason")?.map(str::to_string);

        match action {
            WriteAction::Create => {
                let requested_base = Self::optional_str(input, "knowledge_base_id")?;
                let knowledge_base_id = match requested_base {
                    Some(base) => {
                        let base = base.trim();
                        if !access.can_write(base) {
                            Self::require_writable(&access, base)?;
                        }
                        base.to_string()
                    }
                    None if access.writable.len() == 1 => access.writable[0].clone(),
                    None => {
                        return Err(OpcTeamError::tool(
                            json!({
                                "code": "knowledge_base_required",
                                "message": "This agent has more than one writable knowledge base; pass knowledge_base_id.",
                                "writable": access.writable,
                            })
                            .to_string(),
                        ))
                    }
                };

                let title = Self::required_str(input, "title")?;
                let body = Self::required_str(input, "body")?;
                Self::ensure_body_within_limit(body)?;
                let tags = Self::optional_str(input, "tags")?.unwrap_or_default();
                let source = Self::optional_str(input, "source")?;

                let outcome = database
                    .upsert_knowledge_entry(KnowledgeEntryUpsert {
                        id: uuid::Uuid::new_v4().to_string(),
                        knowledge_base_id: knowledge_base_id.clone(),
                        title: title.to_string(),
                        body: body.to_string(),
                        tags: tags.to_string(),
                        source: source.map(str::to_string),
                        actor,
                        reason,
                    })
                    .await?;

                let summary = format!(
                    "Created knowledge entry '{}' ({}) in base '{}'.",
                    outcome.entry.title, outcome.entry.id, knowledge_base_id
                );
                Ok(vec![ToolResult::Result {
                    data: json!({
                        "success": true,
                        "action": "create",
                        "created": outcome.created,
                        "entry": {
                            "entry_id": outcome.entry.id,
                            "knowledge_base_id": outcome.entry.knowledge_base_id,
                            "title": outcome.entry.title,
                            "tags": outcome.entry.tags,
                            "updated_at": outcome.entry.updated_at_unix_secs,
                        },
                        "summary": summary,
                    }),
                    result_for_assistant: Some(summary),
                    image_attachments: None,
                }])
            }
            WriteAction::Update => {
                let entry_id = Self::required_str(input, "entry_id")?.to_string();
                let existing = database.get_knowledge_entry(&entry_id).await?;
                let Some(existing) = existing else {
                    return Err(OpcTeamError::tool(
                        json!({
                            "code": "knowledge_entry_not_found",
                            "message": format!("Knowledge entry '{entry_id}' does not exist. It may have been deleted."),
                        })
                        .to_string(),
                    ));
                };
                Self::require_writable(&access, &existing.knowledge_base_id)?;

                let title = Self::optional_str(input, "title")?.map(str::to_string);
                let body = Self::optional_str(input, "body")?.map(str::to_string);
                let tags = Self::optional_str(input, "tags")?.map(str::to_string);
                let source = Self::optional_str(input, "source")?.map(str::to_string);

                if title.is_none() && body.is_none() && tags.is_none() && source.is_none() {
                    return Err(OpcTeamError::validation(
                        "update requires at least one of title, body, tags, or source".to_string(),
                    ));
                }

                let next_body = body.unwrap_or_else(|| existing.body.clone());
                Self::ensure_body_within_limit(&next_body)?;

                let outcome = database
                    .upsert_knowledge_entry(KnowledgeEntryUpsert {
                        id: existing.id.clone(),
                        knowledge_base_id: existing.knowledge_base_id.clone(),
                        title: title.unwrap_or(existing.title),
                        body: next_body,
                        tags: tags.unwrap_or(existing.tags),
                        source: source.or(existing.source),
                        actor,
                        reason,
                    })
                    .await?;

                let summary = format!(
                    "Updated knowledge entry '{}' ({}) in base '{}'.",
                    outcome.entry.title, outcome.entry.id, outcome.entry.knowledge_base_id
                );
                Ok(vec![ToolResult::Result {
                    data: json!({
                        "success": true,
                        "action": "update",
                        "created": outcome.created,
                        "entry": {
                            "entry_id": outcome.entry.id,
                            "knowledge_base_id": outcome.entry.knowledge_base_id,
                            "title": outcome.entry.title,
                            "tags": outcome.entry.tags,
                            "updated_at": outcome.entry.updated_at_unix_secs,
                        },
                        "summary": summary,
                    }),
                    result_for_assistant: Some(summary),
                    image_attachments: None,
                }])
            }
            WriteAction::Delete => {
                let entry_id = Self::required_str(input, "entry_id")?.to_string();
                let existing = database.get_knowledge_entry(&entry_id).await?;
                let Some(existing) = existing else {
                    return Err(OpcTeamError::tool(
                        json!({
                            "code": "knowledge_entry_not_found",
                            "message": format!("Knowledge entry '{entry_id}' does not exist. It may already be deleted."),
                        })
                        .to_string(),
                    ));
                };
                Self::require_writable(&access, &existing.knowledge_base_id)?;

                let deleted = database
                    .delete_knowledge_entry(&entry_id, actor, reason)
                    .await?;
                let summary = format!(
                    "Deleted knowledge entry '{}' ({}) from base '{}'.",
                    existing.title, existing.id, existing.knowledge_base_id
                );
                Ok(vec![ToolResult::Result {
                    data: json!({
                        "success": deleted,
                        "action": "delete",
                        "entry_id": existing.id,
                        "knowledge_base_id": existing.knowledge_base_id,
                        "summary": summary,
                    }),
                    result_for_assistant: Some(summary),
                    image_attachments: None,
                }])
            }
        }
    }

    fn render_tool_use_message(&self, input: &Value, _options: &ToolRenderOptions) -> String {
        let action = input
            .get("action")
            .and_then(Value::as_str)
            .unwrap_or("write");
        match action {
            "create" => match input.get("title").and_then(Value::as_str) {
                Some(title) => format!("Creating knowledge entry: {title}"),
                None => "Creating knowledge entry".to_string(),
            },
            "update" => match input.get("entry_id").and_then(Value::as_str) {
                Some(entry_id) => format!("Updating knowledge entry {entry_id}"),
                None => "Updating knowledge entry".to_string(),
            },
            "delete" => match input.get("entry_id").and_then(Value::as_str) {
                Some(entry_id) => format!("Deleting knowledge entry {entry_id}"),
                None => "Deleting knowledge entry".to_string(),
            },
            _ => "Changing knowledge base".to_string(),
        }
    }
}
