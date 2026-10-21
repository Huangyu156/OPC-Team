//! Prompt builder ordering, remote execution hint, and tool listing tests.
//!
//! Extracted from the inline `#[cfg(test)] mod tests` in
//! `src/agentic/agents/prompt_builder/prompt_builder_impl.rs` so the tests
//! compile as an independent target instead of as part of the whole crate's
//! test binary.

#![cfg(feature = "agent-runtime")]

use opc_core::agentic::agents::{
    build_prompt_context_for_workspace, PromptBuilder, PromptBuilderContext, RemoteExecutionHints,
    RuntimeContextNeeds, ToolListingSections, UserContextPolicy,
};
use opc_core::agentic::WorkspaceBinding;
use opc_core::service::workspace::RelatedPath;
use opc_core_types::product_identity::hidden_data_directory;
use opc_core_types::{SessionExecutionTarget, SessionExecutionTargetKind, WorktreeLifecycle};
use std::path::PathBuf;

#[tokio::test]
async fn builds_ordered_prepended_reminders_from_tool_listings_and_user_context() {
    let tool_sections = ToolListingSections {
        skill_listing: Some("<available_skills>\n- pdf\n</available_skills>".to_string()),
        agent_listing: Some("<available_agents>\n- Explore\n</available_agents>".to_string()),
        direct_tool_listing: Some(
            "<direct_tools>\n- Read\n- GetToolSpec\n- CallDeferredTool\n</direct_tools>"
                .to_string(),
        ),
        deferred_tool_listing: Some("<deferred_tools>\n- WebFetch\n</deferred_tools>".to_string()),
    };
    let context = PromptBuilderContext::new(r"workspace\root", None, None)
        .with_tool_listing_sections(tool_sections)
        .with_runtime_context_needs(RuntimeContextNeeds::from_tool_names(["Read"]));
    let reminders = PromptBuilder::new(context)
        .build_prepended_reminders(
            &UserContextPolicy::empty()
                .with_workspace_context()
                .with_workspace_instructions(),
        )
        .await;
    let reminders_for_order = reminders.clone();
    let ordered_reminders = reminders_for_order.ordered_reminders();

    let skill_listing = reminders
        .skill_listing
        .expect("skill listing reminder should build");
    let agent_listing = reminders
        .agent_listing
        .expect("agent listing reminder should build");
    let deferred_tool_listing = reminders
        .deferred_tool_listing
        .expect("deferred tool listing reminder should build");
    let user_context = reminders.user_context.expect("user context should build");
    let runtime_context = reminders
        .runtime_context
        .expect("runtime context should build");

    assert!(skill_listing.contains("# Skill Listing"));
    assert!(skill_listing
        .contains("A skill is a set of instructions provided through a `SKILL.md` source."));
    assert!(skill_listing.contains("<available_skills>"));
    assert!(!skill_listing.contains("# Agent Listing"));
    assert!(agent_listing.contains("# Agent Listing"));
    assert!(agent_listing.contains("<available_agents>"));
    assert!(!agent_listing.contains("# Tool Calling Guide"));
    assert!(deferred_tool_listing.contains("# Tool Calling Guide"));
    assert!(deferred_tool_listing.contains("## Direct tools"));
    assert!(deferred_tool_listing.contains("<direct_tools>"));
    assert!(deferred_tool_listing.contains("## Deferred tools"));
    assert!(deferred_tool_listing.contains("<deferred_tools>"));
    assert!(user_context.contains("# User Context"));
    assert!(user_context.contains("As you answer the user's questions"));
    assert!(user_context.contains("Current Working Directory: workspace/root"));
    assert!(runtime_context.contains("# Runtime Context"));
    assert!(runtime_context.contains("## Workspace Execution"));
    assert!(
        runtime_context.contains("Workspace file and shell tools operate on the local filesystem")
    );
    assert!(!runtime_context.contains("## ExecCommand Shell"));
    assert!(!runtime_context.contains("## Local Client"));
    assert!(!runtime_context.contains("ExecCommand shell:"));
    assert_eq!(
        ordered_reminders,
        vec![
            deferred_tool_listing.as_str(),
            skill_listing.as_str(),
            agent_listing.as_str(),
            runtime_context.as_str(),
            user_context.as_str(),
        ]
    );
}

