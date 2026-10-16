mod ai_config;
pub(super) mod commands;
mod extract;
mod generated_locale_contract;
mod types;

/// Windows main binary file name — must match `src/apps/desktop` `[[bin]]` and Tauri NSIS output.
const MAIN_APP_EXE: &str = "opc-desktop.exe";

/// Desktop `productName` of the current build. `products/opcteam/product.jsonc` supplies the
/// localized display name and `scripts/desktop-tauri-build.mjs` writes it into
/// `src/apps/desktop/tauri.conf.json`'s `productName` before `tauri build`.
///
/// Tauri's NSIS template derives several identities from that one field:
/// `UNINSTKEY` = `...\Uninstall\${PRODUCTNAME}`, `MANUPRODUCTKEY` =
/// `Software\${MANUFACTURER}\${PRODUCTNAME}`, the `currentUser` install directory
/// (`%LOCALAPPDATA%\${PRODUCTNAME}`), `<name>.lnk` desktop/Start Menu shortcuts and the
/// autostart `Run` value name. Every installer constant below therefore follows this value.
const PRODUCT_NAME: &str = "OPC-Team";

/// Desktop `productName` of builds published before the rename. Install records, install
/// directories, shortcuts and autostart entries written by those builds still exist on user
/// machines, so detection and cleanup must keep recognizing both names.
const LEGACY_PRODUCT_NAME: &str = "OPC-Team";

#[cfg(target_os = "windows")]
mod registry;
#[cfg(target_os = "windows")]
mod shortcut;
