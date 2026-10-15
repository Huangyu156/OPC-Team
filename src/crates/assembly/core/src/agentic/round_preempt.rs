//! Compatibility re-exports for round-boundary injection state.

pub use opc_agent_runtime::scheduler::{
    DialogRoundInjectionInterrupt, NoopDialogRoundInjectionSource, SessionRoundInjectionBuffer,
};
pub use opc_runtime_ports::{
    DialogRoundInjectionSource, RoundInjection, RoundInjectionKind, RoundInjectionTarget,
};
