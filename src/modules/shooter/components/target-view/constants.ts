// Pointer / drag tuning shared across the TargetView calibration flow.
export const POINTER_DRAG_THRESHOLD_PX = 8;
export const MOUSE_DRAG_DEAD_ZONE_MM = 2;
export const TOUCH_DRAG_DEAD_ZONE_MM = 10;

export const CENTER_LOCK_ENTER_MM = 10;
export const CENTER_LOCK_EXIT_MM = 15;
export const TOUCH_HIT_RADIUS = 40;

/**
 * Hit radius for plain tap-to-select (no calibration drag in progress).
 *
 * Deliberately much smaller than TOUCH_HIT_RADIUS: that 40-unit target is sized
 * for grabbing a marker mid-drag, where there is one intended shot and missing
 * it is worse than grabbing a neighbour. For selection the opposite is true —
 * at 40 units the invisible pads of adjacent shots in a tight group overlap so
 * heavily that the topmost one swallows taps meant for its neighbours. 16 is
 * forgiving enough for touch while staying tight enough that groups stay
 * individually selectable.
 *
 * Left at 16 when the drawn marker shrank to MARKER_CORE_R below. The pad is
 * now ~7x the visible hole, which is the point — a hole drawn at life size is
 * not a touch target. The cost is that two shots within 40mm have overlapping
 * pads while looking clearly separate; lower this if tight groups turn out to
 * be hard to pick apart in the hand.
 */
export const TAP_HIT_RADIUS = 16;

/**
 * Impact marker geometry, in SVG units.
 *
 * 1mm = MM_TO_SVG = 0.4 units on the 450×1000mm board, so these convert
 * straight to millimetres: MARKER_CORE_R of 2.2 draws an 11mm hole. A 7.62mm
 * round is 1.5 units, which is too small to see at a glance and far too small
 * to tap, so the marker is deliberately a little over life size — but only a
 * little.
 *
 * What it replaced: a core of r=8 (a 40mm crater), a glow disc at r=12 and a
 * separate centre dot at r=2.5, stacked. Three concentric shapes per shot is
 * why a group of three read as a set of rings rather than three holes. One
 * filled circle with a hard edge is the whole marker now; MARKER_EDGE_R is a
 * dark hairline just outside the coloured ring so the shot stays crisp against
 * the light tan of the face instead of dissolving into it.
 *
 * These are visual only. The tap target is TAP_HIT_RADIUS above and is
 * deliberately much larger — shrinking what is drawn must not shrink what can
 * be hit.
 */
export const MARKER_CORE_R = 2.6;
/** Slightly larger while calibrating: the marker is a drag handle then. */
export const MARKER_CORE_R_DRAG = 3.4;

/**
 * The ring is an accent, not the body of the marker.
 *
 * At 1.1 on a 2.2 core the coloured stroke covered roughly 40% of the marker's
 * area, so the eye read a red annulus with a dark middle — an outline, not a
 * hole. Thinning it to 0.7 and letting MARKER_CORE_FILL own the interior gives
 * the dense punched look a real hit has, with the colour doing only the job it
 * needs to: separating hit from miss, selected from not.
 */
export const MARKER_CORE_STROKE = 0.7;
export const MARKER_EDGE_STROKE = 0.6;

/**
 * A bullet hole is a hole — near-black in every theme, not a tinted disc.
 *
 * Deliberately not theme-derived. The old fill followed the surface (#ffffff
 * in HUD light, slate in the default skin), which made the marker read as a
 * bubble sitting on the face rather than a puncture through it. Contrast
 * against a dark backdrop is handled by MARKER_EDGE_STROKE, which draws the
 * background colour as a hairline around the ring.
 */
export const MARKER_CORE_FILL = "#08090C";
export const MARKER_SELECTED_R = 6.5;
export const MARKER_PULSE_R = 7.5;
export const MARKER_CLAMP_R = 5;
/** Half-length of each stroke of the X drawn for an off-face miss. */
export const MARKER_MISS_ARM = 3;

export const SVG_VIEW_BOX = "0 0 400 400";

export const EDGE_CLAMP_PAD = 15;
