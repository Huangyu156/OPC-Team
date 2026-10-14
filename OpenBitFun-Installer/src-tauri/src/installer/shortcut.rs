//! Windows shortcut (.lnk) creation for desktop and Start Menu.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use super::{LEGACY_PRODUCT_NAME, MAIN_APP_EXE, PRODUCT_NAME};

/// Shortcut file names follow the desktop `productName`, like Tauri NSIS
/// (`$DESKTOP\${PRODUCTNAME}.lnk` and `$SMPROGRAMS\${PRODUCTNAME}.lnk`). Shortcuts written by
/// pre-rename builds keep the legacy name, so both are removed.
fn shortcut_file_name(product_name: &str) -> String {
    format!("{}.lnk", product_name)
}

/// Create a desktop shortcut for OPC-Team, replacing the pre-rename shortcut.
pub(super) fn create_desktop_shortcut(install_path: &Path) -> Result<()> {
    let desktop = dirs::desktop_dir().with_context(|| "Cannot find Desktop directory")?;
    remove_shortcut_file(&desktop.join(shortcut_file_name(LEGACY_PRODUCT_NAME)))?;
    let shortcut_path = desktop.join(shortcut_file_name(PRODUCT_NAME));
    let exe_path = install_path.join(MAIN_APP_EXE);

    create_lnk(&shortcut_path, &exe_path, install_path)?;
    log::info!("Created desktop shortcut at {}", shortcut_path.display());
    Ok(())
}

/// Create a Start Menu shortcut for OPC-Team, replacing the pre-rename shortcut.
pub(super) fn create_start_menu_shortcut(install_path: &Path) -> Result<()> {
    let start_menu = get_start_menu_dir()?;
    remove_nested_start_menu_shortcut(&start_menu)?;
    remove_shortcut_file(&start_menu.join(shortcut_file_name(LEGACY_PRODUCT_NAME)))?;
    let shortcut_path = start_menu.join(shortcut_file_name(PRODUCT_NAME));
    let exe_path = install_path.join(MAIN_APP_EXE);

    create_lnk(&shortcut_path, &exe_path, install_path)?;
    log::info!("Created Start Menu shortcut at {}", shortcut_path.display());
    Ok(())
}

/// Remove desktop shortcuts written by this installer or by a pre-rename build.
pub(super) fn remove_desktop_shortcut() -> Result<()> {
    if let Some(desktop) = dirs::desktop_dir() {
        remove_shortcut_file(&desktop.join(shortcut_file_name(PRODUCT_NAME)))?;
        remove_shortcut_file(&desktop.join(shortcut_file_name(LEGACY_PRODUCT_NAME)))?;
    }
    Ok(())
}

/// Remove Start Menu shortcuts, including the nested folder layout.
pub(super) fn remove_start_menu_shortcut() -> Result<()> {
    let start_menu = get_start_menu_dir()?;
    remove_shortcut_file(&start_menu.join(shortcut_file_name(PRODUCT_NAME)))?;
    remove_shortcut_file(&start_menu.join(shortcut_file_name(LEGACY_PRODUCT_NAME)))?;
    remove_nested_start_menu_shortcut(&start_menu)?;
    Ok(())
}

/// Get the current user's Start Menu Programs directory.
fn get_start_menu_dir() -> Result<PathBuf> {
    let appdata =
        std::env::var("APPDATA").with_context(|| "APPDATA environment variable not set")?;
    Ok(PathBuf::from(appdata)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs"))
}

/// Remove the nested Start Menu folder used by layouts older than the current installer.
///
/// `bundle.windows.nsis.startMenuFolder` is not configured, so the desktop NSIS build places its
/// shortcut directly in `Programs`; only pre-rename layouts grouped shortcuts under a folder named
/// after the legacy product name.
fn remove_nested_start_menu_shortcut(start_menu: &Path) -> Result<()> {
    let nested_dir = start_menu.join(LEGACY_PRODUCT_NAME);
    if nested_dir.exists() {
        std::fs::remove_dir_all(&nested_dir)?;
    }
    Ok(())
}

fn remove_shortcut_file(shortcut_path: &Path) -> Result<()> {
    if shortcut_path.exists() {
        std::fs::remove_file(shortcut_path)?;
    }
    Ok(())
}

/// Create a .lnk shortcut file using the mslnk crate.
fn create_lnk(shortcut_path: &Path, target: &Path, _working_dir: &Path) -> Result<()> {
    let lnk = mslnk::ShellLink::new(target)
        .with_context(|| format!("Failed to create shell link for {}", target.display()))?;

    // Note: mslnk has limited API. For full control (icon, arguments, etc.),
    // consider using the windows crate with IShellLink COM interface.
    lnk.create_lnk(shortcut_path)
        .with_context(|| format!("Failed to write shortcut to {}", shortcut_path.display()))?;

    log::info!(
        "Created shortcut: {} -> {}",
        shortcut_path.display(),
        target.display()
    );
    Ok(())
}
