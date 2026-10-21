//! Cowork Mode
//!
//! A collaborative mode that prioritizes early clarification and lightweight progress tracking.

use crate::agentic::agents::{Agent, UserContextPolicy};
use async_trait::async_trait;

pub struct CoworkMode {
    default_tools: Vec<String>,
}

impl Default for CoworkMode {
    fn default() -> Self {
        Self::new()
    }
}

impl CoworkMode {
    pub fn new() -> Self {
        Self {
            default_tools: vec![
                // Clarification + planning helpers
                "AskUserQuestion".to_string(),
                "get_goal".to_string(),
                "create_goal".to_string(),
                "update_goal".to_string(),
                "AgentSpawn".to_string(),
                "AgentSendInput".to_string(),
                "AgentControl".to_string(),
                "AgentList".to_string(),
                "ListModels".to_string(),
                "AgentWait".to_string(),
                "Skill".to_string(),
                // Discovery + editing
                "LS".to_string(),
                "Read".to_string(),
                "view_image".to_string(),
                "analyze_image".to_string(),
                "Grep".to_string(),
                "Glob".to_string(),
                "Write".to_string(),
                "Edit".to_string(),
                "Delete".to_string(),
                // Utilities
                "GetFileDiff".to_string(),
                "ExecCommand".to_string(),
                "WriteStdin".to_string(),
                "ExecControl".to_string(),
                // The companion to ExecCommand for remote work: a server
                // started on an SSH host is unreachable from the user's
                // machine until a forward exists.
                "PortForward".to_string(),
                "WebSearch".to_string(),
                "WebFetch".to_string(),
                "ControlHub".to_string(),
                "ComputerUse".to_string(),
                // Recurring office work ("check these channels every 30
                // minutes") is squarely this mode's job, and ControlHub's
                // `wait` sends schedules here rather than pinning a turn open
                // for the interval.
                "Cron".to_string(),
                "PublishAppearance".to_string(),
            ],
        }
    }
}

#[async_trait]
impl Agent for CoworkMode {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn id(&self) -> &str {
        "Cowork"
    }

    fn name(&self) -> &str {
        "Cowork"
    }

    fn description(&self) -> &str {
        "Office and collaboration mode for documents, research, drafting, and structured multi-step work"
    }

    fn prompt_template_name(&self, _model_name: Option<&str>) -> &str {
        "cowork_mode"
    }

    fn default_tools(&self) -> Vec<String> {
        self.default_tools.clone()
    }

    fn user_context_policy(&self) -> UserContextPolicy {
        UserContextPolicy::empty()
            .with_workspace_context()
            .with_workspace_instructions()
    }

    fn is_readonly(&self) -> bool {
        false
    }
}