#[tokio::test]
async fn prepended_reminders_omit_runtime_context_without_runtime_tool_needs() {
    let context = PromptBuilderContext::new(r"workspace\root", None, None);
    let reminders = PromptBuilder::new(context)
        .build_prepended_reminders(&UserContextPolicy::empty())
        .await;

    assert_eq!(reminders.skill_listing, None);
    assert_eq!(reminders.agent_listing, None);
    assert_eq!(reminders.deferred_tool_listing, None);
    assert_eq!(reminders.user_context, None);
    assert_eq!(reminders.runtime_context, None);
}

#[tokio::test]
async fn runtime_context_includes_workspace_info_for_workspace_tools() {
    let context = PromptBuilderContext::new(r"workspace\root", None, None)
        .with_runtime_context_needs(RuntimeContextNeeds::from_tool_names(["Read"]));
    let runtime_context = PromptBuilder::new(context)
        .build_runtime_context_reminder()
        .await
        .expect("runtime context should build");

    assert!(runtime_context.contains("# Runtime Context"));
    assert!(runtime_context.contains("## Workspace Execution"));
    assert!(
        runtime_context.contains("Workspace file and shell tools operate on the local filesystem")
    );
    assert!(!runtime_context.contains("## ExecCommand Shell"));
    assert!(!runtime_context.contains("## Local Client"));
    assert!(!runtime_context.contains("ExecCommand shell:"));
}

#[tokio::test]
async fn runtime_context_includes_shell_info_when_exec_command_is_available() {
    let context = PromptBuilderContext::new(r"workspace\root", None, None)
        .with_runtime_context_needs(RuntimeContextNeeds::from_tool_names(["ExecCommand"]));
    let runtime_context = PromptBuilder::new(context)
        .build_runtime_context_reminder()
        .await
        .expect("runtime context should build");

    assert!(runtime_context.contains("# Runtime Context"));
    assert!(runtime_context.contains("## Workspace Execution"));
    assert!(runtime_context.contains("## ExecCommand Shell"));
    assert!(runtime_context.contains("ExecCommand shell:"));
    assert!(runtime_context.contains("invoked as `"));
    assert!(!runtime_context.contains("## Local Client"));
}

#[tokio::test]
async fn runtime_context_includes_computer_use_info_only_when_needed() {
    let context = PromptBuilderContext::new(r"workspace\root", None, None)
        .with_runtime_context_needs(RuntimeContextNeeds::from_tool_names(["ComputerUse"]));
    let runtime_context = PromptBuilder::new(context)
        .build_runtime_context_reminder()
        .await
        .expect("runtime context should build");

    assert!(runtime_context.contains("## Local Client"));
    assert!(runtime_context.contains("Local OPC-Team client OS:"));
    assert!(runtime_context.contains("Computer use / keyboard"));
    assert!(!runtime_context.contains("## Workspace Execution"));
    assert!(!runtime_context.contains("## ExecCommand Shell"));
    assert!(!runtime_context.contains("ExecCommand shell:"));
}

#[tokio::test]
async fn runtime_context_includes_text_only_computer_use_guidance_for_non_visual_models() {
    let context = PromptBuilderContext::new(r"workspace\root", None, None)
        .with_supports_image_understanding(false)
        .with_runtime_context_needs(RuntimeContextNeeds::from_tool_names(["ComputerUse"]));
    let runtime_context = PromptBuilder::new(context)
        .build_runtime_context_reminder()
        .await
        .expect("runtime context should build");

    assert!(runtime_context.contains("## Computer Use Input Strategy"));
    assert!(runtime_context.contains("primary model does not accept image inputs"));
    assert!(runtime_context.contains("do not use `screenshot`"));
    assert!(runtime_context.contains("prefer `snapshot` then click by `@e*` ref"));
}

