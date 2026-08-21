export type ScheduleIdentitySource = "LOCAL" | "MANUAL" | "EXTERNAL";

export interface LaneScheduleAttendee {
  id: string;
  shooterId: string | null;
  displayName: string;
  identitySource: ScheduleIdentitySource;
  externalProvider: string | null;
  externalId: string | null;
}

interface LaneScheduleBase {
  id: string;
  laneId: number;
  laneName: string;
  startsAt: string;
  endsAt: string;
}

export interface OwnedLaneSchedule extends LaneScheduleBase {
  access: "OWNER";
  cancelledAt: string | null;
  attendees: LaneScheduleAttendee[];
}

export interface BusyLaneSchedule extends LaneScheduleBase {
  access: "BUSY";
}

export type LaneScheduleView = OwnedLaneSchedule | BusyLaneSchedule;

export interface LaneScheduleAttendeeInput {
  identitySource: ScheduleIdentitySource;
  shooterId?: string;
  displayName?: string;
  externalProvider?: string;
  externalId?: string;
}

export interface LaneScheduleInput {
  laneId: number;
  startsAt: string;
  endsAt: string;
  attendees: LaneScheduleAttendeeInput[];
}
