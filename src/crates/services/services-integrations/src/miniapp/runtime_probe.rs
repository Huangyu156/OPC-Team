//! Host-backed MiniApp runtime probe.
//!
//! `opc-product-domains` owns the portable runtime detection policy (lookup
//! order, candidate directories, fallback orchestration) but must not perform
//! IO. This module supplies the concrete host interactions it needs: PATH
//! lookup, home directory resolution, executable stat, version-manager
//! directory listing, and process-backed `--version` checks.

use opc_product_domains::miniapp::runtime::{
    detect_runtime_with_probe, DetectedRuntime, MiniAppRuntimeProbe,
};
use opc_services_core::process_manager::create_command;
use std::path::{Path, PathBuf};

/// Probe backed by the local host: filesystem, PATH, and child processes.
#[derive(Debug, Default, Clone, Copy)]
pub struct HostMiniAppRuntimeProbe;

impl MiniAppRuntimeProbe for HostMiniAppRuntimeProbe {
    fn find_on_path(&self, name: &str) -> Option<PathBuf> {
        which::which(name).ok()
    }

    fn home_dir(&self) -> Option<PathBuf> {
        home_dir()
    }

    fn is_executable(&self, path: &Path) -> bool {
        path.is_file()
    }

    fn version_dirs(&self, root: &Path) -> Vec<PathBuf> {
        std::fs::read_dir(root)
            .map(|read| read.flatten().map(|entry| entry.path()).collect())
            .unwrap_or_default()
    }

    fn runtime_version(&self, path: &Path) -> Option<String> {
        get_version(path).ok()
    }
}

/// Detect the MiniApp JS runtime on this host.
///
/// This is the production entry point. It is the host-backed counterpart of the
/// portable policy in `opc_product_domains::miniapp::runtime`; the policy lives
/// in contracts, the IO lives here.
pub fn detect_runtime() -> Option<DetectedRuntime> {
    detect_runtime_with_probe(&HostMiniAppRuntimeProbe)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir())
}

fn get_version(executable: &Path) -> Result<String, std::io::Error> {
    let output = create_command(executable).arg("--version").output()?;
    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout);
        Ok(version.trim().to_string())
    } else {
        Err(std::io::Error::other("version check failed"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_probe_reports_home_directory_when_available() {
        // The test only asserts the probe is wired, not which home it finds.
        let probe = HostMiniAppRuntimeProbe;
        if let Some(home) = probe.home_dir() {
            assert!(home.is_absolute() || !home.as_os_str().is_empty());
        }
    }

    #[test]
    fn host_probe_treats_missing_path_as_not_executable() {
        let probe = HostMiniAppRuntimeProbe;
        let missing = Path::new("__opc_miniapp_runtime_probe_missing_binary__");
        assert!(!probe.is_executable(missing));
    }

    #[test]
    fn host_probe_returns_no_version_dirs_for_missing_root() {
        let probe = HostMiniAppRuntimeProbe;
        let missing = Path::new("__opc_miniapp_runtime_probe_missing_root__");
        assert!(probe.version_dirs(missing).is_empty());
    }
}
