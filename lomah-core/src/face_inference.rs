//! Offline face detection and embedding inference.
//!
//! The browser/Electron side still owns the camera and sends a JPEG. This
//! module decodes that JPEG, detects one face with YuNet, aligns its five
//! landmarks, and creates an L2-normalised SFace embedding. It deliberately
//! does not know about NestJS or SQLite.

use std::path::{Path, PathBuf};

use image::{imageops::FilterType, Rgb, RgbImage};
use ort::{session::Session, value::Tensor};

// YuNet 2023mar declares a FIXED 1x3x640x640 input; its stride-8 head emits
// 6400 = (640/8)^2 anchors. Feeding any other size breaks the anchor grid.
// Verified by tests::detector_signature_matches_the_decoder.
const DETECTOR_SIZE: u32 = 640;
const DETECTOR_SCORE_THRESHOLD: f32 = 0.9;
const DETECTOR_NMS_THRESHOLD: f32 = 0.3;
const ALIGNED_FACE_SIZE: u32 = 112;

pub const FACE_MODEL_VERSION: &str = "yunet-2023mar+sface-int8-2021dec";
pub const FACE_EMBEDDING_DIMENSION: usize = 128;
pub const DEFAULT_SFACE_L2_THRESHOLD: f32 = 1.128;

const SFACE_LANDMARKS: [[f32; 2]; 5] = [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
];

#[derive(Clone, Debug)]
struct Detection {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    landmarks: [[f32; 2]; 5],
    score: f32,
}

#[derive(Debug)]
pub struct EncodedFace {
    pub embedding: Vec<f32>,
    pub detection_score: f32,
}

pub struct FaceEngine {
    runtime_dir: PathBuf,
    detector: Session,
    recognizer: Session,
}

impl FaceEngine {
    pub fn load(runtime_dir: impl AsRef<Path>) -> Result<Self, String> {
        let runtime_dir = runtime_dir
            .as_ref()
            .canonicalize()
            .map_err(|error| format!("face runtime directory is unavailable: {error}"))?;
        let onnx_runtime = runtime_dir.join("onnxruntime.dll");
        let detector_model = runtime_dir.join("face_detection_yunet.onnx");
        let recognizer_model = runtime_dir.join("face_recognition_sface_int8.onnx");

        for path in [&onnx_runtime, &detector_model, &recognizer_model] {
            if !path.is_file() {
                return Err(format!(
                    "required face runtime file is missing: {}",
                    path.display()
                ));
            }
        }

        ort::init_from(&onnx_runtime)
            .map_err(|error| format!("could not load ONNX Runtime: {error}"))?
            .with_name("lomah-face")
            .commit();

        let detector = load_session(&detector_model)
            .map_err(|error| format!("could not load YuNet: {error}"))?;
        let recognizer = load_session(&recognizer_model)
            .map_err(|error| format!("could not load SFace: {error}"))?;

        Ok(Self {
            runtime_dir,
            detector,
            recognizer,
        })
    }

    pub fn runtime_dir(&self) -> &Path {
        &self.runtime_dir
    }

    pub fn encode_jpeg(&mut self, jpeg: &[u8]) -> Result<Option<EncodedFace>, String> {
        let image = image::load_from_memory_with_format(jpeg, image::ImageFormat::Jpeg)
            .map_err(|error| format!("camera frame is not a valid JPEG: {error}"))?
            .to_rgb8();

        let detection = match self.detect_best_face(&image)? {
            Some(detection) => detection,
            None => return Ok(None),
        };
        let aligned = align_face(&image, &detection.landmarks)?;
        let embedding = self.create_embedding(&aligned)?;

        Ok(Some(EncodedFace {
            embedding,
            detection_score: detection.score,
        }))
    }

