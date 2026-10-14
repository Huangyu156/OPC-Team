//! Windows Registry operations for the installer.
//!
//! Handles:
//! - Uninstall registry entries (Add/Remove Programs)
//! - Install location under `Software\{publisher}\{productName}` (matches Tauri NSIS `MANUPRODUCTKEY`)
//!
//! Must stay in sync with `src/apps/desktop/tauri.conf.json`: `bundle.publisher` + `productName`
//! (the latter is projected from `products/opcteam/product.jsonc` by
//! `scripts/desktop-tauri-build.mjs`). Main exe name must match `super::MAIN_APP_EXE` (same as
//! Tauri NSIS).
//!
//! `productName` is part of the uninstall identity: Tauri's NSIS template derives `UNINSTKEY`,
//! `MANUPRODUCTKEY`, the shortcuts and the autostart `Run` value from `${MANUFACTURER}` /
//! `${PRODUCTNAME}`. Records written by pre-rename builds still exist on user machines, so every
//! read and delete path below covers the current name and the legacy name.

use anyhow::{Context, Result};
use std::path::Path;
use winreg::enums::*;
use winreg::RegKey;

use super::{LEGACY_PRODUCT_NAME, MAIN_APP_EXE, PRODUCT_NAME};

/// Add/Remove Programs `DisplayName` — the visible name of the installed
/// product, so it follows the product rename. Nothing identifies or uninstalls
/// an installation by this value: detection reads `UNINSTALL_KEY` and
/// `MANUFACTURER_PRODUCT_KEY`, and uninstall uses `InstallLocation` /
/// `UninstallString` / `MainBinaryName`.
const DISPLAY_NAME: &str = PRODUCT_NAME;
/// Name of the autostart `Run` value. The desktop registers it through
/// `tauri_plugin_autostart`'s `app_name`, and Tauri NSIS deletes the same
/// `${PRODUCTNAME}` value on uninstall.
const APP_NAME: &str = PRODUCT_NAME;
/// The same `Run` value for builds published before the rename.
const LEGACY_APP_NAME: &str = LEGACY_PRODUCT_NAME;
/// `...\Uninstall\{PRODUCT_NAME}` — Tauri NSIS `UNINSTKEY`.
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\OPC-Team";
/// `...\Uninstall\{LEGACY_PRODUCT_NAME}` — the pre-rename `UNINSTKEY`.
const LEGACY_UNINSTALL_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBitFun";

/// Matches Tauri NSIS `MANUFACTURER` (`bundle.publisher`, unchanged by the rename).
const TAURI_MANUFACTURER: &str = "OpenBitFun Team";

/// `HKCU\Software\{TAURI_MANUFACTURER}\{product_name}` — same as Tauri `MANUPRODUCTKEY`.
fn manufacturer_product_key(product_name: &str) -> String {
    format!(r"Software\{}\{}", TAURI_MANUFACTURER, product_name)
}

fn quote_windows_path(path: &Path) -> String {
    format!("\"{}\"", path.display())
}

fn normalize_registry_path(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let unquoted = trimmed
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .unwrap_or(trimmed)
        .trim();
    if unquoted.is_empty() {
        None
    } else {
        Some(unquoted.to_string())
    }
}

/// Register the application in Add/Remove Programs.
pub(super) fn register_uninstall_entry(
    install_path: &Path,
    version: &str,
    uninstall_command: &str,
) -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(UNINSTALL_KEY)
        .with_context(|| "Failed to create uninstall registry key")?;

    let exe_path = install_path.join(MAIN_APP_EXE);

    key.set_value("DisplayName", &DISPLAY_NAME)?;
    key.set_value("DisplayVersion", &version)?;
    key.set_value("Publisher", &TAURI_MANUFACTURER)?;
    key.set_value("MainBinaryName", &MAIN_APP_EXE)?;
    key.set_value("InstallLocation", &quote_windows_path(install_path))?;
    key.set_value("DisplayIcon", &quote_windows_path(&exe_path))?;
    key.set_value("UninstallString", &uninstall_command)?;
    key.set_value("QuietUninstallString", &uninstall_command)?;
    key.set_value("NoModify", &1u32)?;
    key.set_value("NoRepair", &1u32)?;

    log::info!("Registered uninstall entry at {}", UNINSTALL_KEY);
    Ok(())
}

/// Same as Tauri NSIS `WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR` — used for default install dir / upgrades.
pub(super) fn register_tauri_install_location(install_path: &Path) -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = manufacturer_product_key(PRODUCT_NAME);
    let (key, _) = hkcu
        .create_subkey(&path)
        .with_context(|| format!("Failed to create registry key {}", path))?;
    let dir = install_path.to_string_lossy();
    key.set_value("", &dir.as_ref())?;
    log::info!("Registered Tauri install location at {}", path);
    Ok(())
}

