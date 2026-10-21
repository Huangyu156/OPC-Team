//! Claw mode default-tool, context-policy, and prompt-condition tests.
//!
//! Extracted from the inline `#[cfg(test)] mod tests` in
//! `src/agentic/agents/definitions/modes/claw.rs` so the tests compile as an
//! independent target instead of as part of the whole crate's test binary.

#![cfg(feature = "agent-runtime")]

use opc_agent_runtime::prompt::UserContextSection;
use opc_core::agentic::agents::{Agent, ClawMode, PromptBuilderContext};

#[test]
fn claw_mode_excludes_creation_only_tools_from_defaults() {
    let tools = ClawMode::new().default_tools();
    assert!(!tools.contains(&"InitMiniApp".to_string()));
    assert!(!tools.contains(&"FinalizeMiniApp".to_string()));
    assert!(!tools.contains(&"PublishMiniApp".to_string()));
    assert!(!tools.contains(&"FrontendWorkbench".to_string()));
    assert!(tools.contains(&"ListModels".to_string()));
    assert!(tools.contains(&"ListWorkspaces".to_string()));
}

#[test]
fn claw_mode_user_context_policy_includes_memory_summary() {
    assert!(ClawMode::new()
        .user_context_policy()
        .includes(UserContextSection::MemorySummary));
}

#[tokio::test]
async fn claw_prompt_conditions_optional_control_and_session_tools() {
    let prompt = ClawMode::new()
        .get_system_prompt(Some(&PromptBuilderContext::new("/workspace", None, None)))
        .await
        .expect("Claw prompt");

    assert!(prompt.contains("Use only tools in the current tool list"));
    assert!(prompt.contains("only when ControlHub reports an authorized connection"));
    assert!(prompt.contains("only when both tools appear in your current tool list"));
}