    fn detect_best_face(&mut self, image: &RgbImage) -> Result<Option<Detection>, String> {
        let mut letterbox = Letterbox::new(image);
        let tensor = Tensor::from_array((
            [1usize, 3, DETECTOR_SIZE as usize, DETECTOR_SIZE as usize],
            std::mem::take(&mut letterbox.bgr_chw),
        ))
        .map_err(|error| format!("could not prepare YuNet input: {error}"))?;
        let outputs = self
            .detector
            .run(ort::inputs![tensor])
            .map_err(|error| format!("YuNet inference failed: {error}"))?;

        let mut detections = Vec::new();
        for stride in [8usize, 16, 32] {
            let cls = output_vec(&outputs, &format!("cls_{stride}"))?;
            let obj = output_vec(&outputs, &format!("obj_{stride}"))?;
            let bbox = output_vec(&outputs, &format!("bbox_{stride}"))?;
            let kps = output_vec(&outputs, &format!("kps_{stride}"))?;
            let columns = DETECTOR_SIZE as usize / stride;

            for index in 0..cls.len() {
                let score = cls[index]
                    .clamp(0.0, 1.0)
                    .mul_add(obj[index].clamp(0.0, 1.0), 0.0)
                    .sqrt();
                if score < DETECTOR_SCORE_THRESHOLD {
                    continue;
                }
                let row = index / columns;
                let column = index % columns;
                let base = index * 4;
                let center_x = (column as f32 + bbox[base]) * stride as f32;
                let center_y = (row as f32 + bbox[base + 1]) * stride as f32;
                let width = bbox[base + 2].exp() * stride as f32;
                let height = bbox[base + 3].exp() * stride as f32;
                let mut landmarks = [[0.0; 2]; 5];
                for (landmark_index, landmark) in landmarks.iter_mut().enumerate() {
                    let keypoint_base = index * 10 + landmark_index * 2;
                    landmark[0] = (column as f32 + kps[keypoint_base]) * stride as f32;
                    landmark[1] = (row as f32 + kps[keypoint_base + 1]) * stride as f32;
                }
                detections.push(Detection {
                    x: center_x - width / 2.0,
                    y: center_y - height / 2.0,
                    width,
                    height,
                    landmarks,
                    score,
                });
            }
        }

        detections.sort_by(|left, right| right.score.total_cmp(&left.score));
        let mut kept: Vec<Detection> = Vec::new();
        for detection in detections {
            if kept.iter().all(|existing| {
                intersection_over_union(existing, &detection) <= DETECTOR_NMS_THRESHOLD
            }) {
                kept.push(detection);
            }
        }

        let Some(mut best) = kept.into_iter().next() else {
            return Ok(None);
        };
        letterbox.map_detection_to_source(&mut best);
        Ok(Some(best))
    }

    fn create_embedding(&mut self, aligned: &RgbImage) -> Result<Vec<f32>, String> {
        // BGR, not RGB: SFace was trained on OpenCV blobs, and OpenCV decodes
        // to BGR. Swapping red and blue costs no error and no crash — it just
        // quietly measures a differently-coloured face, which is worse.
        let plane = (ALIGNED_FACE_SIZE * ALIGNED_FACE_SIZE) as usize;
        let mut bgr_chw = vec![0.0_f32; plane * 3];
        for (index, pixel) in aligned.pixels().enumerate() {
            bgr_chw[index] = pixel[2] as f32;
            bgr_chw[plane + index] = pixel[1] as f32;
            bgr_chw[plane * 2 + index] = pixel[0] as f32;
        }
        let tensor = Tensor::from_array((
            [
                1usize,
                3,
                ALIGNED_FACE_SIZE as usize,
                ALIGNED_FACE_SIZE as usize,
            ],
            bgr_chw,
        ))
        .map_err(|error| format!("could not prepare SFace input: {error}"))?;
        let outputs = self
            .recognizer
            .run(ort::inputs![tensor])
            .map_err(|error| format!("SFace inference failed: {error}"))?;
        let mut embedding = output_vec(&outputs, "fc1")?;
        if embedding.len() != FACE_EMBEDDING_DIMENSION {
            return Err(format!(
                "SFace returned {} values; expected {FACE_EMBEDDING_DIMENSION}",
                embedding.len()
            ));
        }
        let length = embedding
            .iter()
            .map(|value| value * value)
            .sum::<f32>()
            .sqrt();
        if !length.is_finite() || length <= f32::EPSILON {
            return Err("SFace returned an invalid embedding".to_string());
        }
        for value in &mut embedding {
            *value /= length;
        }
        Ok(embedding)
    }
}

