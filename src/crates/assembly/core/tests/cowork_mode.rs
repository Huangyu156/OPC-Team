//! Cowork mode default-tool contract tests.
//!
//! Extracted from the inline `#[cfg(test)] mod tests` in
//! `src/agentic/agents/definitions/modes/cowork.rs` so the tests compile as an
//! independent target instead of as part of the whole crate's test binary.

#![cfg(feature = "agent-runtime")]

use opc_core::agentic::agents::{Agent, CoworkMode};

#[test]
fn cowork_mode_includes_goal_lifecycle_tools_in_defaults() {
    let tools = CoworkMode::new().default_tools();
    for tool in ["get_goal", "create_goal", "update_goal"] {
        assert!(tools.contains(&tool.to_string()));
    }
}

#[test]
fn cowork_mode_can_schedule_recurring_work() {
    // Asked to sweep a set of channels every 30 minutes, this mode used to
    // reply that it had no cron tool — accurately, because Cron was not in
    // its list — and fall back to chaining long waits.
    let tools = CoworkMode::new().default_tools();
    assert!(tools.contains(&"Cron".to_string()));
}

#[test]
fn cowork_mode_excludes_creation_only_tools_from_defaults() {
    let tools = CoworkMode::new().default_tools();
    assert!(!tools.contains(&"InitMiniApp".to_string()));
    assert!(!tools.contains(&"FinalizeMiniApp".to_string()));
    assert!(!tools.contains(&"PublishMiniApp".to_string()));
    assert!(!tools.contains(&"FrontendWorkbench".to_string()));
    assert!(tools.contains(&"ListModels".to_string()));
}
