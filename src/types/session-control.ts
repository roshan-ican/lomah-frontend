import { TranslationSet } from "../translations";
import { ActiveShooterChannel, LaneScheduleView, Shooter } from "../types";

/**
 * One target engaged for one bullet count and one clock.
 *
 * A session is an ordered sequence of these. WHICH targets exist to choose
 * from is decided by SUPER_ADMIN at commissioning; how many of them a relay
 * engages, in what order, and with how many rounds each is the ADMIN's call at
 * session setup. That split is the reason the two dashboards are separate.
 */
export interface StagePlanConfig {
    targetId: string;
    /** Absent means unlimited — the stage clock is what ends it. Never sent as
     *  0: the API's @Min(1) rejects that, so an unlimited stage omits the key. */
    bulletLimit?: number;
    durationSeconds?: number;
}

/** What the "configure session" form produces. */
export interface SessionConfig {
    shooterName: string;
    /** Fires in array order. Always at least one entry. */
    stages: StagePlanConfig[];
    notes: string;
    /** Display only: the distance of the first stage's target ("100m"), read
     *  off the commissioned target rather than typed by the admin. */
    distance?: string;
}

export interface SessionControlPanelProps {
    channel: ActiveShooterChannel | undefined;
    channels: ActiveShooterChannel[];
    setSelectedChannelId: (id: string) => void;
    /** Resolves TRUE only when the server accepted and stored the plan.
     *  The panel gates closing the edit form on this — a `void` return let a
     *  rejected save look identical to a successful one. */
    onCreateSession: (config: SessionConfig) => Promise<boolean>;
    onPauseSession: () => void;
    onResumeSession: () => void;
    onEndSession: () => void;
    /** Cut the current stage short and arm the next target. Optional: only
     *  multi-stage sessions render the control that calls it. */
    onAdvanceSession?: (channelId: string) => void;
    onDiscardSession: () => void;
    onSaveFeedback: (feedback: {
        triggerControl: number;
        breathing: number;
        targetAcquisition: number;
        comments: string;
    }) => void;
    onCancelSession: () => void;
    language: "en" | "ar";
    t: TranslationSet;
    availableShooters: Shooter[];
    activeLaneSchedules: LaneScheduleView[];
    variant?: "default" | "hud";
}