/// Builds one CPU session. The builder methods return a builder-carrying error
/// type, so `?` inside a function body is the only way to chain them.
fn load_session(model: &Path) -> ort::Result<Session> {
    Session::builder()?
        .with_intra_threads(2)?
        .commit_from_file(model)
}

fn output_vec(outputs: &ort::session::SessionOutputs<'_>, name: &str) -> Result<Vec<f32>, String> {
    outputs
        .get(name)
        .ok_or_else(|| format!("model output {name} is missing"))?
        .try_extract_array::<f32>()
        .map(|array| array.iter().copied().collect())
        .map_err(|error| format!("model output {name} has the wrong type: {error}"))
}

struct Letterbox {
    bgr_chw: Vec<f32>,
    scale: f32,
    offset_x: f32,
    offset_y: f32,
}

impl Letterbox {
    fn new(source: &RgbImage) -> Self {
        let scale = (DETECTOR_SIZE as f32 / source.width() as f32)
            .min(DETECTOR_SIZE as f32 / source.height() as f32);
        let resized_width = (source.width() as f32 * scale).round().max(1.0) as u32;
        let resized_height = (source.height() as f32 * scale).round().max(1.0) as u32;
        let offset_x = ((DETECTOR_SIZE - resized_width) / 2) as f32;
        let offset_y = ((DETECTOR_SIZE - resized_height) / 2) as f32;
        let resized =
            image::imageops::resize(source, resized_width, resized_height, FilterType::Triangle);
        let plane = (DETECTOR_SIZE * DETECTOR_SIZE) as usize;
        let mut bgr_chw = vec![0.0_f32; plane * 3];
        for (x, y, pixel) in resized.enumerate_pixels() {
            let target_x = x + offset_x as u32;
            let target_y = y + offset_y as u32;
            let index = (target_y * DETECTOR_SIZE + target_x) as usize;
            bgr_chw[index] = pixel[2] as f32;
            bgr_chw[plane + index] = pixel[1] as f32;
            bgr_chw[plane * 2 + index] = pixel[0] as f32;
        }
        Self {
            bgr_chw,
            scale,
            offset_x,
            offset_y,
        }
    }

    fn map_detection_to_source(&self, detection: &mut Detection) {
        detection.x = (detection.x - self.offset_x) / self.scale;
        detection.y = (detection.y - self.offset_y) / self.scale;
        detection.width /= self.scale;
        detection.height /= self.scale;
        for landmark in &mut detection.landmarks {
            landmark[0] = (landmark[0] - self.offset_x) / self.scale;
            landmark[1] = (landmark[1] - self.offset_y) / self.scale;
        }
    }
}

fn intersection_over_union(left: &Detection, right: &Detection) -> f32 {
    let intersection_left = left.x.max(right.x);
    let intersection_top = left.y.max(right.y);
    let intersection_right = (left.x + left.width).min(right.x + right.width);
    let intersection_bottom = (left.y + left.height).min(right.y + right.height);
    let intersection_width = (intersection_right - intersection_left).max(0.0);
    let intersection_height = (intersection_bottom - intersection_top).max(0.0);
    let intersection = intersection_width * intersection_height;
    let union = left.width * left.height + right.width * right.height - intersection;
    if union <= 0.0 {
        0.0
    } else {
        intersection / union
    }
}

