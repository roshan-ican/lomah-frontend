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
 * comfortably larger than the 11-unit drawn marker (so touch is forgiving)
 * while staying tight enough that groups stay individually selectable.
 */
export const TAP_HIT_RADIUS = 16;

export const SVG_VIEW_BOX = "0 0 400 400";

export const EDGE_CLAMP_PAD = 15;