#[tokio::test]
async fn runtime_context_omits_text_only_computer_use_guidance_for_visual_models() {
    let context = PromptBuilderContext::new(r"workspace\root", None, None)
        .with_supports_image_understanding(true)
        .with_runtime_context_needs(RuntimeContextNeeds::from_tool_names(["ComputerUse"]));
    let runtime_context = PromptBuilder::new(context)
        .build_runtime_context_reminder()
        .await
        .expect("runtime context should build");

    assert!(runtime_context.contains("## Local Client"));
    assert!(!runtime_context.contains("## Computer Use Input Strategy"));
    assert!(!runtime_context.contains("primary model does not accept image inputs"));
}

#[tokio::test]
async fn system_prompt_template_does_not_append_text_only_computer_use_guidance() {
    let context = PromptBuilderContext::new(r"workspace\root", None, None)
        .with_supports_image_understanding(false)
        .with_runtime_context_needs(RuntimeContextNeeds::from_tool_names(["ComputerUse"]));
    let prompt = PromptBuilder::new(context)
        .build_prompt_from_template("Base system prompt")
        .await
        .expect("prompt should build");

    assert_eq!(prompt, "Base system prompt");
    assert!(!prompt.contains("Computer Use Input Strategy"));
    assert!(!prompt.contains("primary model does not accept image inputs"));
}

#[tokio::test]
async fn runtime_context_omits_workspace_root_for_remote_execution() {
    let context = PromptBuilderContext::new("/workspace/project", None, None)
        .with_runtime_context_needs(RuntimeContextNeeds::from_tool_names([
            "Read",
            "ExecCommand",
            "ComputerUse",
        ]))
        .with_remote_prompt_overlay(
            RemoteExecutionHints {
                connection_display_name: "dev-server".to_string(),
                kernel_name: "Linux".to_string(),
                hostname: "devbox".to_string(),
            },
            None,
        );
    let runtime_context = PromptBuilder::new(context)
        .build_runtime_context_reminder()
        .await
        .expect("runtime context should build");

    assert!(
        runtime_context.contains("Workspace file and shell tools operate on remote SSH connection")
    );
    assert!(runtime_context.contains("## Workspace Execution"));
    assert!(runtime_context.contains("## ExecCommand Shell"));
    assert!(runtime_context.contains("## Local Client"));
    assert!(runtime_context.contains("Local OPC-Team client OS:"));
    assert!(runtime_context.contains("Computer use and UI automation operate on the local OPC-Team desktop, even when workspace file and shell tools target a remote host."));
    assert!(runtime_context.contains("ExecCommand uses the remote user's default POSIX shell"));
    assert!(runtime_context.contains("This session operates on the remote SSH host only"));
}

#[tokio::test]
async fn runtime_context_omits_local_client_os_for_remote_with_only_control_hub() {
    // Simulates a remote workspace where ComputerUse is disabled (filtered
    // out by is_available_in_context) but ControlHub remains available.
    // The agent must NOT see "Local OPC-Team client OS" because that signal
    // causes it to mistake the client OS for the workspace execution OS.
    let context = PromptBuilderContext::new("/workspace/project", None, None)
        .with_runtime_context_needs(RuntimeContextNeeds::from_tool_names([
            "Read",
            "ExecCommand",
            "ControlHub",
        ]))
        .with_remote_prompt_overlay(
            RemoteExecutionHints {
                connection_display_name: "dev-server".to_string(),
                kernel_name: "Linux".to_string(),
                hostname: "devbox".to_string(),
            },
            None,
        );
    let runtime_context = PromptBuilder::new(context)
        .build_runtime_context_reminder()
        .await
        .expect("runtime context should build");

    assert!(
        runtime_context.contains("Workspace file and shell tools operate on remote SSH connection")
    );
    assert!(runtime_context.contains("## ExecCommand Shell"));
    assert!(!runtime_context.contains("## Local Client"));
    assert!(!runtime_context.contains("Local OPC-Team client OS:"));
}

