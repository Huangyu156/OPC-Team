//! System API

use std::path::Path;
use std::sync::{Mutex, OnceLock};

use crate::api::app_state::AppState;
use crate::startup_trace::DesktopStartupTrace;
use opc_core::service::system;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Position, Size, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfoResponse {
    pub platform: String,
    pub arch: String,
    pub os_version: Option<String>,
    #[serde(default)]
    pub home_dir: Option<String>,
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfoResponse, String> {
    let info = system::get_system_info();

    Ok(SystemInfoResponse {
        platform: info.platform,
        arch: info.arch,
        os_version: info.os_version,
        home_dir: info.home_dir,
    })
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetAppVersionRequest {}

/// Returns the current application version (from `Cargo.toml` / bundle metadata).
#[tauri::command]
pub async fn get_app_version(
    app: AppHandle,
    request: GetAppVersionRequest,
) -> Result<String, String> {
    let _ = request;
    Ok(app.package_info().version.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenHtmlFileInBrowserRequest {
    pub path: String,
}

fn is_html_file_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("html") || extension.eq_ignore_ascii_case("htm")
        })
        .unwrap_or(false)
}

#[tauri::command]
pub async fn open_html_file_in_browser(
    app: AppHandle,
    request: OpenHtmlFileInBrowserRequest,
) -> Result<(), String> {
    let path = Path::new(&request.path);

    if !is_html_file_path(path) {
        return Err("Only HTML files can be opened in the browser".to_string());
    }

    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("Failed to read HTML file metadata: {}", error))?;
    if !metadata.is_file() {
        return Err("HTML path is not a file".to_string());
    }

    app.opener()
        .open_path(&request.path, None::<&str>)
        .map_err(|error| format!("Failed to open HTML file in browser: {}", error))
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RestartAppRequest {}

/// Restarts the desktop application after an update has been installed.
#[tauri::command]
#[allow(unreachable_code)]
pub async fn restart_app(app: AppHandle, request: RestartAppRequest) -> Result<(), String> {
    let _ = request;
    crate::save_main_window_state(&app, "restart_app");
    crate::perform_process_exit_cleanup().await;
    crate::crash_diagnostics::mark_clean_shutdown("restart_app");
    log::info!("Desktop restart authorized after graceful shutdown");
    app.restart();
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckCommandResponse {
    pub exists: bool,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCommandRequest {
    #[serde(default)]
    pub controller_local: bool,
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub env: Option<Vec<EnvVar>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutputResponse {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetMacosEditMenuModeRequest {
    pub mode: crate::macos_menubar::EditMenuMode,
}

#[tauri::command]
pub async fn check_command_exists(command: String) -> Result<CheckCommandResponse, String> {
    let result = system::check_command(&command);

    Ok(CheckCommandResponse {
        exists: result.exists,
        path: result.path,
    })
}

#[tauri::command]
pub async fn check_commands_exist(
    commands: Vec<String>,
) -> Result<Vec<(String, CheckCommandResponse)>, String> {
    let cmd_refs: Vec<&str> = commands.iter().map(|s| s.as_str()).collect();
    let results = system::check_commands(&cmd_refs);

    Ok(results
        .into_iter()
        .map(|(name, result)| {
            (
                name,
                CheckCommandResponse {
                    exists: result.exists,
                    path: result.path,
                },
            )
        })
        .collect())
}

/// Runs a process on the controller. A remote workspace working directory is refused because this
/// command has no SSH transport: honouring it locally would run the process on the wrong machine.
#[tauri::command]
pub async fn run_system_command(
    request: RunCommandRequest,
) -> Result<CommandOutputResponse, String> {
    if request.workspace_id.is_some() || request.cwd.is_some() {
        let cwd = request.cwd.as_deref().unwrap_or_default();
        if opc_core::service::workspace::remote_io_for_legacy_or_id(
            request.workspace_id.as_deref(),
            request.controller_local,
            cwd.trim(),
        )
        .await
        .map_err(|e| e.to_string())?
        {
            return Err(format!(
                "run_system_command cannot execute '{}' in remote workspace directory '{}': this command spawns controller-local processes only; local filesystem fallback was not attempted",
                request.command, cwd
            ));
        }
    }

    let env_vars: Option<Vec<(String, String)>> = request
        .env
        .map(|vars| vars.into_iter().map(|v| (v.key, v.value)).collect());

    let env_ref: Option<&[(String, String)]> = env_vars.as_deref();

    let result = system::run_command(
        &request.command,
        &request.args,
        request.cwd.as_deref(),
        env_ref,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(CommandOutputResponse {
        exit_code: result.exit_code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.success,
    })
}

#[tauri::command]
pub async fn set_macos_edit_menu_mode(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    request: SetMacosEditMenuModeRequest,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let current_mode = *state.macos_edit_menu_mode.read().await;
        if current_mode == request.mode {
            return Ok(());
        }

        {
            let mut edit_mode = state.macos_edit_menu_mode.write().await;
            *edit_mode = request.mode;
        }

        let language = state
            .config_service
            .get_config::<String>(Some("app.language"))
            .await
            .unwrap_or_else(|_| "zh-CN".to_string());
        let menubar_mode = if state.workspace_id.read().await.is_some() {
            crate::macos_menubar::MenubarMode::Workspace
        } else {
            crate::macos_menubar::MenubarMode::Startup
        };

        crate::macos_menubar::set_macos_menubar_with_mode(
            &app,
            &language,
            menubar_mode,
            request.mode,
        )
        .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&state, &app, &request);
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendNotificationRequest {
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ToggleMainWindowFullscreenRequest {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleMainWindowFullscreenResponse {
    pub is_fullscreen: bool,
    pub is_maximized: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StartupWindowControlAction {
    GetState,
    Minimize,
    ToggleMaximize,
    Close,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupWindowControlRequest {
    pub action: StartupWindowControlAction,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupWindowControlResponse {
    pub is_maximized: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MainWindowFullscreenTransition {
    next_fullscreen: bool,
    should_apply_monitor_bounds_after_enter: bool,
    should_restore_maximized_after_exit: bool,
    next_restore_maximized_after_fullscreen: bool,
}

fn plan_main_window_fullscreen_transition(
    current_fullscreen: bool,
    current_maximized: bool,
    restore_maximized_after_fullscreen: bool,
    apply_maximized_fullscreen_monitor_bounds: bool,
) -> MainWindowFullscreenTransition {
    let next_fullscreen = !current_fullscreen;

    if next_fullscreen {
        MainWindowFullscreenTransition {
            next_fullscreen,
            should_apply_monitor_bounds_after_enter: current_maximized
                && apply_maximized_fullscreen_monitor_bounds,
            should_restore_maximized_after_exit: false,
            next_restore_maximized_after_fullscreen: current_maximized,
        }
    } else {
        MainWindowFullscreenTransition {
            next_fullscreen,
            should_apply_monitor_bounds_after_enter: false,
            should_restore_maximized_after_exit: restore_maximized_after_fullscreen,
            next_restore_maximized_after_fullscreen: false,
        }
    }
}

fn main_window_fullscreen_restore_maximized() -> &'static Mutex<bool> {
    static RESTORE_MAXIMIZED: OnceLock<Mutex<bool>> = OnceLock::new();
    RESTORE_MAXIMIZED.get_or_init(|| Mutex::new(false))
}

fn read_main_window_fullscreen_response(
    window: &tauri::WebviewWindow,
    fallback_fullscreen: bool,
    fallback_maximized: bool,
) -> ToggleMainWindowFullscreenResponse {
    ToggleMainWindowFullscreenResponse {
        is_fullscreen: window.is_fullscreen().unwrap_or(fallback_fullscreen),
        is_maximized: window.is_maximized().unwrap_or(fallback_maximized),
    }
}

// ─── Window / Tray behavior commands ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetMainWindowTransientGeometryRequest {
    pub transient: bool,
}

/// Mark whether the shared main window currently uses toolbar-mode geometry.
///
/// Entering captures the latest normal bounds before the frontend resizes the
/// native window. Leaving persists the restored normal bounds. While transient
/// geometry is active, all process-exit save paths retain the captured normal
/// state instead of the floating-window state.
#[tauri::command]
pub async fn set_main_window_transient_geometry(
    app: tauri::AppHandle,
    request: SetMainWindowTransientGeometryRequest,
) -> Result<(), String> {
    crate::set_main_window_transient_geometry(&app, request.transient)
}

/// Immediately exit the application (used by the "ask" dialog when the user
/// chooses to quit rather than minimize to tray).
#[tauri::command]
pub async fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    log::info!("Quit requested via quit_app command");
    crate::save_main_window_state(&app, "quit_app_command");
    crate::perform_process_exit_cleanup().await;
    crate::crash_diagnostics::mark_clean_shutdown("quit_app_command");
    log::info!("Desktop exit authorized after graceful shutdown: reason=quit_app_command");
    app.exit(0);
    Ok(())
}

/// Hide the main window so it lives only in the system tray (used by the "ask"
/// dialog when the user chooses to minimize instead of quitting).
#[tauri::command]
pub async fn minimize_to_tray(
    app: tauri::AppHandle,
    startup_trace: State<'_, DesktopStartupTrace>,
) -> Result<(), String> {
    if let Err(error) = crate::tray::setup_tray(&app, &startup_trace) {
        log::warn!("Failed to initialize tray before minimizing: {}", error);
    }
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
        log::info!("Main window minimized to tray via command");
    }
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTrayUnreadCountRequest {
    pub count: u32,
}

#[tauri::command]
pub async fn set_tray_unread_count(
    app: tauri::AppHandle,
    request: SetTrayUnreadCountRequest,
) -> Result<(), String> {
    crate::tray::set_unread_count(&app, request.count)
}

/// Initialize the desktop tray after the startup shell has become interactive.
#[tauri::command]
pub async fn initialize_tray_after_startup(
    app: tauri::AppHandle,
    startup_trace: State<'_, DesktopStartupTrace>,
) -> Result<(), String> {
    crate::tray::setup_tray(&app, &startup_trace).map_err(|e| e.to_string())
}

/// Minimal startup-window controls used by the static pre-React splash.
#[tauri::command]
pub async fn startup_window_control(
    state: State<'_, AppState>,
    startup_trace: State<'_, DesktopStartupTrace>,
    app: tauri::AppHandle,
    request: StartupWindowControlRequest,
) -> Result<StartupWindowControlResponse, String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Main window not found".to_string());
    };

    let mut is_maximized = window.is_maximized().unwrap_or(false);
    match request.action {
        StartupWindowControlAction::GetState => {}
        StartupWindowControlAction::Minimize => {
            window.minimize().map_err(|error| {
                format!("Failed to minimize main window during startup: {}", error)
            })?;
        }
        StartupWindowControlAction::ToggleMaximize => {
            if is_maximized {
                window.unmaximize().map_err(|error| {
                    format!("Failed to restore main window during startup: {}", error)
                })?;
            } else {
                window.maximize().map_err(|error| {
                    format!("Failed to maximize main window during startup: {}", error)
                })?;
            }
            is_maximized = !is_maximized;
        }
        StartupWindowControlAction::Close => {
            let behavior = state
                .config_service
                .get_config::<String>(Some("app.close_button_behavior"))
                .await
                .unwrap_or_else(|_| "minimize_to_tray".to_string());

            if behavior == "quit" {
                log::info!("Quit requested from startup window control");
                crate::save_main_window_state(&app, "startup_window_control_quit");
                crate::perform_process_exit_cleanup().await;
                crate::crash_diagnostics::mark_clean_shutdown("startup_window_control");
                log::info!(
                    "Desktop exit authorized after graceful shutdown: reason=startup_window_control"
                );
                app.exit(0);
            } else {
                if let Err(error) = crate::tray::setup_tray(&app, &startup_trace) {
                    log::warn!("Failed to initialize tray before startup close: {}", error);
                }
                window.hide().map_err(|error| {
                    format!("Failed to hide main window during startup close: {}", error)
                })?;
                log::info!("Main window hidden from startup window control");
            }
        }
    }

    Ok(StartupWindowControlResponse { is_maximized })
}

/// Toggle OS-level fullscreen for the Desktop main window.
///
/// This is intentionally not the same as maximize: maximize fills the normal
/// work area, while fullscreen asks the OS to own the whole monitor surface.
/// This is also intentionally a Desktop shell adapter command, not a remote
/// workspace/session/runtime command; remote workspaces still run inside the
/// same local Desktop window, so fullscreen must not enter transport or core
/// product logic.
/// Keeping the transition in the desktop host avoids frontend code stitching
/// together `set_fullscreen` / `maximize` with visible JS turns.
///
/// Important: do not unmaximize before entering fullscreen. On Windows this
/// briefly restores the normal window bounds, which makes the window origin and
/// size visibly jump before the OS fullscreen transition starts. Fullscreen and
/// maximize are tracked separately so we can remember whether to restore the
/// maximized state after fullscreen exits without touching window geometry on
/// entry.
///
/// Windows note: Tauri/wry fullscreen does not always expand an undecorated
/// maximized window beyond the work area if we call `set_fullscreen(true)`
/// directly. The Windows path therefore keeps the window maximized, enters
/// fullscreen, then applies the current monitor's full bounds as a geometry
/// correction. Never reintroduce `unmaximize`, `hide`, or `show` in this enter
/// path: those expose a restore transition and make repeated F11 toggles feel
/// broken.
#[tauri::command]
pub async fn toggle_main_window_fullscreen(
    app: tauri::AppHandle,
    request: ToggleMainWindowFullscreenRequest,
) -> Result<ToggleMainWindowFullscreenResponse, String> {
    let _ = request;
    let Some(window) = app.get_webview_window("main") else {
        return Err("Main window not found".to_string());
    };

    let current_fullscreen = window
        .is_fullscreen()
        .map_err(|error| format!("Failed to read main window fullscreen state: {}", error))?;
    let current_maximized = window
        .is_maximized()
        .map_err(|error| format!("Failed to read main window maximize state: {}", error))?;
    let restore_maximized_after_fullscreen = *main_window_fullscreen_restore_maximized()
        .lock()
        .map_err(|_| "Main window fullscreen restore state is unavailable".to_string())?;

    let transition = plan_main_window_fullscreen_transition(
        current_fullscreen,
        current_maximized,
        restore_maximized_after_fullscreen,
        should_apply_maximized_fullscreen_monitor_bounds(),
    );

    if transition.next_fullscreen {
        if let Err(error) = window.set_fullscreen(true) {
            return Err(format!("Failed to enter main window fullscreen: {}", error));
        }

        if transition.should_apply_monitor_bounds_after_enter {
            apply_main_window_fullscreen_monitor_bounds(&app, &window)?;
        }

        *main_window_fullscreen_restore_maximized()
            .lock()
            .map_err(|_| "Main window fullscreen restore state is unavailable".to_string())? =
            transition.next_restore_maximized_after_fullscreen;

        return Ok(read_main_window_fullscreen_response(&window, true, false));
    }

    window
        .set_fullscreen(false)
        .map_err(|error| format!("Failed to exit main window fullscreen: {}", error))?;

    let mut restored_maximized = false;
    if transition.should_restore_maximized_after_exit {
        let is_already_maximized = window.is_maximized().unwrap_or(false);
        if !is_already_maximized {
            window.maximize().map_err(|error| {
                format!("Failed to restore maximize after fullscreen: {}", error)
            })?;
        }
        restored_maximized = true;
    }

    *main_window_fullscreen_restore_maximized()
        .lock()
        .map_err(|_| "Main window fullscreen restore state is unavailable".to_string())? =
        transition.next_restore_maximized_after_fullscreen;

    Ok(read_main_window_fullscreen_response(
        &window,
        false,
        restored_maximized,
    ))
}

fn apply_main_window_fullscreen_monitor_bounds(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| format!("Failed to read current monitor for fullscreen: {}", error))?
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "Failed to resolve monitor for fullscreen".to_string())?;

    window
        .set_position(Position::Physical(*monitor.position()))
        .map_err(|error| format!("Failed to align fullscreen window position: {}", error))?;
    window
        .set_size(Size::Physical(*monitor.size()))
        .map_err(|error| format!("Failed to align fullscreen window size: {}", error))?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn should_apply_maximized_fullscreen_monitor_bounds() -> bool {
    true
}

#[cfg(not(target_os = "windows"))]
fn should_apply_maximized_fullscreen_monitor_bounds() -> bool {
    false
}

/// Send an OS-level desktop notification (Windows toast / macOS notification center).
#[tauri::command]
pub async fn send_system_notification(
    app: tauri::AppHandle,
    request: SendNotificationRequest,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // The Tauri notification plugin drops notify-rust's response handle after
        // showing a Windows toast, so its body-click activation cannot be observed.
        return send_clickable_windows_notification(app, request);
    }

    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_notification::NotificationExt;

        let mut builder = app.notification().builder().title(&request.title);
        if let Some(body) = &request.body {
            builder = builder.body(body);
        }
        builder.show().map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "windows")]
fn send_clickable_windows_notification(
    app: tauri::AppHandle,
    request: SendNotificationRequest,
) -> Result<(), String> {
    let mut notification = notify_rust::Notification::new();
    notification.summary(&request.title);
    if let Some(body) = &request.body {
        notification.body(body);
    }

    if should_use_configured_notification_app_id() {
        notification.app_id(&app.config().identifier);
    }

    let handle = notification.show().map_err(|error| error.to_string())?;
    // Waiting for a toast click is blocking; keep it off both the UI thread and
    // the async executor while retaining the response handle until dismissal.
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) =
            handle.wait_for_response(move |response: &notify_rust::NotificationResponse| {
                if !notification_response_activates_main_window(response) {
                    return;
                }

                let app_for_window = app.clone();
                if let Err(error) = app.run_on_main_thread(move || {
                    activate_main_window_from_notification(&app_for_window);
                }) {
                    log::warn!(
                        "Failed to schedule main window activation from notification: {}",
                        error
                    );
                }
            })
        {
            log::warn!("Failed to observe Windows notification response: {}", error);
        }
    });

    Ok(())
}

#[cfg(target_os = "windows")]
fn should_use_configured_notification_app_id() -> bool {
    use std::path::MAIN_SEPARATOR;

    // Match the Tauri plugin's development behavior. A Cargo-built executable
    // has no installed Windows shortcut that registers OPC-Team's AppUserModelID.
    let Ok(executable) = tauri::utils::platform::current_exe() else {
        return false;
    };
    let Some(executable_dir) = executable.parent() else {
        return false;
    };
    let executable_dir = executable_dir.display().to_string();

    !executable_dir.ends_with(format!("{MAIN_SEPARATOR}target{MAIN_SEPARATOR}debug").as_str())
        && !executable_dir
            .ends_with(format!("{MAIN_SEPARATOR}target{MAIN_SEPARATOR}release").as_str())
}

#[cfg(target_os = "windows")]
fn notification_response_activates_main_window(
    response: &notify_rust::NotificationResponse,
) -> bool {
    matches!(
        response,
        notify_rust::NotificationResponse::Default
            | notify_rust::NotificationResponse::Action(_)
            | notify_rust::NotificationResponse::Reply(_)
    )
}

#[cfg(target_os = "windows")]
fn activate_main_window_from_notification(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("Failed to activate main window from notification: main window not found");
        return;
    };

    if let Err(error) = window.unminimize() {
        log::warn!(
            "Failed to unminimize main window from notification: {}",
            error
        );
    }
    if let Err(error) = window.show() {
        log::warn!("Failed to show main window from notification: {}", error);
    }
    if let Err(error) = window.set_focus() {
        log::warn!("Failed to focus main window from notification: {}", error);
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn system_info_home_contract_accepts_legacy_and_reports_serving_host() {
        let legacy =
            serde_json::json!({"platform": "windows", "arch": "x86_64", "osVersion": null});
        let old: super::SystemInfoResponse = serde_json::from_value(legacy).unwrap();
        assert!(old.home_dir.is_none());
        let round_trip: super::SystemInfoResponse =
            serde_json::from_value(serde_json::to_value(old).unwrap()).unwrap();
        assert_eq!(round_trip.platform, "windows");
        assert!(round_trip.home_dir.is_none());

        let response = serde_json::to_value(super::get_system_info().await.unwrap()).unwrap();
        assert_eq!(
            response["homeDir"],
            serde_json::json!(super::system::get_system_info().home_dir)
        );
        assert!(response.get("home_dir").is_none());
    }

    #[test]
    fn startup_window_control_contract_exposes_the_native_maximize_state() {
        let request: super::StartupWindowControlRequest =
            serde_json::from_value(serde_json::json!({ "action": "get_state" }))
                .expect("get_state request");
        assert!(matches!(
            request.action,
            super::StartupWindowControlAction::GetState
        ));

        let response = super::StartupWindowControlResponse { is_maximized: true };
        assert_eq!(
            serde_json::to_value(response).expect("serialize response"),
            serde_json::json!({ "isMaximized": true })
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn notification_body_click_activates_main_window_but_dismissal_does_not() {
        use notify_rust::{CloseReason, NotificationResponse};

        assert!(super::notification_response_activates_main_window(
            &NotificationResponse::Default
        ));
        assert!(!super::notification_response_activates_main_window(
            &NotificationResponse::Closed(CloseReason::Dismissed)
        ));
    }

    use super::*;

    #[test]
    fn main_window_fullscreen_transition_enters_from_maximized_without_reusing_maximize_state() {
        let transition = plan_main_window_fullscreen_transition(false, true, false, true);

        assert!(transition.next_fullscreen);
        assert!(transition.should_apply_monitor_bounds_after_enter);
        assert!(transition.next_restore_maximized_after_fullscreen);
        assert!(!transition.should_restore_maximized_after_exit);
    }

    #[test]
    fn main_window_fullscreen_transition_exits_and_restores_previous_maximize_state() {
        let transition = plan_main_window_fullscreen_transition(true, false, true, true);

        assert!(!transition.next_fullscreen);
        assert!(!transition.should_apply_monitor_bounds_after_enter);
        assert!(!transition.next_restore_maximized_after_fullscreen);
        assert!(transition.should_restore_maximized_after_exit);
    }

    #[test]
    fn main_window_fullscreen_transition_can_enter_without_masking_geometry() {
        let transition = plan_main_window_fullscreen_transition(false, true, false, false);

        assert!(transition.next_fullscreen);
        assert!(!transition.should_apply_monitor_bounds_after_enter);
        assert!(transition.next_restore_maximized_after_fullscreen);
    }
}

#[cfg(test)]
mod remote_guard_tests {
    use super::{run_system_command, RunCommandRequest};
    use opc_core::service::remote_ssh::workspace_state::init_remote_workspace_manager;

    const REMOTE_ROOT: &str = "/remote-audit-run-command";
    const CONNECTION_ID: &str = "remote-audit-run-command-connection";

    #[tokio::test]
    async fn run_system_command_refuses_remote_working_directory() {
        init_remote_workspace_manager()
            .register_remote_workspace(
                REMOTE_ROOT.to_string(),
                CONNECTION_ID.to_string(),
                "remote-audit-run-command".to_string(),
                "remote-audit-run-command.invalid".to_string(),
            )
            .await;

        let error = run_system_command(RunCommandRequest {
            controller_local: false,
            workspace_id: None,
            command: "git".to_string(),
            args: vec!["status".to_string()],
            cwd: Some(format!("{REMOTE_ROOT}/repo")),
            env: None,
        })
        .await
        .expect_err("remote working directory must be refused");

        assert!(error.starts_with("run_system_command cannot execute 'git'"));
        assert!(error.contains("local filesystem fallback was not attempted"));

        init_remote_workspace_manager()
            .unregister_remote_workspace(CONNECTION_ID, REMOTE_ROOT)
            .await;
    }
}
