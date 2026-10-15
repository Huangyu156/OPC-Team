use crate::service::mcp::server::MCPServerConfig;
use crate::util::errors::OpcTeamResult;

pub(super) fn config_to_cursor_format(config: &MCPServerConfig) -> serde_json::Value {
    opc_services_integrations::mcp::config::config_to_cursor_format(config)
}

pub(super) fn parse_cursor_format(
    config: &serde_json::Value,
) -> OpcTeamResult<Vec<MCPServerConfig>> {
    Ok(opc_services_integrations::mcp::config::parse_cursor_format(
        config,
    ))
}
