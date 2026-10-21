//! MiniApp concrete integration services.

#[cfg(feature = "miniapp-runtime")]
pub mod builtin_io;
#[cfg(feature = "miniapp-runtime")]
pub mod host_dispatch;
#[cfg(feature = "miniapp-runtime")]
pub mod runtime_probe;
pub mod storage;
#[cfg(feature = "miniapp-runtime")]
pub mod worker;
#[cfg(feature = "miniapp-runtime")]
pub mod worker_pool;
