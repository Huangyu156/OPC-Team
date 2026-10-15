//! Compatibility facade for MiniApp JS worker processes.

pub use opc_services_integrations::miniapp::worker::{
    JsWorker, MiniAppWorkerEvent, MiniAppWorkerEventFuture, MiniAppWorkerEventSink,
    SharedMiniAppWorkerEventSink,
};
