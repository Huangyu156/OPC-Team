//! Per-agent knowledge base access scope.
//!
//! An agent's reachable knowledge bases are facts of its definition, not of its
//! prompt. Every tool call resolves the scope here so a model that asks for a
//! base it was never given gets a refusal instead of a result, and so write
//! access stays tied to the declared reference rather than to global read
//! access.
//!
//! Two independent gates narrow an agent to read-only:
//!
//! - the reference itself is `read`, the default, and
//! - the agent is globally read-only (custom modes may be, review subagents
//!   always are).
//!
//! Writes require both to permit them.

use crate::agentic::agents::{get_agent_registry, Agent};
use crate::agentic::tools::framework::ToolUseContext;
use crate::util::errors::{OpcTeamError, OpcTeamResult};
use opc_agent_runtime::custom_agent::{KnowledgeBaseAccessMode, KnowledgeBaseRef};
use serde_json::json;

/// Resolved knowledge scope for one tool call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeAccess {
    /// Bases this call may read, in definition order.
    pub readable: Vec<String>,
    /// Subset of `readable` this call may add or rewrite entries in.
    pub writable: Vec<String>,
    /// The effective agent type that produced this scope.
    pub agent_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KnowledgeAccessError {
    /// The agent declares no knowledge reference at all.
    NotEnabled,
    /// The agent is knowledge-enabled but was not given this base.
    BaseNotInScope { knowledge_base_id: String },
}

impl KnowledgeAccessError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotEnabled => "knowledge_not_enabled",
            Self::BaseNotInScope { .. } => "knowledge_base_not_in_scope",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::NotEnabled => {
                "This agent has no knowledge base configured. Add a knowledge base to the agent's capabilities before using knowledge tools.".to_string()
            }
            Self::BaseNotInScope { knowledge_base_id } => format!(
                "Knowledge base '{knowledge_base_id}' is not referenced by this agent. Only the agent's configured knowledge bases can be used."
            ),
        }
    }

    pub fn to_tool_error(&self) -> OpcTeamError {
        OpcTeamError::tool(
            json!({
                "code": self.code(),
                "message": self.message(),
            })
            .to_string(),
        )
    }
}

impl KnowledgeAccess {
    /// Empty scope used when the knowledge feature is compiled out.
    pub fn none(agent_type: impl Into<String>) -> Self {
        Self {
            readable: Vec::new(),
            writable: Vec::new(),
            agent_type: agent_type.into(),
        }
    }

    pub fn from_refs(
        agent_type: impl Into<String>,
        refs: &[KnowledgeBaseRef],
        read_only_agent: bool,
    ) -> Self {
        let mut readable: Vec<String> = Vec::with_capacity(refs.len());
        let mut writable: Vec<String> = Vec::new();
        for reference in refs {
            if !readable.contains(&reference.id) {
                readable.push(reference.id.clone());
            }
            if !read_only_agent
                && reference.mode == KnowledgeBaseAccessMode::ReadWrite
                && !writable.contains(&reference.id)
            {
                writable.push(reference.id.clone());
            }
        }
        Self {
            readable,
            writable,
            agent_type: agent_type.into(),
        }
    }

    pub fn is_enabled(&self) -> bool {
        !self.readable.is_empty()
    }

    pub fn can_write(&self, knowledge_base_id: &str) -> bool {
        self.writable.iter().any(|id| id == knowledge_base_id)
    }

    pub fn require_enabled(&self) -> OpcTeamResult<()> {
        if self.is_enabled() {
            Ok(())
        } else {
            Err(KnowledgeAccessError::NotEnabled.to_tool_error())
        }
    }

    /// Resolve a caller-supplied base id against the scope.
    ///
    /// An omitted base is only unambiguous for a single-base scope; asking the
    /// model to pick is safer than silently searching the narrowest list it
    /// happens to have first.
    pub fn resolve_base(&self, requested: Option<&str>) -> OpcTeamResult<&str> {
        self.require_enabled()?;
        match requested.map(str::trim).filter(|id| !id.is_empty()) {
            Some(id) => match self.readable.iter().find(|known| *known == id) {
                Some(known) => Ok(known.as_str()),
                None => Err(KnowledgeAccessError::BaseNotInScope {
                    knowledge_base_id: id.to_string(),
                }
                .to_tool_error()),
            },
            None if self.readable.len() == 1 => Ok(&self.readable[0]),
            None => Err(OpcTeamError::tool(
                json!({
                    "code": "knowledge_base_required",
                    "message": "This agent references more than one knowledge base; pass knowledge_base_id.",
                    "available": self.readable,
                })
                .to_string(),
            )),
        }
    }
}

