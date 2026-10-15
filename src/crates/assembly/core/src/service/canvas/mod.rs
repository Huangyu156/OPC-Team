//! Canvas service compatibility facade.
//!
//! Concrete Canvas storage and compilation live in `opc-services-integrations`.
//! Keep this module as the legacy `opc_core::service::canvas` import path
//! while callers migrate to the provider owner.

pub use opc_services_integrations::canvas::{
    compile_canvas_component_js, compile_canvas_html, compile_canvas_source, CanvasMemoryStore,
    CanvasService,
};
