//! Compatibility re-export for skill availability resolution.
//!
//! The provider-neutral owner lives in `opc-agent-runtime`.

pub use opc_agent_runtime::skills::{
    normalize_user_mode_skill_overrides, resolve_skill_default_enabled_for_mode,
    resolve_skill_state_for_mode, ModeSkillState,
};
