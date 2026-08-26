//! Prints the real input/output signature of the two bundled ONNX models.
//!
//! `face_inference.rs` decodes YuNet by output name (`cls_8`, `obj_8`, …) and
//! SFace by `fc1`. Those names are assumptions about files downloaded from the
//! OpenCV Zoo, not facts the compiler can check. Run this after
//! `npm run fetch:runtime` to confirm them:
//!
//!     cargo run --example inspect_models

use std::path::PathBuf;

use ort::session::Session;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let runtime_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime");
    ort::init_from(runtime_dir.join("onnxruntime.dll").to_str().unwrap())?
        .with_name("inspect")
        .commit();

    for model in [
        "face_detection_yunet.onnx",
        "face_recognition_sface_int8.onnx",
    ] {
        let session = Session::builder()?.commit_from_file(runtime_dir.join(model))?;
        println!("\n=== {model} ===");
        for input in session.inputs() {
            println!("  in  {:<24} {:?}", input.name(), input.dtype());
        }
        for output in session.outputs() {
            println!("  out {:<24} {:?}", output.name(), output.dtype());
        }
    }
    Ok(())
}
