//! Compatibility facade for MiniApp runtime detection.
//!
//! Runtime detection policy lives in `opc-product-domains`; the host-backed
//! probe and the production entry point live in `opc-services-integrations`
//! (see `miniapp::runtime_probe`). This facade keeps the Core import path
//! stable while delegating to the service-layer implementation.

pub use opc_product_domains::miniapp::runtime::{DetectedRuntime, RuntimeKind};
pub use opc_services_integrations::miniapp::runtime_probe::detect_runtime;
