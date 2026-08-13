//! Starting the NestJS backend and keeping it alive for exactly as long as the
//! window is.
//!
//! Electron doubled as a Node runtime, so it could spawn the backend with
//! `process.execPath` and ELECTRON_RUN_AS_NODE=1. Tauri has no Node, so a
//! node.exe ships alongside the bundle and runs the same backend.cjs, byte for
//! byte. Nothing in NestJS knows or cares which of the two started it.

use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use crate::mode;

pub const BACKEND_PORT: u16 = 3001;

/// Long enough for a cold start that also has migrations to apply, which on a
/// fresh install is thirteen of them against a database that does not exist
/// yet. Matches the Electron shell's budget.
const STARTUP_BUDGET: Duration = Duration::from_secs(30);
const POLL_INTERVAL: Duration = Duration::from_millis(500);

/// A backend this process started, and is therefore responsible for stopping.
pub struct Backend {
    child: Child,
}

impl Backend {
    /// Ends the backend, giving it a chance to shut down cleanly first.
    ///
    /// The graceful attempt is not decoration. PrismaService checkpoints the
    /// write-ahead log into the database on shutdown, and skipping that leaves
    /// -wal and -shm files beside it. SQLite recovers from those, but a range
    /// tablet accumulating them across every launch is a slow way to make
    /// someone doubt their data.
    pub fn stop(mut self) {
        // Windows has no SIGTERM to send. Closing stdin is the signal instead:
        // the backend's stdin is a pipe, and its end-of-file is what lets a
        // Node process wind down when nothing else holds it open.
        drop(self.child.stdin.take());

        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            match self.child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => break,
            }
        }

        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Starts the backend, unless something is already answering on its port.
///
/// The "already answering" case is not an error: it is `npm run start:dev` on a
/// developer's machine, and it is a second instance whose window still wants to
/// reach a server. Adopting the running one without owning it is what the
/// Electron shell did, and it is why closing this window must not kill a
/// backend it did not start.
pub fn ensure_running(resources: &Path) -> Result<Option<Backend>, String> {
    if is_healthy(BACKEND_PORT) {
        println!("[backend] already answering on {BACKEND_PORT} - adopting it");
        return Ok(None);
    }

    let backend = spawn(resources)?;

    if !wait_until_healthy(BACKEND_PORT, STARTUP_BUDGET) {
        backend.stop();
        return Err(format!(
            "the backend did not answer on port {} within {}s. See {}\\logs\\backend.log",
            BACKEND_PORT,
            STARTUP_BUDGET.as_secs(),
            mode::data_dir().display()
        ));
    }

    Ok(Some(backend))
}

/// Strips Windows' verbatim path prefix.
///
/// Tauri hands back paths in verbatim form, and Node cannot use one: its module
/// resolver realpaths the entry it is given component by component, hits the
/// bare drive letter first, and dies with `EISDIR: illegal operation on a
/// directory, lstat 'C:'` — an error naming neither the path nor the process
/// that received it. Everything below is consumed by Node (the entry, the
/// working directory, DATABASE_URL, LOMAH_STATIC_DIR), so the conversion
/// happens once, here, at the boundary.
fn plain(path: &Path) -> PathBuf {
    dunce::simplified(path).to_path_buf()
}

fn spawn(resources: &Path) -> Result<Backend, String> {
    let resources = &plain(resources);
    let node = resources.join("node.exe");
    let entry = resources.join("backend.cjs");
    let static_dir = resources.join("dist");

    for required in [&node, &entry] {
        if !required.exists() {
            return Err(format!("missing from the installation: {}", required.display()));
        }
    }

    let data_dir = mode::data_dir();
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("cannot create {}: {e}", data_dir.display()))?;

    let child = Command::new(&node)
        .arg(&entry)
        // cwd is the backend's own directory, so anything still resolving
        // against it lands somewhere sane even though runtime-paths.ts now
        // anchors on __dirname instead.
        .current_dir(resources)
        .env("PORT", BACKEND_PORT.to_string())
        // Every interface, not loopback. Loopback only would mean shooter
        // tablets and target boards on the range LAN could never reach this
        // server - the most common reason a range server "works on my machine"
        // and nowhere else.
        .env("HOST", "0.0.0.0")
        .env("DATABASE_URL", database_url(&data_dir))
        .env("JWT_SECRET", jwt_secret(&data_dir)?)
        // The backend serves the SPA to shooter tablets over HTTP. Told, not
        // guessed: cwd describes how we spawned it, not where anything lives.
        .env("LOMAH_STATIC_DIR", static_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("could not start the backend: {e}"))?;

    Ok(Backend { child })
}

/// Prisma's SQLite URLs want forward slashes even on Windows; a backslashed
/// path fails to parse. connection_limit=1 keeps every statement on one
/// connection, which the migration runner depends on - its table rebuilds
/// bracket themselves in PRAGMA foreign_keys=OFF, and a PRAGMA only applies to
/// the connection that issued it.
fn database_url(data_dir: &Path) -> String {
    let path = data_dir.join("lomah.db").to_string_lossy().replace('\\', "/");
    format!("file:{path}?connection_limit=1")
}

/// Per-install and persisted, so tokens survive a restart and no packaged build
/// ever runs on the .env placeholder.
///
/// Deliberately the same file the Electron shell used. A tablet upgrading from
/// that build keeps its secret, so anyone already logged in stays logged in
/// rather than being bounced out by a token that no longer verifies.
fn jwt_secret(data_dir: &Path) -> Result<String, String> {
    let file = data_dir.join("jwt-secret.txt");

    if let Ok(existing) = std::fs::read_to_string(&file) {
        let trimmed = existing.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    let mut bytes = [0u8; 48];
    getrandom::fill(&mut bytes).map_err(|e| format!("no source of randomness: {e}"))?;
    let secret: String = bytes.iter().map(|b| format!("{b:02x}")).collect();

    std::fs::write(&file, &secret).map_err(|e| format!("cannot write {}: {e}", file.display()))?;
    Ok(secret)
}

fn wait_until_healthy(port: u16, budget: Duration) -> bool {
    let deadline = Instant::now() + budget;
    while Instant::now() < deadline {
        if is_healthy(port) {
            return true;
        }
        std::thread::sleep(POLL_INTERVAL);
    }
    false
}

/// GET /health, by hand over TCP.
///
/// The endpoint is @Public and, more usefully, answers 200 only once the whole
/// Nest bootstrap has finished - Prisma connected, migrations applied, both UDP
/// sockets bound. That makes it an accurate readiness probe rather than a mere
/// liveness one.
///
/// Written against a raw socket rather than pulling in an HTTP client: this is
/// one unauthenticated GET to loopback, and the alternative drags a TLS stack
/// into a binary whose whole point is being small.
pub fn is_healthy(port: u16) -> bool {
    let Ok(addr) = format!("127.0.0.1:{port}").parse() else {
        return false;
    };

    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));

    let request =
        format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    // Only the status line matters, so read a short prefix and stop rather than
    // draining the body.
    let mut head = [0u8; 64];
    let read = stream.read(&mut head).unwrap_or(0);
    let _ = stream.shutdown(Shutdown::Both);

    String::from_utf8_lossy(&head[..read]).starts_with("HTTP/1.1 200")
}
