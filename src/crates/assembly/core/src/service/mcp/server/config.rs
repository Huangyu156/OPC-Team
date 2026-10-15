//! MCP server configuration types.

use crate::util::errors::OpcTeamError;

use openbitfun_services_integrations::mcp::server::MCPServerConfigValidationError;
pub use openbitfun_services_integrations::mcp::server::{
    MCPImportOrigin, MCPServerConfig, MCPServerOAuthConfig, MCPServerTimeouts, MCPServerTransport,
    MCPServerXaaConfig,
};

impl From<MCPServerConfigValidationError> for OpcTeamError {
    fn from(error: MCPServerConfigValidationError) -> Self {
        Self::Configuration(error.to_string())
    }
}
