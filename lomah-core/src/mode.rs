//! Which role this tablet boots as, and where that is remembered.
//!
//! All of it has to work before a backend exists — the mode is what decides
//! whether one gets started at all — so it cannot live in NestJS.

use std::fs;
use std::io;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Admin,
    Shooter,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Admin => "admin",
            Mode::Shooter => "shooter",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "admin" => Some(Mode::Admin),
            "shooter" => Some(Mode::Shooter),
            _ => None,
        }
    }
}

/// %APPDATA%\LOMAH — deliberately built by hand.
///
/// Tauri's app_data_dir() resolves to %APPDATA%\<identifier>, which here would
/// be %APPDATA%\com.lomah.app. Using it would point a tablet upgrading from the
/// Electron build at an empty folder beside its real one: the range's whole
/// history would look lost, the app would seed a fresh admin account, and
/// nothing would report an error. The Electron shell pinned this name with a
/// DO-NOT-CHANGE comment for exactly that reason, and the name has to survive
/// the shell being replaced under it.
pub fn data_dir() -> PathBuf {
    match std::env::var_os("APPDATA") {
        Some(appdata) => PathBuf::from(appdata).join("LOMAH"),
        // Only reachable if APPDATA is unset, which on Windows means something
        // is badly wrong. Falling back beside the executable keeps the app
        // usable rather than panicking at startup.
        None => std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("data")))
            .unwrap_or_else(|| PathBuf::from("data")),
    }
}

fn mode_file() -> PathBuf {
    data_dir().join("lomah-mode.json")
}

fn admin_host_file() -> PathBuf {
    data_dir().join("admin-host.json")
}

#[derive(Serialize, Deserialize)]
struct ModeFile {
    mode: Mode,
}

#[derive(Serialize, Deserialize)]
struct AdminHostFile {
    host: String,
}

/// The JSON shapes are Electron's, unchanged: {"mode":"admin"} and
/// {"host":"192.168.1.51"}. A tablet that has been running the Electron build
/// keeps its role across the upgrade instead of dropping back to the picker.
pub fn stored_mode() -> Option<Mode> {
    let raw = fs::read_to_string(mode_file()).ok()?;
    serde_json::from_str::<ModeFile>(&raw).ok().map(|f| f.mode)
}

pub fn set_mode(mode: Mode) -> io::Result<()> {
    write_json(&mode_file(), &ModeFile { mode })
}

pub fn stored_admin_host() -> Option<String> {
    let raw = fs::read_to_string(admin_host_file()).ok()?;
    let parsed = serde_json::from_str::<AdminHostFile>(&raw).ok()?;
    let host = normalize_host(&parsed.host);
    (!host.is_empty()).then_some(host)
}

pub fn set_admin_host(host: &str) -> io::Result<()> {
    let host = normalize_host(host);
    if host.is_empty() {
        return Ok(());
    }
    write_json(&admin_host_file(), &AdminHostFile { host })
}

/// Reduces whatever we were handed to a bare address the frontend can put in a
/// URL: an IPv4-mapped IPv6 address (::ffff:192.168.1.51) from a UDP packet, or
/// a host:port pair typed into the manual-connect box.
///
/// A deliberate deviation from the Electron shell, which did
/// `host.replace(/^.*:/, "")` — that keeps everything after the LAST colon, so
/// "192.168.1.51:3001" became "3001" and the tablet then tried to reach a
/// server at host "3001". Unreachable from a UDP beacon, whose source address
/// never carries a port, but reachable from the manual-connect field, where a
/// user typing the address with its port is the obvious thing to do.
fn normalize_host(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let host = if let Ok(addr) = trimmed.parse::<std::net::SocketAddr>() {
        // to_canonical unwraps ::ffff:a.b.c.d back to a.b.c.d.
        addr.ip().to_canonical().to_string()
    } else if let Ok(ip) = trimmed.parse::<std::net::IpAddr>() {
        ip.to_canonical().to_string()
    } else {
        // A hostname, possibly with a port. Only split on the last colon when
        // what follows it is actually a port number.
        match trimmed.rsplit_once(':') {
            Some((name, port)) if port.parse::<u16>().is_ok() => name.to_string(),
            _ => trimmed.to_string(),
        }
    };

    // The wildcard address identifies no machine; treat it as no answer.
    if host == "0.0.0.0" || host == "::" {
        return String::new();
    }
    host
}

/// `--role=admin` / `--role=shooter`, used to pin a tablet's role from a
/// shortcut without touching the stored file.
pub fn launch_mode() -> Option<Mode> {
    std::env::args()
        .find_map(|arg| arg.strip_prefix("--role=").map(|v| v.to_string()))
        .as_deref()
        .and_then(Mode::parse)
}

fn write_json<T: Serialize>(path: &PathBuf, value: &T) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string(value).map_err(io::Error::other)?;
    fs::write(path, json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_electron_mode_file_shape() {
        let parsed: ModeFile = serde_json::from_str(r#"{"mode":"admin"}"#).unwrap();
        assert_eq!(parsed.mode, Mode::Admin);
        // And writes it back the same way, so downgrading to the Electron
        // build still works while both shells exist.
        assert_eq!(
            serde_json::to_string(&ModeFile { mode: Mode::Shooter }).unwrap(),
            r#"{"mode":"shooter"}"#
        );
    }

    #[test]
    fn normalises_hosts_the_way_the_frontend_expects() {
        assert_eq!(normalize_host("192.168.1.51"), "192.168.1.51");
        assert_eq!(normalize_host("  10.0.0.4  "), "10.0.0.4");
        // What a UDP beacon's source address looks like on a dual-stack socket.
        assert_eq!(normalize_host("::ffff:192.168.1.51"), "192.168.1.51");
        // What someone types into manual-connect. Electron turned this into
        // "3001" and then tried to reach a host by that name.
        assert_eq!(normalize_host("192.168.1.51:3001"), "192.168.1.51");
        assert_eq!(normalize_host("range-admin:3001"), "range-admin");
        // A bare hostname has no port to strip, colon or not.
        assert_eq!(normalize_host("range-admin"), "range-admin");
        // Addresses that identify no machine are the same as no answer.
        assert_eq!(normalize_host("0.0.0.0"), "");
        assert_eq!(normalize_host(""), "");
    }
}
