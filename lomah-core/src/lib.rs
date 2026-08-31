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
pub mod face;
pub mod face_inference;
pub mod mode;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use napi::bindgen_prelude::{AsyncTask, Buffer, Env, Task};
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

// ── Offline face inference ──────────────────────────────────────────────────

fn face_engine(runtime_dir: &str) -> Result<&'static Mutex<face_inference::FaceEngine>> {
    static ENGINE: OnceLock<std::result::Result<Mutex<face_inference::FaceEngine>, String>> =
        OnceLock::new();
    let loaded = ENGINE.get_or_init(|| {
        face_inference::FaceEngine::load(runtime_dir)
            .map(Mutex::new)
            .map_err(|error| error.to_string())
    });
    let engine = loaded
        .as_ref()
        .map_err(|message| Error::new(Status::GenericFailure, message.clone()))?;
    let configured = engine
        .lock()
        .map_err(|_| Error::new(Status::GenericFailure, "face engine lock is poisoned"))?;
    let requested = Path::new(runtime_dir)
        .canonicalize()
        .map_err(|error| Error::new(Status::InvalidArg, error.to_string()))?;
    if configured.runtime_dir() != requested {
        return Err(Error::new(
            Status::InvalidArg,
            "face engine was already loaded from a different runtime directory",
        ));
    }
    drop(configured);
    Ok(engine)
}

#[napi(object)]
pub struct FaceModelInfo {
    pub model_version: String,
    pub embedding_dimension: u32,
    pub default_l2_threshold: f64,
}

#[napi(js_name = "getFaceModelInfo")]
pub fn get_face_model_info() -> FaceModelInfo {
    FaceModelInfo {
        model_version: face_inference::FACE_MODEL_VERSION.to_string(),
        embedding_dimension: face_inference::FACE_EMBEDDING_DIMENSION as u32,
        default_l2_threshold: face_inference::DEFAULT_SFACE_L2_THRESHOLD as f64,
    }
}

pub struct WarmFaceModelsTask {
    runtime_dir: String,
}

