//! Finding the admin station, and deciding whether we are allowed to be it.
//!
//! The backend broadcasts `LOMAH-ADMIN|<port>` to UDP 5002 every two seconds
//! (see lomah-nest/src/discovery/discovery.service.ts). A shooter tablet
//! listens for that to find the server without being configured; an admin
//! candidate listens for it to find out whether the role is already taken.
//!
//! This stays in Rust rather than moving into NestJS with the rest of the
//! orchestration, because the answer is needed BEFORE a backend is started.
//! Starting one first and demoting afterwards would mean two servers briefly
//! bound to UDP 14555, splitting the range's shot traffic between them.

use std::collections::HashSet;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use socket2::{Domain, Protocol, Socket, Type};

pub const DISCOVERY_PORT: u16 = 5002;
pub const DEFAULT_BACKEND_PORT: u16 = 3001;

/// How long to listen before claiming the admin role. The backend beacons
/// every 2s, so this is two intervals plus slack — long enough that a running
/// admin is always heard, short enough not to be felt at startup.
pub const ADMIN_CONFLICT_TIMEOUT: Duration = Duration::from_millis(4500);

#[derive(Clone, Debug, Serialize)]
pub struct Beacon {
    pub host: String,
    pub port: u16,
}

/// How often the loop wakes up to notice a cancellation even while the network
/// stays silent. Bounds how late `cancel_discovery` can be: one wake-up, not
/// the whole remaining deadline.
const WAKEUP_INTERVAL: Duration = Duration::from_millis(250);

/// Listens for an admin beacon, returning the first one that is not our own.
///
/// `ignore_self` is what stops a tablet locking itself out of admin mode. Our
/// own backend beacons to the broadcast address, so we hear ourselves; without
/// filtering, a restart would find "an admin already running", demote to
/// shooter, and point at itself.
pub fn listen_for_beacon(
    timeout: Duration,
    ignore_self: bool,
    cancel: &AtomicBool,
) -> Option<Beacon> {
    let local = if ignore_self {
        local_ipv4_addresses()
    } else {
        HashSet::new()
    };

    let socket = match bind_shared(DISCOVERY_PORT) {
        Ok(socket) => socket,
        Err(err) => {
            eprintln!("[discovery] cannot bind UDP {DISCOVERY_PORT}: {err}");
            return None;
        }
    };

    let deadline = Instant::now() + timeout;
    let mut buf = [0u8; 512];

    loop {
        if cancel.load(Ordering::Relaxed) {
            return None;
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return None;
        }
        // Re-armed every iteration, and never longer than the wake-up interval:
        // a datagram we discard (our own beacon, or noise from something else
        // on the range LAN) must not extend the overall deadline, and a silent
        // network must not delay noticing a cancellation.
        if socket.set_read_timeout(Some(remaining.min(WAKEUP_INTERVAL))).is_err() {
            return None;
        }

        let (len, from) = match socket.recv_from(&mut buf) {
            Ok(pair) => pair,
            // Timed out, or a Windows ICMP port-unreachable surfaced as an
            // error on a connectionless socket. Neither is fatal; the deadline
            // check at the top of the loop ends it.
            Err(_) => continue,
        };

        let Some(port) = parse_beacon(&buf[..len]) else {
            continue;
        };
        let host = source_host(from);
        if host.is_empty() || local.contains(&host) {
            continue;
        }
        return Some(Beacon { host, port });
    }
}

/// `LOMAH-ADMIN|<port>`. A malformed or missing port falls back to the default
/// rather than discarding the beacon: the sender is plainly an admin station,
/// and the port it serves on is almost never anything else.
fn parse_beacon(bytes: &[u8]) -> Option<u16> {
    let text = std::str::from_utf8(bytes).ok()?;
    if !text.starts_with("LOMAH-ADMIN") {
        return None;
    }
    Some(
        text.split('|')
            .nth(1)
            .and_then(|p| p.trim().parse::<u16>().ok())
            .filter(|p| *p > 0)
            .unwrap_or(DEFAULT_BACKEND_PORT),
    )
}

fn source_host(addr: SocketAddr) -> String {
    let ip = addr.ip().to_canonical();
    if ip.is_unspecified() {
        return String::new();
    }
    ip.to_string()
}

/// Every IPv4 address this machine owns, used to recognise our own beacons.
fn local_ipv4_addresses() -> HashSet<String> {
    let mut addresses = HashSet::new();
    addresses.insert("127.0.0.1".to_string());

    match if_addrs::get_if_addrs() {
        Ok(interfaces) => {
            for interface in interfaces {
                if let IpAddr::V4(v4) = interface.ip() {
                    addresses.insert(v4.to_string());
                }
            }
        }
        Err(err) => {
            // Worst case we fail to recognise our own beacon and demote to
            // shooter. Wrong, but safe — it never results in two admins.
            eprintln!("[discovery] cannot enumerate interfaces: {err}");
        }
    }
    addresses
}

/// Binds UDP 5002 with SO_REUSEADDR, so a second instance can listen while the
/// first still holds the port. Without it the second bind fails and the
/// election cannot run at all — which is the moment it matters most.
fn bind_shared(port: u16) -> std::io::Result<UdpSocket> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
    socket.set_reuse_address(true)?;
    socket.bind(&SocketAddr::from(([0, 0, 0, 0], port)).into())?;
    Ok(socket.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_port_out_of_a_beacon() {
        assert_eq!(parse_beacon(b"LOMAH-ADMIN|3001"), Some(3001));
        assert_eq!(parse_beacon(b"LOMAH-ADMIN|8080"), Some(8080));
    }

    #[test]
    fn falls_back_rather_than_discarding_a_valid_sender() {
        // Still plainly an admin station, so losing it would be worse than
        // assuming the port it almost certainly serves on.
        assert_eq!(parse_beacon(b"LOMAH-ADMIN"), Some(DEFAULT_BACKEND_PORT));
        assert_eq!(parse_beacon(b"LOMAH-ADMIN|"), Some(DEFAULT_BACKEND_PORT));
        assert_eq!(parse_beacon(b"LOMAH-ADMIN|0"), Some(DEFAULT_BACKEND_PORT));
        assert_eq!(parse_beacon(b"LOMAH-ADMIN|abc"), Some(DEFAULT_BACKEND_PORT));
    }

    #[test]
    fn ignores_traffic_that_is_not_ours() {
        // The range LAN carries other broadcasts; none of them may be taken
        // for an admin station.
        assert_eq!(parse_beacon(b""), None);
        assert_eq!(parse_beacon(b"hello"), None);
        assert_eq!(parse_beacon(b"LOMAH"), None);
        assert_eq!(parse_beacon(&[0xff, 0xfe, 0xfd]), None);
    }

    #[test]
    fn unwraps_ipv4_mapped_sources() {
        let mapped: SocketAddr = "[::ffff:192.168.1.51]:5002".parse().unwrap();
        assert_eq!(source_host(mapped), "192.168.1.51");

        let plain: SocketAddr = "10.0.0.4:5002".parse().unwrap();
        assert_eq!(source_host(plain), "10.0.0.4");

        let unspecified: SocketAddr = "0.0.0.0:5002".parse().unwrap();
        assert_eq!(source_host(unspecified), "");
    }

    #[test]
    fn always_recognises_loopback_as_ourselves() {
        assert!(local_ipv4_addresses().contains("127.0.0.1"));
    }
}