fn align_face(source: &RgbImage, source_landmarks: &[[f32; 2]; 5]) -> Result<RgbImage, String> {
    let source_mean = mean_point(source_landmarks);
    let target_mean = mean_point(&SFACE_LANDMARKS);
    let mut denominator = 0.0_f32;
    let mut a_numerator = 0.0_f32;
    let mut b_numerator = 0.0_f32;
    for (source_point, target_point) in source_landmarks.iter().zip(SFACE_LANDMARKS) {
        let source_x = source_point[0] - source_mean[0];
        let source_y = source_point[1] - source_mean[1];
        let target_x = target_point[0] - target_mean[0];
        let target_y = target_point[1] - target_mean[1];
        denominator += source_x * source_x + source_y * source_y;
        a_numerator += source_x * target_x + source_y * target_y;
        b_numerator += source_x * target_y - source_y * target_x;
    }
    if denominator <= f32::EPSILON {
        return Err("face landmarks cannot be aligned".to_string());
    }
    let a = a_numerator / denominator;
    let b = b_numerator / denominator;
    let translate_x = target_mean[0] - a * source_mean[0] + b * source_mean[1];
    let translate_y = target_mean[1] - b * source_mean[0] - a * source_mean[1];
    let inverse_denominator = a * a + b * b;
    if inverse_denominator <= f32::EPSILON {
        return Err("face alignment transform is invalid".to_string());
    }

    let mut aligned = RgbImage::new(ALIGNED_FACE_SIZE, ALIGNED_FACE_SIZE);
    for target_y in 0..ALIGNED_FACE_SIZE {
        for target_x in 0..ALIGNED_FACE_SIZE {
            let shifted_x = target_x as f32 - translate_x;
            let shifted_y = target_y as f32 - translate_y;
            let source_x = (a * shifted_x + b * shifted_y) / inverse_denominator;
            let source_y = (-b * shifted_x + a * shifted_y) / inverse_denominator;
            aligned.put_pixel(
                target_x,
                target_y,
                bilinear_sample(source, source_x, source_y),
            );
        }
    }
    Ok(aligned)
}

fn mean_point(points: &[[f32; 2]; 5]) -> [f32; 2] {
    let sum = points.iter().fold([0.0_f32; 2], |mut sum, point| {
        sum[0] += point[0];
        sum[1] += point[1];
        sum
    });
    [sum[0] / points.len() as f32, sum[1] / points.len() as f32]
}