impl Task for WarmFaceModelsTask {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        face_engine(&self.runtime_dir)?;
        Ok(())
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// Loads ONNX Runtime and both models before the first camera frame arrives.
/// This moves the one-time startup cost out of the shooter's first scan.
#[napi(js_name = "warmFaceModels")]
pub fn warm_face_models(runtime_dir: String) -> AsyncTask<WarmFaceModelsTask> {
    AsyncTask::new(WarmFaceModelsTask { runtime_dir })
}

pub struct EncodedFaceOutput {
    embedding: Option<Vec<f32>>,
    detection_score: Option<f32>,
}

#[napi(object)]
pub struct FaceEncodingResult {
    pub status: String,
    pub embedding: Option<Buffer>,
    pub dimension: u32,
    pub model_version: String,
    pub detection_score: Option<f64>,
}

pub struct EncodeFaceTask {
    jpeg: Vec<u8>,
    runtime_dir: String,
}

impl Task for EncodeFaceTask {
    type Output = EncodedFaceOutput;
    type JsValue = FaceEncodingResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let engine = face_engine(&self.runtime_dir)?;
        let mut engine = engine
            .lock()
            .map_err(|_| Error::new(Status::GenericFailure, "face engine lock is poisoned"))?;
        let encoded = engine
            .encode_jpeg(&self.jpeg)
            .map_err(|message| Error::new(Status::GenericFailure, message))?;
        Ok(match encoded {
            Some(encoded) => EncodedFaceOutput {
                embedding: Some(encoded.embedding),
                detection_score: Some(encoded.detection_score),
            },
            None => EncodedFaceOutput {
                embedding: None,
                detection_score: None,
            },
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(FaceEncodingResult {
            status: if output.embedding.is_some() {
                "encoded".to_string()
            } else {
                "no_face".to_string()
            },
            embedding: output.embedding.map(embedding_to_buffer),
            dimension: face_inference::FACE_EMBEDDING_DIMENSION as u32,
            model_version: face_inference::FACE_MODEL_VERSION.to_string(),
            detection_score: output.detection_score.map(f64::from),
        })
    }
}

#[napi(js_name = "encodeFace")]
pub fn encode_face(jpeg: Buffer, runtime_dir: String) -> AsyncTask<EncodeFaceTask> {
    AsyncTask::new(EncodeFaceTask {
        jpeg: jpeg.to_vec(),
        runtime_dir,
    })
}

#[napi(object)]
pub struct NativeFaceReference {
    pub view: String,
    pub embedding: Buffer,
}

struct StoredFaceReference {
    view: face::FaceView,
    embedding: Vec<f32>,
}

pub struct VerifyFaceOutput {
    status: String,
    approved: bool,
    distance: Option<f32>,
    view: Option<String>,
    detection_score: Option<f32>,
}

#[napi(object)]
pub struct FaceVerificationResult {
    pub status: String,
    pub approved: bool,
    pub distance: Option<f64>,
    pub view: Option<String>,
    pub model_version: String,
    pub detection_score: Option<f64>,
}

pub struct VerifyFaceTask {
    jpeg: Vec<u8>,
    runtime_dir: String,
    references: Vec<StoredFaceReference>,
    threshold: f32,
}

impl Task for VerifyFaceTask {
    type Output = VerifyFaceOutput;
    type JsValue = FaceVerificationResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let engine = face_engine(&self.runtime_dir)?;
        let mut engine = engine
            .lock()
            .map_err(|_| Error::new(Status::GenericFailure, "face engine lock is poisoned"))?;
        let Some(candidate) = engine
            .encode_jpeg(&self.jpeg)
            .map_err(|message| Error::new(Status::GenericFailure, message))?
        else {
            return Ok(VerifyFaceOutput {
                status: "no_face".to_string(),
                approved: false,
                distance: None,
                view: None,
                detection_score: None,
            });
        };
        let references: Vec<face::FaceReference<'_>> = self
            .references
            .iter()
            .map(|reference| face::FaceReference {
                view: reference.view,
                embedding: &reference.embedding,
            })
            .collect();
        let closest =
            face::closest_reference(&references, &candidate.embedding).map_err(|error| {
                Error::new(Status::InvalidArg, format!("invalid reference: {error:?}"))
            })?;
        let approved =
            face::is_within_threshold(closest.distance, self.threshold).map_err(|error| {
                Error::new(Status::InvalidArg, format!("invalid threshold: {error:?}"))
            })?;
        Ok(VerifyFaceOutput {
            status: if approved { "matched" } else { "unknown" }.to_string(),
            approved,
            distance: Some(closest.distance),
            view: Some(face_view_name(closest.view).to_string()),
            detection_score: Some(candidate.detection_score),
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(FaceVerificationResult {
            status: output.status,
            approved: output.approved,
            distance: output.distance.map(f64::from),
            view: output.view,
            model_version: face_inference::FACE_MODEL_VERSION.to_string(),
            detection_score: output.detection_score.map(f64::from),
        })
    }
}

#[napi(js_name = "verifyFace")]
pub fn verify_face(
    jpeg: Buffer,
    runtime_dir: String,
    references: Vec<NativeFaceReference>,
    threshold: f64,
) -> Result<AsyncTask<VerifyFaceTask>> {
    if references.is_empty() {
        return Err(Error::new(
            Status::InvalidArg,
            "at least one face reference is required",
        ));
    }
    let references = references
        .into_iter()
        .map(|reference| {
            let view = parse_face_view(&reference.view)?;
            let embedding = buffer_to_embedding(&reference.embedding)?;
            Ok(StoredFaceReference { view, embedding })
        })
        .collect::<Result<Vec<_>>>()?;
    if !threshold.is_finite() || threshold < 0.0 || threshold > f32::MAX as f64 {
        return Err(Error::new(Status::InvalidArg, "invalid face threshold"));
    }
    Ok(AsyncTask::new(VerifyFaceTask {
        jpeg: jpeg.to_vec(),
        runtime_dir,
        references,
        threshold: threshold as f32,
    }))
}

/// Compares two already-created SFace embeddings without running inference
/// again. Registration uses this to prevent one physical person from being
/// enrolled under a second shooter name.
#[napi(js_name = "faceEmbeddingDistance")]
pub fn face_embedding_distance(candidate: Buffer, reference: Buffer) -> Result<f64> {
    let candidate = buffer_to_embedding(&candidate)?;
    let reference = buffer_to_embedding(&reference)?;
    face::euclidean_distance(&candidate, &reference)
        .map(f64::from)
        .map_err(|error| {
            Error::new(
                Status::InvalidArg,
                format!("invalid face embedding: {error:?}"),
            )
        })
}

fn embedding_to_buffer(embedding: Vec<f32>) -> Buffer {
    let mut bytes = Vec::with_capacity(embedding.len() * size_of::<f32>());
    for value in embedding {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    Buffer::from(bytes)
}

fn buffer_to_embedding(bytes: &[u8]) -> Result<Vec<f32>> {
    if bytes.len() != face_inference::FACE_EMBEDDING_DIMENSION * size_of::<f32>() {
        return Err(Error::new(
            Status::InvalidArg,
            format!(
                "face embedding must contain {} bytes",
                face_inference::FACE_EMBEDDING_DIMENSION * size_of::<f32>()
            ),
        ));
    }
    Ok(bytes
        .chunks_exact(size_of::<f32>())
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

fn parse_face_view(view: &str) -> Result<face::FaceView> {
    match view {
        "front" => Ok(face::FaceView::Front),
        "side" => Ok(face::FaceView::Side),
        _ => Err(Error::new(
            Status::InvalidArg,
            format!("unknown face view: {view}"),
        )),
    }
}

fn face_view_name(view: face::FaceView) -> &'static str {
    match view {
        face::FaceView::Front => "front",
        face::FaceView::Side => "side",
    }
}
