//! Compatibility re-exports for stable workspace identity helpers.
//!
//! The implementation is owned by `opc-services-core`; remote SSH keeps
//! this module so existing integration and facade paths remain source-compatible.

pub use opc_services_core::workspace_identity::*;