#[tokio::test]
async fn remote_user_context_keeps_port_resolved_workspace_instructions() {
    let context = PromptBuilderContext::new("/workspace/project", None, None)
        .with_remote_prompt_overlay(
            RemoteExecutionHints {
                connection_display_name: "dev-server".to_string(),
                kernel_name: "Linux".to_string(),
                hostname: "devbox".to_string(),
            },
            None,
        )
        .with_workspace_instruction_files_context(Some(
            "## Codebase and user instructions\n\n<document name=\"AGENTS.md\">\nremote rules\n</document>"
                .to_string(),
        ));

    let user_context = PromptBuilder::new(context)
        .build_user_context_reminder(&UserContextPolicy::empty().with_workspace_instructions())
        .await
        .expect("remote instructions should be rendered");

    assert!(user_context.contains("remote rules"));
    assert!(user_context.contains("AGENTS.md"));
}

#[tokio::test]
async fn resolved_empty_instruction_context_does_not_fall_back_to_local_disk() {
    let temp = tempfile::tempdir().expect("tempdir");
    std::fs::write(temp.path().join("AGENTS.md"), "stale direct-disk rules\n")
        .expect("agents file");
    let context = PromptBuilderContext::new(temp.path().to_string_lossy().to_string(), None, None)
        .with_workspace_instruction_files_context(None);

    let user_context = PromptBuilder::new(context)
        .build_user_context_reminder(&UserContextPolicy::empty().with_workspace_instructions())
        .await;

    assert!(user_context.is_none());
}

#[tokio::test]
async fn local_terminal_transcript_placeholder_includes_the_agents_path() {
    let context = PromptBuilderContext::new("workspace/root", None, None);
    let prompt = PromptBuilder::new(context)
        .build_prompt_from_template("{READ_TERMINAL}")
        .await
        .expect("prompt should build");
    let expected_path = opc_core::infrastructure::try_get_path_manager_arc()
        .expect("path manager should initialize")
        .user_data_dir()
        .join("terminals")
        .join("AGENTS.md")
        .to_string_lossy()
        .replace('\\', "/");

    assert!(prompt.contains(&expected_path));
    assert!(prompt.contains(
        "The user refers to a command, terminal operation, or result they previously ran or observed."
    ));
    assert!(
        prompt.contains("The user reports a command-line, build, test, script, or process problem")
    );
    assert!(prompt.contains("Do not inspect it routinely"));
}

#[tokio::test]
async fn remote_terminal_transcript_placeholder_is_omitted() {
    let context = PromptBuilderContext::new("/workspace/project", None, None)
        .with_remote_prompt_overlay(
            RemoteExecutionHints {
                connection_display_name: "dev-server".to_string(),
                kernel_name: "Linux".to_string(),
                hostname: "devbox".to_string(),
            },
            None,
        );
    let prompt = PromptBuilder::new(context)
        .build_prompt_from_template("before\n{READ_TERMINAL}\nafter")
        .await
        .expect("prompt should build");

    assert!(!prompt.contains("User terminal transcript"));
    assert!(!prompt.contains("{READ_TERMINAL}"));
    assert_eq!(prompt, "before\n\nafter");
}

#[tokio::test]
async fn template_without_terminal_transcript_placeholder_is_unchanged() {
    let context = PromptBuilderContext::new("workspace/root", None, None);
    let prompt = PromptBuilder::new(context)
        .build_prompt_from_template("plain template")
        .await
        .expect("prompt should build");

    assert_eq!(prompt, "plain template");
}

#[tokio::test]
async fn deep_research_report_link_defaults_to_workspace_relative_path() {
    let context = PromptBuilderContext::new("workspace/root", Some("session-1".to_string()), None);
    let prompt = PromptBuilder::new(context)
        .build_prompt_from_template("[View full report]({DEEP_RESEARCH_REPORT_LINK})")
        .await
        .expect("prompt should build");

    assert_eq!(
        prompt,
        format!(
            "[View full report]({}/sessions/session-1/research/report.md)",
            hidden_data_directory()
        )
    );
}

