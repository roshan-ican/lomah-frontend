//! Model-independent face-embedding comparison.
//!
//! The inference model will eventually turn a face into a vector of floating
//! point values. This module deliberately knows nothing about JPEGs, ONNX, the
//! database, or Node-API: it owns only the small, testable matching math.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DistanceError {
    EmptyEmbedding,
    DimensionMismatch { reference: usize, candidate: usize },
    NonFiniteValue,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FaceView {
    Front,
    Side,
}

#[derive(Clone, Copy, Debug)]
pub struct FaceReference<'a> {
    pub view: FaceView,
    pub embedding: &'a [f32],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ClosestMatch {
    pub view: FaceView,
    pub distance: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchError {
    NoReferences,
    InvalidEmbedding(DistanceError),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecisionError {
    InvalidDistance,
    InvalidThreshold,
}

impl From<DistanceError> for MatchError {
    fn from(error: DistanceError) -> Self {
        Self::InvalidEmbedding(error)
    }
}

/// Calculates the straight-line distance between two face embeddings.
///
/// A smaller result means the two vectors are more similar. The caller owns
/// the model-specific approval threshold; distance calculation must not hide a
/// policy decision inside the math.
pub fn euclidean_distance(reference: &[f32], candidate: &[f32]) -> Result<f32, DistanceError> {
    if reference.is_empty() || candidate.is_empty() {
        return Err(DistanceError::EmptyEmbedding);
    }

    if reference.len() != candidate.len() {
        return Err(DistanceError::DimensionMismatch {
            reference: reference.len(),
            candidate: candidate.len(),
        });
    }
    if reference
        .iter()
        .chain(candidate.iter())
        .any(|value| !value.is_finite())
    {
        return Err(DistanceError::NonFiniteValue);
    }

    let squared_distance = reference
        .iter()
        .zip(candidate.iter())
        .map(|(reference_value, candidate_value)| {
            let difference = reference_value - candidate_value;
            difference * difference
        })
        .sum::<f32>();

    Ok(squared_distance.sqrt())
}

/// Finds the stored reference with the smallest distance from the candidate.
///
/// References are ordered by preference. When distances are equal, the first
/// reference wins so a front/side tie remains deterministic.
pub fn closest_reference(
    references: &[FaceReference<'_>],
    candidate: &[f32],
) -> Result<ClosestMatch, MatchError> {
    let mut references = references.iter();
    let first = references.next().ok_or(MatchError::NoReferences)?;

    let mut closest = ClosestMatch {
        view: first.view,
        distance: euclidean_distance(first.embedding, candidate)?,
    };

    for reference in references {
        let distance = euclidean_distance(reference.embedding, candidate)?;

        if distance < closest.distance {
            closest = ClosestMatch {
                view: reference.view,
                distance,
            };
        }
    }

    Ok(closest)
}

/// Applies the model-specific approval policy to a calculated distance.
///
/// The boundary is inclusive: a distance exactly equal to the configured
/// threshold is accepted. The caller is responsible for choosing and
/// calibrating that threshold for the bundled recognition model.
pub fn is_within_threshold(distance: f32, threshold: f32) -> Result<bool, DecisionError> {
    if !distance.is_finite() || distance < 0.0 {
        return Err(DecisionError::InvalidDistance);
    }

    if !threshold.is_finite() || threshold < 0.0 {
        return Err(DecisionError::InvalidThreshold);
    }

    Ok(distance <= threshold)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_embeddings_have_zero_distance() {
        let embedding = [0.25, -0.5, 0.75];

        assert_eq!(euclidean_distance(&embedding, &embedding), Ok(0.0));
    }

    #[test]
    fn calculates_straight_line_distance() {
        let reference = [0.0, 0.0, 0.0];
        let candidate = [0.0, 3.0, 4.0];

        assert_eq!(euclidean_distance(&reference, &candidate), Ok(5.0));
    }

    #[test]
    fn rejects_empty_embeddings() {
        assert_eq!(
            euclidean_distance(&[], &[]),
            Err(DistanceError::EmptyEmbedding)
        );
    }

    #[test]
    fn rejects_different_dimensions() {
        assert_eq!(
            euclidean_distance(&[0.0, 1.0], &[0.0]),
            Err(DistanceError::DimensionMismatch {
                reference: 2,
                candidate: 1,
            })
        );
    }

    #[test]
    fn rejects_nan_and_infinity() {
        assert_eq!(
            euclidean_distance(&[0.0, f32::NAN], &[0.0, 1.0]),
            Err(DistanceError::NonFiniteValue)
        );
        assert_eq!(
            euclidean_distance(&[0.0, 1.0], &[0.0, f32::INFINITY]),
            Err(DistanceError::NonFiniteValue)
        );
    }

    #[test]
    fn selects_the_reference_with_the_smallest_distance() {
        let front = [0.0, 0.0];
        let side = [2.0, 2.0];
        let candidate = [1.8, 2.0];
        let references = [
            FaceReference {
                view: FaceView::Front,
                embedding: &front,
            },
            FaceReference {
                view: FaceView::Side,
                embedding: &side,
            },
        ];

        let result = closest_reference(&references, &candidate).unwrap();

        assert_eq!(result.view, FaceView::Side);
        assert!((result.distance - 0.2).abs() < f32::EPSILON);
    }

    #[test]
    fn keeps_the_first_reference_when_distances_are_equal() {
        let front = [0.0, 0.0];
        let side = [2.0, 0.0];
        let candidate = [1.0, 0.0];
        let references = [
            FaceReference {
                view: FaceView::Front,
                embedding: &front,
            },
            FaceReference {
                view: FaceView::Side,
                embedding: &side,
            },
        ];

        assert_eq!(
            closest_reference(&references, &candidate),
            Ok(ClosestMatch {
                view: FaceView::Front,
                distance: 1.0,
            })
        );
    }

    #[test]
    fn rejects_an_empty_reference_collection() {
        assert_eq!(
            closest_reference(&[], &[0.0, 1.0]),
            Err(MatchError::NoReferences)
        );
    }

    #[test]
    fn reports_an_invalid_reference_instead_of_skipping_it() {
        let invalid = [0.0];
        let references = [FaceReference {
            view: FaceView::Front,
            embedding: &invalid,
        }];

        assert_eq!(
            closest_reference(&references, &[0.0, 1.0]),
            Err(MatchError::InvalidEmbedding(
                DistanceError::DimensionMismatch {
                    reference: 1,
                    candidate: 2,
                }
            ))
        );
    }

    #[test]
    fn approves_a_distance_below_the_threshold() {
        assert_eq!(is_within_threshold(0.25, 0.6), Ok(true));
    }

    #[test]
    fn approves_a_distance_exactly_on_the_threshold() {
        assert_eq!(is_within_threshold(0.6, 0.6), Ok(true));
    }

    #[test]
    fn rejects_a_distance_above_the_threshold() {
        assert_eq!(is_within_threshold(0.61, 0.6), Ok(false));
    }

    #[test]
    fn rejects_invalid_distances() {
        assert_eq!(
            is_within_threshold(-0.01, 0.6),
            Err(DecisionError::InvalidDistance)
        );
        assert_eq!(
            is_within_threshold(f32::NAN, 0.6),
            Err(DecisionError::InvalidDistance)
        );
        assert_eq!(
            is_within_threshold(f32::INFINITY, 0.6),
            Err(DecisionError::InvalidDistance)
        );
    }

    #[test]
    fn rejects_invalid_thresholds() {
        assert_eq!(
            is_within_threshold(0.2, -0.1),
            Err(DecisionError::InvalidThreshold)
        );
        assert_eq!(
            is_within_threshold(0.2, f32::NAN),
            Err(DecisionError::InvalidThreshold)
        );
        assert_eq!(
            is_within_threshold(0.2, f32::INFINITY),
            Err(DecisionError::InvalidThreshold)
        );
    }
}
