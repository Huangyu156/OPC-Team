//! Workspace-domain App Server wire schemas.

#[cfg(feature = "rpc")]
use agent_client_protocol::{JsonRpcRequest, JsonRpcResponse};
use opc_runtime_ports::{
    AgentMessageWorkspaceReferencesRequest, AgentWorkspaceReference,
    AgentWorkspaceReferenceSearchRequest, AgentWorkspaceReferenceSearchResult,
    WorkspaceDiffSnapshot,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "rpc", derive(JsonRpcRequest))]
#[cfg_attr(feature = "rpc", request(method = "workspace/diff", response = WorkspaceDiffResponse))]
pub struct WorkspaceDiffRequest {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "rpc", derive(JsonRpcResponse))]
pub struct WorkspaceDiffResponse(pub WorkspaceDiffSnapshot);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "rpc", derive(JsonRpcRequest))]
#[cfg_attr(feature = "rpc", request(method = "workspace/searchReferences", response = SearchWorkspaceReferencesResponse))]
pub struct SearchWorkspaceReferencesRequest(pub AgentWorkspaceReferenceSearchRequest);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "rpc", derive(JsonRpcResponse))]
pub struct SearchWorkspaceReferencesResponse(pub AgentWorkspaceReferenceSearchResult);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "rpc", derive(JsonRpcRequest))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "rpc", request(method = "workspace/assistantLocations", response = AssistantWorkspaceLocationsResponse))]
pub struct AssistantWorkspaceLocationsRequest {}

/// Where assistant workspaces live on disk. Mirrors the desktop
/// `AssistantWorkspaceLocationsDto` so both transports return the same shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "rpc", derive(JsonRpcResponse))]
#[serde(rename_all = "camelCase")]
pub struct AssistantWorkspaceLocationsResponse {
    /// The root new assistant workspaces are created under.
    pub active_root: String,
    /// The historical product-home root that older assistants may still live in.
    pub legacy_root: String,
    /// True when a user-configured root overrides the historical location.
    pub custom_root_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "rpc", derive(JsonRpcRequest))]
#[cfg_attr(feature = "rpc", request(method = "workspace/messageReferences", response = MessageReferencesResponse))]
pub struct MessageReferencesRequest(pub AgentMessageWorkspaceReferencesRequest);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "rpc", derive(JsonRpcResponse))]
pub struct MessageReferencesResponse(pub Vec<AgentWorkspaceReference>);
