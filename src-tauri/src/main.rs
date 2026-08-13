// Hides the console window in release. Debug builds keep it, because the
// backend's stdout is the only diagnosis available when something fails to
// start.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lomah_lib::run()
}
