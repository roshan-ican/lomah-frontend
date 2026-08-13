//! Prints the first admin beacon heard on the range LAN, then exits.
//!
//! A field diagnostic for the question "is anything actually advertising
//! itself as the admin station?", which is otherwise only answerable by
//! reading the shell's behaviour. Also the integration check for the parser:
//! the unit tests assert against beacons this file was written from, and this
//! asserts against beacons the backend really sends.
//!
//!   cargo run --example listen               # ignores our own beacons
//!   cargo run --example listen -- --include-self

use std::time::Duration;

use lomah_lib::discovery;

fn main() {
    let ignore_self = !std::env::args().any(|a| a == "--include-self");
    let timeout = Duration::from_secs(10);

    println!(
        "listening on UDP {} for {}s ({} our own beacons)…",
        discovery::DISCOVERY_PORT,
        timeout.as_secs(),
        if ignore_self { "ignoring" } else { "including" }
    );

    match discovery::listen_for_beacon(timeout, ignore_self) {
        Some(beacon) => println!("admin at {}:{}", beacon.host, beacon.port),
        None => println!("no admin beacon heard"),
    }
}