fn bilinear_sample(image: &RgbImage, x: f32, y: f32) -> Rgb<u8> {
    if x < 0.0
        || y < 0.0
        || x >= image.width().saturating_sub(1) as f32
        || y >= image.height().saturating_sub(1) as f32
    {
        return Rgb([0, 0, 0]);
    }
    let x0 = x.floor() as u32;
    let y0 = y.floor() as u32;
    let x1 = x0 + 1;
    let y1 = y0 + 1;
    let x_weight = x - x0 as f32;
    let y_weight = y - y0 as f32;
    let pixels = [
        image.get_pixel(x0, y0),
        image.get_pixel(x1, y0),
        image.get_pixel(x0, y1),
        image.get_pixel(x1, y1),
    ];
    let mut result = [0_u8; 3];
    for channel in 0..3 {
        let top =
            pixels[0][channel] as f32 * (1.0 - x_weight) + pixels[1][channel] as f32 * x_weight;
        let bottom =
            pixels[2][channel] as f32 * (1.0 - x_weight) + pixels[3][channel] as f32 * x_weight;
        result[channel] = (top * (1.0 - y_weight) + bottom * y_weight)
            .round()
            .clamp(0.0, 255.0) as u8;
    }
    Rgb(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn similarity_alignment_keeps_canonical_landmarks_stable() {
        let source = RgbImage::from_pixel(112, 112, Rgb([10, 20, 30]));
        let aligned = align_face(&source, &SFACE_LANDMARKS).unwrap();
        assert_eq!(aligned.get_pixel(56, 56), &Rgb([10, 20, 30]));
    }

    /// The downloaded models, or None when `npm run fetch:runtime` has not been
    /// run. Absent binaries skip rather than fail: they are gitignored, so a
    /// fresh clone must still be able to run `cargo test`.
    fn runtime_dir() -> Option<PathBuf> {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime");
        dir.join("onnxruntime.dll").is_file().then_some(dir)
    }

    fn tensor_shape(outlet: &ort::value::Outlet) -> Vec<i64> {
        match outlet.dtype() {
            ort::value::ValueType::Tensor { shape, .. } => shape.iter().copied().collect(),
            other => panic!("{} is not a tensor: {other:?}", outlet.name()),
        }
    }

    /// Pins the constants above to the real files. DETECTOR_SIZE in particular
    /// is not free to choose: YuNet declares a fixed input, and each stride
    /// head emits exactly (DETECTOR_SIZE / stride)^2 anchors, which is what
    /// detect_best_face divides by to recover the row and column of an anchor.
    #[test]
    fn detector_signature_matches_the_decoder() {
        let Some(runtime_dir) = runtime_dir() else {
            eprintln!("skipped: run `npm run fetch:runtime` to test against the real models");
            return;
        };
        ort::init_from(runtime_dir.join("onnxruntime.dll").to_str().unwrap())
            .expect("ONNX Runtime should load")
            .with_name("lomah-face-test")
            .commit();
        let detector = load_session(&runtime_dir.join("face_detection_yunet.onnx")).unwrap();

        let size = DETECTOR_SIZE as i64;
        assert_eq!(tensor_shape(&detector.inputs()[0]), vec![1, 3, size, size]);

        for stride in [8i64, 16, 32] {
            let anchors = (size / stride) * (size / stride);
            for (prefix, values_per_anchor) in [("cls", 1), ("obj", 1), ("bbox", 4), ("kps", 10)] {
                let name = format!("{prefix}_{stride}");
                let outlet = detector
                    .outputs()
                    .iter()
                    .find(|outlet| outlet.name() == name)
                    .unwrap_or_else(|| panic!("YuNet should expose {name}"));
                assert_eq!(
                    tensor_shape(outlet),
                    vec![1, anchors, values_per_anchor],
                    "{name} disagrees with DETECTOR_SIZE {DETECTOR_SIZE}"
                );
            }
        }
    }

    #[test]
    fn recogniser_signature_matches_the_embedding_constants() {
        let Some(runtime_dir) = runtime_dir() else {
            eprintln!("skipped: run `npm run fetch:runtime` to test against the real models");
            return;
        };
        ort::init_from(runtime_dir.join("onnxruntime.dll").to_str().unwrap())
            .expect("ONNX Runtime should load")
            .with_name("lomah-face-test")
            .commit();
        let recogniser =
            load_session(&runtime_dir.join("face_recognition_sface_int8.onnx")).unwrap();

        let face = ALIGNED_FACE_SIZE as i64;
        assert_eq!(
            tensor_shape(&recogniser.inputs()[0]),
            vec![1, 3, face, face]
        );
        assert_eq!(
            tensor_shape(&recogniser.outputs()[0]),
            vec![1, FACE_EMBEDDING_DIMENSION as i64]
        );
    }

    /// Runs a real image all the way through: JPEG decode, letterbox, YuNet,
    /// anchor decode, NMS. A photograph with no face in it must come back as
    /// Ok(None) — an Err here means the pipeline itself is broken, which is a
    /// different failure from "nobody was in frame".
    #[test]
    fn an_image_without_a_face_is_not_an_error() {
        let Some(runtime_dir) = runtime_dir() else {
            eprintln!("skipped: run `npm run fetch:runtime` to test against the real models");
            return;
        };
        let jpeg = std::fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("public")
                .join("Fig11Target.jpg"),
        )
        .expect("the bundled target image should be readable");

        let mut engine = FaceEngine::load(&runtime_dir).expect("engine should load");
        assert!(engine.encode_jpeg(&jpeg).unwrap().is_none());
    }

    #[test]
    fn non_overlapping_boxes_have_zero_iou() {
        let detection = |x| Detection {
            x,
            y: 0.0,
            width: 10.0,
            height: 10.0,
            landmarks: [[0.0; 2]; 5],
            score: 1.0,
        };
        assert_eq!(
            intersection_over_union(&detection(0.0), &detection(20.0)),
            0.0
        );
    }
}
