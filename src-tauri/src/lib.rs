//! LOMAH desktop shell.
//!
//! Deliberately thin. The range logic lives in the NestJS backend, which is
//! spawned as a child process and reached over HTTP and socket.io exactly as
//! it was under Electron — the shell's whole job is to decide whether this
//! tablet is the admin station, start the backend if so, and put a window in
//! front of it.
//!
//! What has to live here rather than in the backend is anything needed BEFORE
//! a backend exists: the persisted mode, and the UDP election that decides
//! whether starting one is even allowed.

pub mod discovery;
pub mod mode;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to start the LOMAH shell");
}
