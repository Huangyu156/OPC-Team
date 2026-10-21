//! Built-in Agent catalog, harness tool defaults, and desktop mode tests.
//!
//! Extracted from the two inline test modules (`mod tests` and
//! `mod desktop_tool_tests`) in `src/agentic/agents/mod.rs` so the tests compile
//! as an independent target instead of as part of the whole crate's test binary.

#![cfg(feature = "agent-runtime")]

use opc_core::agentic::agents::{
    get_embedded_prompt, standard_harness_tools, standard_harness_user_context_policy, Agent,
    ClawMode, CoworkMode, CreativeHarness, ExploreAgent, MinimalHarness, StandardHarness,
    EMBEDDED_PROMPTS,
};
use opc_core::service::config::mode_config_canonicalizer::resolve_effective_tools;
use opc_core::service::config::types::AgentProfileConfig;

#[test]
fn embedded_prompt_catalog_compatibility_export_matches_lookup() {
    assert_eq!(
        EMBEDDED_PROMPTS.get("standard_mode").copied(),
        get_embedded_prompt("standard_mode")
    );
}

#[test]
fn minimal_agent_prompt_resolves_to_embedded_prompt() {
    assert!(
        get_embedded_prompt(MinimalHarness::new().prompt_template_name(None)).is_some(),
        "minimal Agent prompt must resolve through the embedded prompt catalog"
    );
}

#[test]
fn standard_harness_tools_exclude_create_plan_and_include_goal_tools() {
    let tools = standard_harness_tools();

    for collaboration_tool in [
        "AgentSpawn",
        "AgentSendInput",
        "AgentControl",
        "AgentList",
        "AgentWait",
    ] {
        assert!(
            tools.contains(&collaboration_tool.to_string()),
            "missing standard collaboration tool {collaboration_tool}"
        );
    }
    assert!(!tools.contains(&"Task".to_string()));
    assert!(tools.contains(&"ListModels".to_string()));
    assert!(!tools.contains(&"CreatePlan".to_string()));
    assert!(tools.contains(&"get_goal".to_string()));
    assert!(tools.contains(&"update_goal".to_string()));
}

#[test]
fn standard_harness_tools_include_review_platform() {
    let tools = standard_harness_tools();

    assert!(tools.contains(&"ReviewPlatform".to_string()));
}

#[test]
fn standard_harness_tools_keep_canvas_provider_tools_opt_in() {
    let tools = standard_harness_tools();

    assert!(!tools.contains(&"CreateCanvas".to_string()));
    assert!(!tools.contains(&"ReadCanvas".to_string()));
    assert!(!tools.contains(&"UpdateCanvas".to_string()));
    assert!(!tools.contains(&"PatchCanvas".to_string()));
}

#[test]
fn standard_mode_uses_shared_coding_tools() {
    let shared_tools = standard_harness_tools();

    let mut expected = shared_tools;
    expected.push("ComputerUse".to_string());
    assert_eq!(StandardHarness::new().default_tools(), expected);
}

#[test]
fn standard_mode_uses_shared_coding_user_context_policy() {
    let shared_policy = standard_harness_user_context_policy();

    assert_eq!(StandardHarness::new().user_context_policy(), shared_policy);
}

#[test]
fn main_desktop_modes_include_computer_use() {
    let modes: Vec<Box<dyn Agent>> = vec![
        Box::new(ClawMode::new()),
        Box::new(CoworkMode::new()),
        Box::new(StandardHarness::new()),
        Box::new(CreativeHarness::new()),
    ];
    for mode in modes {
        assert!(
            mode.default_tools()
                .iter()
                .any(|name| name == "ComputerUse"),
            "{}",
            mode.id()
        );
    }
    let config = AgentProfileConfig {
        removed_tools: vec!["ComputerUse".to_string()],
        ..Default::default()
    };
    let defaults = ClawMode::new().default_tools();
    let registered = defaults.iter().cloned().collect();
    let resolved = resolve_effective_tools(&defaults, Some(&config), &registered);
    assert!(
        !resolved.iter().any(|name| name == "ComputerUse"),
        "explicit user exclusion wins over the new default"
    );
    assert!(!ExploreAgent::new()
        .default_tools()
        .iter()
        .any(|name| name == "ComputerUse"));
    assert!(!MinimalHarness::new()
        .default_tools()
        .iter()
        .any(|name| name == "ComputerUse"));
    assert!(
        !standard_harness_tools()
            .iter()
            .any(|name| name == "ComputerUse"),
        "external/plugin baseline stays opt-in"
    );
}
