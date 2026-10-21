//! Provider-neutral runtime event bus errors and subscriber result types.

use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum EventBusError {
    #[error("event subscriber error: {0}")]
    Subscriber(String),
}

impl EventBusError {
    pub fn subscriber(error: impl ToString) -> Self {
        Self::Subscriber(error.to_string())
    }
}

pub type EventBusResult<T> = Result<T, EventBusError>;
pub type EventSubscriberResult = EventBusResult<()>;

// `opc-core-types` is optional in this crate; it is enabled by the
// `definition-contracts` and `agent-runtime` owner features.
#[cfg(feature = "agent-runtime")]
impl From<EventBusError> for opc_core_types::opc_team_error::OpcTeamError {
    fn from(error: EventBusError) -> Self {
        opc_core_types::opc_team_error::OpcTeamError::Agent(error.to_string())
    }
}