#[tokio::test]
async fn deep_research_report_link_uses_computer_scheme_for_remote_delivery() {
    let context = PromptBuilderContext::new("workspace/root", Some("session-1".to_string()), None)
        .with_remote_file_delivery_channel(true);
    let prompt = PromptBuilder::new(context)
        .build_prompt_from_template("[View full report]({DEEP_RESEARCH_REPORT_LINK})")
        .await
        .expect("prompt should build");

    assert_eq!(
        prompt,
        format!(
            "[View full report](computer://{}/sessions/session-1/research/report.md)",
            hidden_data_directory()
        )
    );
}

#[tokio::test]
async fn memory_summary_is_skipped_for_remote_workspace() {
    let context = PromptBuilderContext::new("/workspace/project", None, None)
        .with_remote_prompt_overlay(
            RemoteExecutionHints {
                connection_display_name: "dev-server".to_string(),
                kernel_name: "Linux".to_string(),
                hostname: "devbox".to_string(),
            },
            None,
        );
    let reminder = PromptBuilder::new(context)
        .build_user_context_reminder(&UserContextPolicy::empty().with_memory_summary())
        .await;

    assert!(reminder.is_none());
}

#[test]
fn workspace_context_renders_related_directories() {
    let context =
        PromptBuilderContext::new(r"workspace\root", None, None).with_related_paths(vec![
            RelatedPath {
                path: r"legacy-ts\client".to_string(),
                description: Some("Legacy TypeScript implementation".to_string()),
            },
            RelatedPath {
                path: r"monorepo\billing".to_string(),
                description: Some("Billing package".to_string()),
            },
        ]);

    let workspace_context = PromptBuilder::new(context).get_workspace_context();

    assert!(workspace_context.contains("Related directories"));
    assert!(workspace_context.contains("legacy-ts/client"));
    assert!(workspace_context.contains("Legacy TypeScript implementation"));
    assert!(workspace_context.contains("monorepo/billing"));
}

#[test]
fn workspace_context_renders_related_directories_without_description() {
    let context =
        PromptBuilderContext::new(r"workspace\root", None, None).with_related_paths(vec![
            RelatedPath {
                path: r"monorepo\packages\payments".to_string(),
                description: None,
            },
        ]);

    let workspace_context = PromptBuilder::new(context).get_workspace_context();

    assert!(workspace_context.contains("Related directories"));
    assert!(workspace_context.contains("  - monorepo/packages/payments"));
    assert!(!workspace_context.contains("payments —"));
}

#[tokio::test]
async fn workspace_context_identifies_the_managed_worktree_binding() {
    let execution_target = SessionExecutionTarget {
        kind: SessionExecutionTargetKind::ManagedWorktree,
        worktree_id: Some("wt-1".to_string()),
        root_path: "/managed/OPC-Team-wt-1".to_string(),
        base_ref: Some("HEAD".to_string()),
        base_commit: Some("0123456789abcdef".to_string()),
        branch: None,
        lifecycle: Some(WorktreeLifecycle::Managed),
    };
    let workspace = WorkspaceBinding::new(
        Some("workspace-1".to_string()),
        PathBuf::from("/managed/OPC-Team-wt-1"),
    )
    .with_project_root_path(PathBuf::from("/projects/OPC-Team"))
    .with_execution_target(Some(execution_target));
    let context = build_prompt_context_for_workspace(
        &workspace,
        None,
        "session-1",
        Some("primary".to_string()),
        None,
        ToolListingSections::default(),
        RuntimeContextNeeds::default(),
        &UserContextPolicy::empty().with_workspace_context(),
    )
    .await
    .expect("prompt context should build");

    let workspace_context = PromptBuilder::new(context).get_workspace_context();

    assert!(workspace_context.contains("Managed Git worktree created for this session"));
    assert!(workspace_context.contains("Owning project root"));
    assert!(workspace_context.contains("/projects/OPC-Team"));
    assert!(workspace_context.contains("Worktree ID: wt-1"));
    assert!(workspace_context.contains("Worktree checkout: detached HEAD"));
    assert!(workspace_context.contains("Worktree base commit: 0123456789abcdef"));
}
