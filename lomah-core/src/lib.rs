//! Native bridge for the LOMAH desktop shell.
//!
//! Electron owns the window, the backend process, the firewall rules and the
//! lifecycle. This crate owns the two things that must work BEFORE a backend
//! exists and that are awkward to do reliably from JavaScript:
//!
//!  - the persisted role (`mode.rs`), reading and writing Electron's own
//!    `%APPDATA%\LOMAH\lomah-mode.json` so a tablet keeps its mode across a
//!    build switch;
//!  - the UDP admin election (`discovery.rs`) — listening for an admin beacon
//!    on UDP 5002 and deciding whether this machine is allowed to become the
//!    admin itself.
//!
//! Compiled with napi-rs to `lomah_core.win32-x64-msvc.node`, a Node-API addon
//! that `electron-app/main.ts` loads via `createRequire`. Node-API is
//! ABI-stable across Node and Electron versions, so one build serves them all.
//!
//! Why async: the discovery listen blocks for up to ~10s on a UDP socket. Run
//! synchronously it would freeze Electron's main process — exactly the failure
//! the shell already fought once with synchronous PowerShell. Every blocking
//! entry point therefore runs off the JS thread (napi-rs Task/AsyncTask) and
//! resolves as a Promise.

pub mod discovery;
pub mod mode;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use napi::bindgen_prelude::{AsyncTask, Env, Task};
use napi::{Error, Result, Status};
use napi_derive::napi;

/// The single in-flight election. `start_discovery` clears the flag,
/// `cancel_discovery` sets it, and the listening loop notices within 250ms —
/// the loop's wake-up interval. Safe to call when nothing is listening.
fn cancel_flag() -> &'static AtomicBool {
    static FLAG: OnceLock<AtomicBool> = OnceLock::new();
    FLAG.get_or_init(|| AtomicBool::new(false))
}

// ── Mode ────────────────────────────────────────────────────────────────────

/// The stored role: `"admin"` | `"shooter"`, or null on a genuine first run.
/// Same file and same shape Electron reads, so the two shells agree.
/// (JS name matches the old Electron `getCurrentMode`-style surface.)
#[napi(js_name = "getStoredMode")]
pub fn get_stored_mode() -> Option<String> {
    mode::stored_mode().map(|m| m.as_str().to_string())
}

/// Persists the role in Electron's file format (`{"mode":"admin"}`). Throws on
/// any value that is not "admin" or "shooter".
#[napi(js_name = "setStoredMode")]
pub fn set_stored_mode(mode_name: String) -> Result<()> {
    let parsed = match mode_name.as_str() {
        "admin" => mode::Mode::Admin,
        "shooter" => mode::Mode::Shooter,
        _ => {
            return Err(Error::new(
                Status::InvalidArg,
                format!("unknown mode: {mode_name}"),
            ))
        }
    };
    mode::set_mode(parsed).map_err(|e| Error::new(Status::GenericFailure, e.to_string()))
}

/// The admin station this tablet last talked to, normalised to a bare host.
/// None until discovery or a manual connect has stored one.
#[napi(js_name = "getStoredAdminHost")]
pub fn get_stored_admin_host() -> Option<String> {
    mode::stored_admin_host()
}

/// Stores the admin host, normalising it first — a value with a port
/// ("192.168.1.51:3001", as typed into manual-connect) is reduced to the host.
/// Read it back with `getStoredAdminHost` rather than reusing the input, or the
/// in-memory copy and the file disagree.
#[napi(js_name = "setStoredAdminHost")]
pub fn set_stored_admin_host(host: String) -> Result<()> {
    mode::set_admin_host(&host).map_err(|e| Error::new(Status::GenericFailure, e.to_string()))
}

/// `--role=admin` / `--role=shooter` off this process's own argv, for pinning a
/// tablet's role from a shortcut without writing the stored file.
#[napi(js_name = "getLaunchMode")]
pub fn get_launch_mode() -> Option<String> {
    mode::launch_mode().map(|m| m.as_str().to_string())
}

// ── UDP election ────────────────────────────────────────────────────────────

/// The shape the renderer's `startDiscovery` already receives: a bare host and
/// port, ready to build an API origin from.
#[napi(object)]
pub struct DiscoveryResult {
    pub host: String,
    pub port: u32,
}

/// Runs on napi-rs's worker thread pool, so the UDP listen never touches the
/// JS thread.
pub struct DiscoveryTask {
    timeout_ms: u32,
    ignore_self: bool,
}

impl Task for DiscoveryTask {
    type Output = Option<DiscoveryResult>;
    type JsValue = Option<DiscoveryResult>;

    fn compute(&mut self) -> Result<Self::Output> {
        Ok(discovery::listen_for_beacon(
            Duration::from_millis(self.timeout_ms as u64),
            self.ignore_self,
            cancel_flag(),
        )
        .map(|beacon| DiscoveryResult {
            host: beacon.host,
            port: beacon.port as u32,
        }))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// Listens for an admin beacon on UDP 5002, resolving with `{host, port}` or
/// null when nothing (or nothing we may trust) is heard before `timeout_ms`.
/// `ignore_self` is what stops a tablet locking itself out of admin mode when
/// its own leftover backend is still beaconing to the broadcast address.
#[napi(js_name = "startDiscovery")]
pub fn start_discovery(timeout_ms: u32, ignore_self: bool) -> AsyncTask<DiscoveryTask> {
    cancel_flag().store(false, Ordering::Relaxed);
    AsyncTask::new(DiscoveryTask {
        timeout_ms,
        ignore_self,
    })
}

/// Interrupts any in-flight `start_discovery`, resolving it with null.
/// Matches Electron's dgram-based cancel: closing the socket early.
#[napi(js_name = "cancelDiscovery")]
pub fn cancel_discovery() {
    cancel_flag().store(true, Ordering::Relaxed);
}
