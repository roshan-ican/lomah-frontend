//! LOMAH desktop shell.
//!
//! Deliberately thin. The range logic lives in the NestJS backend, which is
//! spawned as a child process and reached over HTTP and socket.io exactly as it
//! was under Electron — the shell's whole job is to decide whether this tablet
//! is the admin station, start the backend if so, and put a window in front of
//! it.
//!
//! What has to live here rather than in the backend is anything needed BEFORE a
//! backend exists: the persisted mode, and the UDP election that decides
//! whether starting one is even allowed.

use std::sync::Mutex;

use tauri::{Manager, RunEvent, WindowEvent};

pub mod backend;
pub mod commands;
pub mod discovery;
pub mod mode;

/// The backend this process started, if it started one. None when the window is
/// a shooter terminal, or when it adopted a server that was already running.
#[derive(Default)]
struct Owned(Mutex<Option<backend::Backend>>);

pub fn run() {
    tauri::Builder::default()
        .manage(Owned::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_current_mode,
            commands::set_mode,
            commands::get_admin_ip,
            commands::start_discovery,
            commands::cancel_discovery,
            commands::manual_connect,
            commands::get_logs_path,
            commands::open_logs_folder,
            commands::quit_app,
            commands::backend_ready,
            commands::backend_origin,
        ])
        .setup(|app| {
            commands::init(app.handle());
            boot(app.handle());

            // Shown only now. The window starts hidden so nobody sees an app
            // pointed at a backend that is not answering yet - on a fresh
            // install that gap is thirteen migrations long.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to start the LOMAH shell")
        .run(|app, event| match event {
            // Both are needed. WindowEvent::Destroyed covers the window being
            // closed; RunEvent::Exit covers quit_app and a shutdown that never
            // touches the window. Missing either leaves a headless backend
            // holding UDP 14555, which the next launch then loses the election
            // to — a tablet that mysteriously refuses to be the admin.
            RunEvent::WindowEvent { event: WindowEvent::Destroyed, .. } | RunEvent::Exit => {
                if let Some(owned) = app.try_state::<Owned>() {
                    if let Some(running) = owned.0.lock().unwrap().take() {
                        running.stop();
                    }
                }
            }
            _ => {}
        });
}

/// Decides the role, then starts a backend if this tablet is the admin.
///
/// Runs to completion before the window is shown. That is the same order the
/// Electron shell used and it is not incidental: the election must settle
/// before a backend exists, because a backend that starts and then loses is a
/// backend that has already bound UDP 14555 and begun broadcasting.
fn boot(app: &tauri::AppHandle) {
    let requested = mode::launch_mode().or_else(mode::stored_mode);

    if requested == Some(mode::Mode::Shooter) {
        println!("[boot] shooter terminal - not starting a backend");
        return;
    }

    // Admin, or undecided and about to try. Listen first.
    if let Some(rival) = discovery::listen_for_beacon(discovery::ADMIN_CONFLICT_TIMEOUT, true) {
        println!(
            "[boot] an admin is already running at {}:{} - joining as a shooter",
            rival.host, rival.port
        );
        let _ = mode::set_admin_host(&rival.host);
        let _ = mode::set_mode(mode::Mode::Shooter);
        return;
    }

    // resource_dir() is the directory the bundle was installed into; the
    // payload sits one level down because tauri.conf.json maps "resources/"
    // onto "resources/". Joining it here keeps that mapping the single place
    // the layout is described.
    let resources = match app.path().resource_dir().map(|dir| dir.join("resources")) {
        Ok(dir) => dir,
        Err(err) => {
            eprintln!("[boot] cannot locate the bundled backend: {err}");
            return;
        }
    };

    match backend::ensure_running(&resources) {
        Ok(started) => {
            let _ = mode::set_mode(mode::Mode::Admin);
            // None means a backend was already answering and we are only
            // borrowing it; stopping it on exit would kill someone else's.
            if let Some(running) = started {
                if let Some(owned) = app.try_state::<Owned>() {
                    *owned.0.lock().unwrap() = Some(running);
                }
            }
        }
        Err(err) => {
            // Left to the frontend rather than killed here. A window showing
            // "the backend did not start" with a route into the logs is worth
            // more on a range than a process that vanishes.
            eprintln!("[boot] {err}");
        }
    }
}
