use crate::agentic::agents::{PromptBuilder, PromptBuilderContext, UserContextPolicy};
use crate::agentic::session::{SystemPromptCacheIdentity, UserContextCacheIdentity};
use crate::util::errors::{OpcTeamError, OpcTeamResult};
use opc_agent_runtime::custom_agent::{
    custom_agent_save_markdown_file, CustomAgentDefinition, CustomAgentKind, CustomAgentLevel,
    KnowledgeBaseRef,
};
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub(crate) struct CustomAgentData {
    pub id: String,
    pub name: String,
    pub description: String,
    pub kind: CustomAgentKind,
    pub tools: Vec<String>,
    pub prompt: String,
    pub readonly: bool,
    pub review: bool,
    pub path: String,
    pub level: CustomAgentLevel,
    pub model: String,
    pub model_is_explicit: bool,
    pub user_context_policy: UserContextPolicy,
    pub knowledge_base_refs: Vec<KnowledgeBaseRef>,
}

impl CustomAgentData {
    pub(crate) fn from_definition(path: String, definition: CustomAgentDefinition) -> Self {
        Self {
            id: definition.id,
            name: definition.name,
            description: definition.description,
            kind: definition.kind,
            tools: definition.tools,
            prompt: definition.prompt,
            readonly: definition.readonly,
            review: definition.review,
            path,
            level: definition.level,
            model: definition.model,
            model_is_explicit: definition.model_is_explicit,
            user_context_policy: definition.user_context_policy,
            knowledge_base_refs: definition.knowledge_base_refs,
        }
    }

    pub(crate) fn to_definition(
        &self,
        model: Option<&str>,
        model_is_explicit: Option<bool>,
    ) -> CustomAgentDefinition {
        CustomAgentDefinition {
            id: self.id.clone(),
            name: self.name.clone(),
            description: self.description.clone(),
            kind: self.kind,
            tools: self.tools.clone(),
            prompt: self.prompt.clone(),
            readonly: self.readonly,
            review: self.review,
            level: self.level,
            model: model.unwrap_or(&self.model).to_string(),
            model_is_explicit: model_is_explicit
                .unwrap_or(model.is_some() || self.model_is_explicit),
            user_context_policy: self.user_context_policy.clone(),
            knowledge_base_refs: self.knowledge_base_refs.clone(),
        }
    }

    pub(crate) fn system_prompt_cache_identity(&self) -> SystemPromptCacheIdentity {
        let prompt_hash = hex::encode(Sha256::digest(self.prompt.as_bytes()));
        SystemPromptCacheIdentity::new(format!("custom_prompt_sha256:{prompt_hash}"))
    }

    /// Knowledge references are part of the agent's user-context identity, not
    /// of its rendered prompt. Two agents that share a prompt but attach to
    /// different bases must not reuse one cached user-context entry, and an
    /// agent that references nothing keeps the plain policy key so existing
    /// cache entries stay valid.
    pub(crate) fn user_context_cache_identity(&self) -> UserContextCacheIdentity {
        let policy_key = self.user_context_policy.cache_scope_key();
        if self.knowledge_base_refs.is_empty() {
            return UserContextCacheIdentity::new(policy_key);
        }
        let mut parts: Vec<String> = self
            .knowledge_base_refs
            .iter()
            .map(|reference| format!("{}:{}", reference.id, reference.mode.as_str()))
            .collect();
        parts.sort();
        UserContextCacheIdentity::new(format!("{policy_key}||knowledge:{}", parts.join(",")))
    }

    pub(crate) async fn build_prompt(
        &self,
        context: &PromptBuilderContext,
    ) -> OpcTeamResult<String> {
        let prompt_builder = PromptBuilder::new(context.clone());
        prompt_builder
            .build_prompt_from_template(&self.prompt)
            .await
    }

    pub(crate) fn save_to_file(
        &self,
        model: Option<&str>,
        model_is_explicit: Option<bool>,
    ) -> OpcTeamResult<()> {
        let definition = self.to_definition(model, model_is_explicit);
        custom_agent_save_markdown_file(&self.path, &definition).map_err(OpcTeamError::Agent)
    }
}
