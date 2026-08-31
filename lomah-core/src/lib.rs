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

fn cancel_flag() -> &'static AtomicBool {
    static FLAG: OnceLock<AtomicBool> = OnceLock::new();
    FLAG.get_or_init(|| AtomicBool::new(false))
}

#[napi(js_name = "getStoredMode")]
pub fn get_stored_mode() -> Option<String> {
    mode::stored_mode().map(|m| m.as_str().to_string())
}

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

#[napi(js_name = "getStoredAdminHost")]
pub fn get_stored_admin_host() -> Option<String> {
    mode::stored_admin_host()
}

#[napi(js_name = "setStoredAdminHost")]
pub fn set_stored_admin_host(host: String) -> Result<()> {
    mode::set_admin_host(&host).map_err(|e| Error::new(Status::GenericFailure, e.to_string()))
}

#[napi(js_name = "getLaunchMode")]
pub fn get_launch_mode() -> Option<String> {
    mode::launch_mode().map(|m| m.as_str().to_string())
}

#[napi(object)]
pub struct DiscoveryResult {
    pub host: String,
    pub port: u32,
}


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


#[napi(js_name = "startDiscovery")]
pub fn start_discovery(timeout_ms: u32, ignore_self: bool) -> AsyncTask<DiscoveryTask> {
    cancel_flag().store(false, Ordering::Relaxed);
    AsyncTask::new(DiscoveryTask {
        timeout_ms,
        ignore_self,
    })
}


#[napi(js_name = "cancelDiscovery")]
pub fn cancel_discovery() {
    cancel_flag().store(true, Ordering::Relaxed);
}


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
