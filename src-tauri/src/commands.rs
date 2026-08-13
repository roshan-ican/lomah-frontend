//! The shell's surface to the frontend.
//!
//! One command per `ipcMain.handle` channel the Electron shell exposed. All of
//! them are request/response with no push half, which is what makes the swap a
//! rename at each call site rather than a rewrite: `window.electronAPI.setMode`
//! becomes `platform.setMode`, same arguments, same return type.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, State};

use crate::discovery::{self, Beacon};
use crate::mode::{self, Mode};

/// How long a user-initiated scan listens. Longer than the startup election,
/// because someone is watching a spinner and would rather wait than be told
/// "not found" by a scan that gave up after four seconds.
const MANUAL_SCAN: Duration = Duration::from_secs(10);

/// Set while a scan is running so it can be cancelled from the UI.
#[derive(Default)]
pub struct Discovery {
    cancelled: Mutex<bool>,
}

impl Discovery {
    fn begin(&self) {
        *self.cancelled.lock().unwrap() = false;
    }

    fn cancel(&self) {
        *self.cancelled.lock().unwrap() = true;
    }

    fn is_cancelled(&self) -> bool {
        *self.cancelled.lock().unwrap()
    }
}

#[tauri::command]
pub fn get_current_mode() -> Option<&'static str> {
    mode::stored_mode().map(Mode::as_str)
}

/// Records the role and restarts.
///
/// A restart rather than a live switch, because the decision is made before the
/// process does anything else: whether to run the UDP election, whether to
/// start a backend, which origin to load. Reproducing all of that in place
/// would mean tearing down a running backend and re-running the election from a
/// process that is already beaconing, which is precisely the state the election
/// exists to avoid.
#[tauri::command]
pub fn set_mode(app: AppHandle, mode_name: String) -> Result<(), String> {
    let parsed = match mode_name.as_str() {
        "admin" => Mode::Admin,
        "shooter" => Mode::Shooter,
        other => return Err(format!("unknown mode: {other}")),
    };

    mode::set_mode(parsed).map_err(|e| format!("could not save the mode: {e}"))?;
    app.restart();
}

#[tauri::command]
pub fn get_admin_ip() -> Option<String> {
    mode::stored_admin_host()
}

/// Listens for an admin beacon and remembers whoever answers.
///
/// Self-filtering is off here, unlike the startup election. By the time a user
/// is scanning by hand this tablet is a shooter and is running no backend, so
/// there is no beacon of ours to mistake for someone else's - and on the range
/// the admin may legitimately be a machine we would otherwise have skipped.
#[tauri::command]
pub async fn start_discovery(state: State<'_, Discovery>) -> Result<Option<Beacon>, String> {
    state.begin();

    let found = tauri::async_runtime::spawn_blocking(|| {
        discovery::listen_for_beacon(MANUAL_SCAN, false)
    })
    .await
    .map_err(|e| format!("discovery failed: {e}"))?;

    if state.is_cancelled() {
        return Ok(None);
    }

    if let Some(beacon) = &found {
        mode::set_admin_host(&beacon.host).map_err(|e| format!("could not save the host: {e}"))?;
    }
    Ok(found)
}

#[tauri::command]
pub fn cancel_discovery(state: State<'_, Discovery>) {
    state.cancel();
}

/// Pins an address typed in by hand, for a range whose broadcast traffic is
/// blocked or whose admin is on another subnet.
#[tauri::command]
pub fn manual_connect(host: String) -> Result<String, String> {
    mode::set_admin_host(&host).map_err(|e| format!("could not save the host: {e}"))?;
    mode::stored_admin_host().ok_or_else(|| format!("\"{host}\" is not a usable address"))
}

#[tauri::command]
pub fn get_logs_path() -> String {
    mode::data_dir().join("logs").to_string_lossy().to_string()
}

/// Opens the log folder in Explorer, for an operator reading an error to
/// someone over the phone.
#[tauri::command]
pub fn open_logs_folder() -> Result<(), String> {
    let dir = mode::data_dir().join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;

    std::process::Command::new("explorer.exe")
        .arg(&dir)
        // explorer.exe returns a non-zero exit code even when it succeeds, so
        // the status is deliberately not checked - only the spawn is.
        .spawn()
        .map_err(|e| format!("could not open {}: {e}", dir.display()))?;
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// True once the backend answers. The frontend uses it to tell "still starting"
/// apart from "failed", which are otherwise the same blank screen.
#[tauri::command]
pub fn backend_ready() -> bool {
    crate::backend::is_healthy(crate::backend::BACKEND_PORT)
}

/// The origin the frontend should send API and socket.io traffic to.
///
/// Under Electron the admin window was served BY NestJS, so relative "/api"
/// paths resolved against it and nothing had to be configured. Tauri serves the
/// shell's own screens from tauri://localhost, where a relative path means
/// nothing, so the frontend has to be told - an empty string keeps the old
/// relative behaviour for pages the backend itself served.
#[tauri::command]
pub fn backend_origin() -> String {
    match mode::stored_mode() {
        Some(Mode::Admin) | None => format!("http://127.0.0.1:{}", crate::backend::BACKEND_PORT),
        Some(Mode::Shooter) => mode::stored_admin_host()
            .map(|host| format!("http://{host}:{}", crate::backend::BACKEND_PORT))
            .unwrap_or_default(),
    }
}

/// Registers the state the commands above share. Kept here so lib.rs does not
/// have to know what any of them need.
pub fn init(app: &AppHandle) {
    app.manage(Discovery::default());
}
