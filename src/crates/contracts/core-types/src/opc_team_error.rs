//! Unified application error contract.
//!
//! This type lives in the contracts layer so that owner crates below assembly
//! can name it directly instead of reaching up into `opc-core`.

use serde::Serialize;
use thiserror::Error;

use crate::errors::{ai_error_detail_from_message, classify_ai_error_message, AiErrorDetail, AiProviderError, ErrorCategory, ToolErrorDetail};

/// Unified error type for the OPC-Team application
#[derive(Debug, Error, Serialize)]
pub enum OpcTeamError {
    #[error("Service error: {0}")]
    Service(String),

    #[error("Agent error: {0}")]
    Agent(String),

    #[error("Tool error: {0}")]
    Tool(String),

    #[error("{message}")]
    ClassifiedTool {
        message: String,
        detail: ToolErrorDetail,
    },

    #[error("AI client error: {0}")]
    AIClient(String),

    #[error("AI provider error: {0}")]
    AIProvider(AiProviderError),

    /// A provider rejected the request before any effective model output because
    /// the input exceeded its context window. The execution engine may compact
    /// the session and retry the same logical model round.
    #[error("AI client error: {0}")]
    RecoverableContextOverflow(AiProviderError),

    #[error("Session error: {0}")]
    Session(String),

    #[error("Session is already open for writing: {session_id}")]
    SessionInUse { session_id: String },

    #[error("Operation outcome is unknown: {0}")]
    OutcomeUnknown(String),

    #[error(
        "Session creation persistence failed and rollback did not complete: session_id={session_id}, error={error}, cleanup_error={cleanup_error}"
    )]
    SessionCreateCleanupRequired {
        session_id: String,
        error: String,
        cleanup_error: String,
    },

    #[error("Workspace error: {0}")]
    Workspace(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("IO error: {0}")]
    #[serde(serialize_with = "serialize_io_error")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    #[serde(serialize_with = "serialize_serde_error")]
    Serialization(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Other error: {0}")]
    #[serde(serialize_with = "serialize_anyhow_error")]
    Other(#[from] anyhow::Error),

    #[error("Semaphore acquire error: {0}")]
    Semaphore(String),

    #[error("MCP error: {0}")]
    MCPError(String),

    #[error("Process error: {0}")]
    ProcessError(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Not implemented: {0}")]
    NotImplemented(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Configuration error: {0}")]
    Configuration(String),

    #[error("Deserialization error: {0}")]
    Deserialization(String),

    #[error("Cancelled: {0}")]
    Cancelled(String),
}

pub type OpcTeamResult<T> = Result<T, OpcTeamError>;

// Custom serialization functions for non-serializable error types
fn serialize_io_error<S>(err: &std::io::Error, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&err.to_string())
}

fn serialize_serde_error<S>(err: &serde_json::Error, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&err.to_string())
}

fn serialize_anyhow_error<S>(err: &anyhow::Error, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&err.to_string())
}

impl OpcTeamError {
    pub fn tool_error_detail(&self) -> Option<&ToolErrorDetail> {
        match self {
            Self::ClassifiedTool { detail, .. } => Some(detail),
            _ => None,
        }
    }
    pub fn service<T: Into<String>>(msg: T) -> Self {
        Self::Service(msg.into())
    }

    pub fn agent<T: Into<String>>(msg: T) -> Self {
        Self::Agent(msg.into())
    }

    pub fn tool<T: Into<String>>(msg: T) -> Self {
        Self::Tool(msg.into())
    }

    pub fn config<T: Into<String>>(msg: T) -> Self {
        Self::Configuration(msg.into())
    }

    pub fn validation<T: Into<String>>(msg: T) -> Self {
        Self::Validation(msg.into())
    }

    pub fn ai<T: Into<String>>(msg: T) -> Self {
        Self::AIClient(msg.into())
    }

    pub fn http<T: Into<String>>(msg: T) -> Self {
        Self::Http(msg.into())
    }

    pub fn parse<T: Into<String>>(msg: T) -> Self {
        Self::Deserialization(msg.into())
    }

    pub fn workspace<T: Into<String>>(msg: T) -> Self {
        Self::Workspace(msg.into())
    }

    pub fn serialization<T: Into<String>>(msg: T) -> Self {
        Self::Serialization(serde_json::Error::io(std::io::Error::other(msg.into())))
    }

    pub fn session<T: Into<String>>(msg: T) -> Self {
        Self::Session(msg.into())
    }

    pub fn io<T: Into<String>>(msg: T) -> Self {
        Self::Io(std::io::Error::other(msg.into()))
    }

    pub fn cancelled<T: Into<String>>(msg: T) -> Self {
        Self::Cancelled(msg.into())
    }

    /// Infer an error category from this error for frontend-friendly classification.
    pub fn error_category(&self) -> ErrorCategory {
        match self {
            OpcTeamError::AIClient(msg) => classify_ai_error_message(msg),
            OpcTeamError::AIProvider(error) => error.category.clone(),
            OpcTeamError::RecoverableContextOverflow(_) => ErrorCategory::ContextOverflow,
            OpcTeamError::Timeout(_) => ErrorCategory::Timeout,
            OpcTeamError::Cancelled(_) => ErrorCategory::Unknown,
            _ => ErrorCategory::Unknown,
        }
    }

    /// Build a structured, provider-agnostic AI error detail for UI recovery.
    pub fn error_detail(&self) -> AiErrorDetail {
        if let OpcTeamError::AIProvider(error) | OpcTeamError::RecoverableContextOverflow(error) =
            self
        {
            return error.detail();
        }
        let category = self.error_category();
        let message = self.to_string();
        ai_error_detail_from_message(&message, category)
    }

    pub fn is_recoverable_context_overflow(&self) -> bool {
        matches!(self, Self::RecoverableContextOverflow(_))
    }
}

impl From<OpcTeamError> for String {
    fn from(err: OpcTeamError) -> String {
        err.to_string()
    }
}

impl From<String> for OpcTeamError {
    fn from(error: String) -> Self {
        OpcTeamError::Service(error)
    }
}

impl From<&str> for OpcTeamError {
    fn from(error: &str) -> Self {
        OpcTeamError::Service(error.to_string())
    }
}
