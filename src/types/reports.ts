// Report shapes are defined once in shared/types/reports.ts, matching what
// ReportsService actually returns. This file re-exports them under the names
// the report components already use, and keeps the date-range helpers.
//
// Everything is camelCase now — the old Express backend returned raw SQLite
// rows (lane_id, shot_count, avg_score), while Prisma returns model fields.

import type {
  ShooterReport,
  ShooterReportSession,
  ShooterShotsReport,
  ShooterSummary,
  ShooterTrendPoint,
} from "@shared/types/reports";

export type ShooterReportPayload = ShooterReport;
export type ShooterReportSummary = ShooterSummary;
export type ShooterSessionRow = ShooterReportSession;
export type DayShotPayload = ShooterShotsReport;
export type { ShooterTrendPoint };

export type DateRangePreset = "7d" | "30d" | "90d" | "custom";

export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function presetToRange(preset: DateRangePreset): {
  from: string;
  to: string;
} {
  const to = new Date();
  const from = new Date();
  if (preset === "7d") from.setDate(from.getDate() - 7);
  else if (preset === "30d") from.setDate(from.getDate() - 30);
  else if (preset === "90d") from.setDate(from.getDate() - 90);
  else from.setDate(from.getDate() - 30);
  return { from: formatDateISO(from), to: formatDateISO(to) };
}
