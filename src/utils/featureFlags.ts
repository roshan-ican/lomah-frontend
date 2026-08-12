/**
 * Click/tap-to-fire — OFF.
 *
 * A click on the target board, and the "Test Shot" button, both POST
 * /debug/simulate-shot. That endpoint scores and persists exactly like a real
 * bullet: the shot lands in the shot log, in the session totals and in reports,
 * indistinguishable from live fire. On a live range that means a stray tap on a
 * touchscreen — or an admin resting a hand on a lane board — silently forges a
 * round.
 *
 * Every surface that could fire this way reads the flag below (shooter view,
 * station terminal and the admin lane board all render TargetView), so this is
 * the only line to change to bring it back for local testing.
 *
 * Typed as `boolean` on purpose: without the annotation TypeScript narrows it
 * to the literal `false` and reports every guarded branch as dead code.
 */
export const CLICK_TO_FIRE_ENABLED: boolean = false;