/// Resolve the calling agent's knowledge scope from the tool context.
///
/// The registry is the single source of agent identity here: the context only
/// carries the agent type, and the definition may be hot-reloaded between
/// turns, so reading the definition per call keeps a mid-session edit
/// authoritative.
pub fn resolve_knowledge_access(context: &ToolUseContext) -> KnowledgeAccess {
    let Some(agent_type) = context.agent_type.as_deref() else {
        return KnowledgeAccess::none("");
    };
    let registry = get_agent_registry();
    let Some(agent) = registry.get_agent(agent_type, context.workspace_id()) else {
        return KnowledgeAccess::none(agent_type);
    };
    access_for_agent(agent_type, agent.as_ref())
}

fn access_for_agent(agent_type: &str, agent: &dyn Agent) -> KnowledgeAccess {
    KnowledgeAccess::from_refs(agent_type, agent.knowledge_base_refs(), agent.is_readonly())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn refs(entries: &[(&str, KnowledgeBaseAccessMode)]) -> Vec<KnowledgeBaseRef> {
        entries
            .iter()
            .map(|(id, mode)| KnowledgeBaseRef {
                id: (*id).to_string(),
                mode: *mode,
            })
            .collect()
    }

    #[test]
    fn no_references_means_the_agent_is_not_knowledge_enabled() {
        let access = KnowledgeAccess::from_refs("Standard", &[], false);

        assert!(!access.is_enabled());
        assert_eq!(
            access
                .require_enabled()
                .unwrap_err()
                .to_string()
                .contains("knowledge_not_enabled"),
            true
        );
    }

    #[test]
    fn readwrite_reference_grants_write_only_to_that_base() {
        let access = KnowledgeAccess::from_refs(
            "Assistant",
            &refs(&[
                ("product-docs", KnowledgeBaseAccessMode::Read),
                ("team-notes", KnowledgeBaseAccessMode::ReadWrite),
            ]),
            false,
        );

        assert!(access.can_write("team-notes"));
        assert!(!access.can_write("product-docs"));
        assert_eq!(access.readable, vec!["product-docs", "team-notes"]);
        assert_eq!(access.writable, vec!["team-notes"]);
    }

    #[test]
    fn globally_readonly_agent_cannot_write_even_with_readwrite_reference() {
        let access = KnowledgeAccess::from_refs(
            "Reviewer",
            &refs(&[("team-notes", KnowledgeBaseAccessMode::ReadWrite)]),
            true,
        );

        assert_eq!(access.readable, vec!["team-notes"]);
        assert!(access.writable.is_empty());
        assert!(!access.can_write("team-notes"));
    }

    #[test]
    fn unlisted_base_is_rejected_instead_of_widening_to_all_bases() {
        let access = KnowledgeAccess::from_refs(
            "Assistant",
            &refs(&[("product-docs", KnowledgeBaseAccessMode::Read)]),
            false,
        );

        let error = access.resolve_base(Some("secret-notes")).unwrap_err();

        assert!(error.to_string().contains("knowledge_base_not_in_scope"));
    }

    #[test]
    fn omitted_base_resolves_only_when_the_scope_has_one() {
        let single = KnowledgeAccess::from_refs(
            "Assistant",
            &refs(&[("product-docs", KnowledgeBaseAccessMode::Read)]),
            false,
        );
        assert_eq!(
            single.resolve_base(None).expect("single scope resolves"),
            "product-docs"
        );

        let multiple = KnowledgeAccess::from_refs(
            "Assistant",
            &refs(&[
                ("product-docs", KnowledgeBaseAccessMode::Read),
                ("team-notes", KnowledgeBaseAccessMode::Read),
            ]),
            false,
        );
        assert!(multiple.resolve_base(None).is_err());
    }
}
