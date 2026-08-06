import { Shooter } from "@/src/types";
import React from "react";

interface ReportFiltersProps {
  shooters: Shooter[];
  selectedShooter: string;
  onShooterChange: (username: string) => void;
  rangePreset: "7d" | "30d" | "90d" | "custom";
  onRangePresetChange: (preset: "7d" | "30d" | "90d" | "custom") => void;
  fromDate: string;
  toDate: string;
  onFromDateChange: (v: string) => void;
  onToDateChange: (v: string) => void;
  isAr: boolean;
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({
  shooters,
  selectedShooter,
  onShooterChange,
  rangePreset,
  onRangePresetChange,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  isAr,
}) => (
  <div className="hud-glass rounded-lg p-3 flex flex-wrap gap-3 items-end">
    <div className="flex flex-col gap-1.5 min-w-[140px]">
      <label className="hud-label">{isAr ? "الرامي" : "Shooter"}</label>
      <select
        value={selectedShooter}
        onChange={(e) => onShooterChange(e.target.value)}
        className="hud-form-input rounded-lg px-3 py-2 admin-text-xs font-mono"
      >
        {shooters.map((s) => (
          <option key={s.id} value={s.name}>
            {s.name}
            {s.rank ? ` (${s.rank})` : ""}
          </option>
        ))}
      </select>
    </div>

    <div className="flex flex-col gap-1.5">
      <label className="hud-label">{isAr ? "الفترة" : "Period"}</label>
      <div className="hud-tab-well flex gap-0.5 flex-wrap">
        {(["7d", "30d", "90d", "custom"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onRangePresetChange(p)}
            className={`px-2.5 py-1.5 rounded-md admin-text-2xs font-mono font-bold transition-colors cursor-pointer ${
              rangePreset === p ? "hud-tab--active" : "hud-tab--idle"
            }`}
          >
            {p === "custom" ? (isAr ? "مخصص" : "Custom") : p}
          </button>
        ))}
      </div>
    </div>

    {rangePreset === "custom" && (
      <div className="flex flex-col gap-1.5">
        <label className="hud-label">{isAr ? "من — إلى" : "From — To"}</label>
        <div className="flex gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            className="hud-form-input rounded-lg px-2 py-1.5 admin-text-xs font-mono"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            className="hud-form-input rounded-lg px-2 py-1.5 admin-text-xs font-mono"
          />
        </div>
      </div>
    )}
  </div>
);