/// Read the install dir written by Tauri NSIS or this installer for one product name.
fn read_manufacturer_product_key(product_name: &str) -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey(manufacturer_product_key(product_name))
        .ok()?;
    let s: String = key.get_value("").ok()?;
    normalize_registry_path(&s)
}

/// Read install dir written by Tauri NSIS or this installer (`MANUPRODUCTKEY` default value),
/// preferring the current product name and falling back to a pre-rename installation.
pub(super) fn read_tauri_install_location() -> Option<String> {
    read_manufacturer_product_key(PRODUCT_NAME)
        .or_else(|| read_manufacturer_product_key(LEGACY_PRODUCT_NAME))
}

/// Remove `MANUPRODUCTKEY` for both product names (HKCU and HKLM, matching Tauri NSIS `SHCTX` per-user / per-machine).
pub(super) fn remove_tauri_install_location() -> Result<()> {
    for product_name in [PRODUCT_NAME, LEGACY_PRODUCT_NAME] {
        let path = manufacturer_product_key(product_name);
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if hkcu.delete_subkey_all(&path).is_ok() {
            log::info!("Removed HKCU Tauri install location key {}", path);
        }
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if hklm.delete_subkey_all(&path).is_ok() {
            log::info!("Removed HKLM Tauri install location key {}", path);
        }
    }
    Ok(())
}

/// Remove Add/Remove Programs entries — the same subkeys as the Tauri NSIS `UNINSTKEY` (per-user
/// and per-machine), for the current and for the pre-rename product name.
pub(super) fn remove_uninstall_entry() -> Result<()> {
    for uninstall_key in [UNINSTALL_KEY, LEGACY_UNINSTALL_KEY] {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if hkcu.delete_subkey_all(uninstall_key).is_ok() {
            log::info!("Removed HKCU uninstall key {}", uninstall_key);
        }
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if hklm.delete_subkey_all(uninstall_key).is_ok() {
            log::info!("Removed HKLM uninstall key {}", uninstall_key);
        }
    }
    Ok(())
}

/// NSIS `DeleteRegValue HKCU ... Run "${PRODUCTNAME}"` — align uninstall with Tauri NSIS, and
/// clear the pre-rename value so an older installation cannot relaunch the application.
pub(super) fn remove_autostart_run_entry() -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        KEY_READ | KEY_WRITE,
    );
    if let Ok(key) = key {
        for value_name in [APP_NAME, LEGACY_APP_NAME] {
            let _ = key.delete_value(value_name);
            log::info!("Removed Run registry value for {}", value_name);
        }
    }
    Ok(())
}

/// Data read from the Add/Remove Programs uninstall key (Tauri NSIS / this installer).
#[derive(Debug, Clone)]
pub(super) struct UninstallRegistryData {
    pub install_location: String,
    pub display_version: Option<String>,
    pub uninstall_string: Option<String>,
    pub hive: &'static str,
}

fn read_uninstall_key(
    root: RegKey,
    hive_name: &'static str,
    uninstall_key: &str,
) -> Option<UninstallRegistryData> {
    let key = root.open_subkey(uninstall_key).ok()?;
    let install_location: String = key.get_value("InstallLocation").ok()?;
    let display_version: Option<String> = key.get_value("DisplayVersion").ok();
    let uninstall_string: Option<String> = key.get_value("UninstallString").ok();
    Some(UninstallRegistryData {
        install_location: normalize_registry_path(&install_location)?,
        display_version,
        uninstall_string,
        hive: hive_name,
    })
}

/// Detect existing install like NSIS `ReadRegStr` on `UNINSTKEY` (HKCU then HKLM), preferring an
/// installation registered under the current product name over a pre-rename one.
pub(super) fn read_existing_install_from_uninstall_registry() -> Option<UninstallRegistryData> {
    for uninstall_key in [UNINSTALL_KEY, LEGACY_UNINSTALL_KEY] {
        let detected = read_uninstall_key(RegKey::predef(HKEY_CURRENT_USER), "hkcu", uninstall_key)
            .or_else(|| {
                read_uninstall_key(RegKey::predef(HKEY_LOCAL_MACHINE), "hklm", uninstall_key)
            });
        if detected.is_some() {
            return detected;
        }
    }
    None
}

/// Remove OpenBitFun context menu entries (no longer registered on install).
pub(super) fn remove_context_menu() -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all(r"Software\Classes\Directory\Background\shell\OpenBitFun");
    let _ = hkcu.delete_subkey_all(r"Software\Classes\Directory\shell\OpenBitFun");
    Ok(())
}

/// Remove the install path from the user's PATH environment variable.
pub(super) fn remove_from_path(install_path: &Path) -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env_key = hkcu.open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)?;

    let current_path: String = env_key.get_value("Path").unwrap_or_default();
    let install_dir = install_path.to_string_lossy();

    let new_path: String = current_path
        .split(';')
        .filter(|p| !p.eq_ignore_ascii_case(&install_dir))
        .collect::<Vec<_>>()
        .join(";");

    env_key.set_value("Path", &new_path)?;
    Ok(())
}
