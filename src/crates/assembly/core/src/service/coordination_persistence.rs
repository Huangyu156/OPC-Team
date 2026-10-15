use crate::util::errors::OpcTeamResult;
use opc_services_core::coordination_persistence as storage;
use rusqlite::Connection;

pub(crate) fn initialize_coordination_schema(connection: &Connection) -> OpcTeamResult<()> {
    storage::initialize_coordination_schema(connection).map_err(Into::into)
}
pub(crate) fn validate_coordination_agent_id(agent_id: &str) -> OpcTeamResult<()> {
    storage::validate_coordination_agent_id(agent_id).map_err(Into::into)
}
