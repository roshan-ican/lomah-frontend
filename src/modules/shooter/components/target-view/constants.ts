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
 * solid circle per shot is the whole marker now.
 *
 * These are visual only. The tap target is TAP_HIT_RADIUS above and is
 * deliberately much larger — shrinking what is drawn must not shrink what can
 * be hit.
 */
export const MARKER_CORE_R = 2.6;

/**
 * Fill and stroke use the same red. Keeping the stroke width explicit lets
 * miss markers retain their dashed outline without changing hit geometry.
 */
export const MARKER_CORE_STROKE = 0.7;

/** Every recorded impact is one solid red mark, independent of score. */
export const MARKER_CORE_FILL = "#E11D48";
/** Half-length of each stroke of the X drawn for an off-face miss. */
export const MARKER_MISS_ARM = 3;

export const SVG_VIEW_BOX = "0 0 400 400";

export const EDGE_CLAMP_PAD = 15;
