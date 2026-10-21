//! Errors from the shared on-disk format owners.
#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("Service error: {0}")]
    Service(String),
    #[error("Tool error: {0}")]
    Tool(String),
}
pub type StorageResult<T> = Result<T, StorageError>;
impl StorageError {
    pub fn config(message: String) -> Self {
        Self::Config(message)
    }
    pub fn validation(message: String) -> Self {
        Self::Validation(message)
    }
    pub fn io(message: String) -> Self {
        Self::Io(message)
    }
    pub fn service(message: String) -> Self {
        Self::Service(message)
    }
    pub fn tool(message: String) -> Self {
        Self::Tool(message)
    }
}

// `opc-core-types` is optional here; the mapping exists whenever it is compiled
// in. Owner features that enable it are `filesystem`, `local-storage`,
// `product-identity`, and `workspace-persistence`.
#[cfg(any(
    feature = "filesystem",
    feature = "local-storage",
    feature = "product-identity",
    feature = "workspace-persistence"
))]
impl From<StorageError> for opc_core_types::opc_team_error::OpcTeamError {
    fn from(error: StorageError) -> Self {
        use opc_core_types::opc_team_error::OpcTeamError;
        match error {
            StorageError::Config(message) => OpcTeamError::config(message),
            StorageError::Validation(message) => OpcTeamError::validation(message),
            StorageError::Io(message) => OpcTeamError::io(message),
            StorageError::Service(message) => OpcTeamError::service(message),
            StorageError::Tool(message) => OpcTeamError::tool(message),
        }
    }
}
