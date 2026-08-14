import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { TargetCalibrationPanel } from "./modules/admin/components/admin-dashboard/TargetCalibrationPanel";
import { CalibrationTargetFace } from "./modules/admin/components/admin-dashboard/CalibrationTargetFace";
import type { Target } from "./types";

const target = {
  id: "t1", laneId: 2, label: "A2", distanceM: 25, positionIndex: 0,
  ipAddress: "192.168.4.12", commandHost: null, commandPort: null,
  deviceId: null, offsetXmm: 401, offsetYmm: -862, profileType: "FIGURE",
  lastSeenAt: null, rssi: null, firmwareVersion: "1.0",
  createdAt: "", updatedAt: "",
} as Target;

function Harness() {
  return (
    <div className="p-6 max-w-[1100px] space-y-6">
      <TargetCalibrationPanel
        target={target}
        siblings={[]}
        isAr={false}
        onNotice={(m) => console.log("notice", m)}
        onError={(m) => console.log("error", m)}
        onCalibrated={() => {}}
      />
      <div className="rounded-lg border border-hud bg-hud-elevated/60 p-3 flex gap-4">
        <CalibrationTargetFace
          profileType="FIGURE"
          reads={[
            { shot: 1, sensorX: -60, sensorY: 140, score: 4 },
            { shot: 2, sensorX: -48, sensorY: 122, score: 4 },
          ]}
          offsetXmm={0}
          offsetYmm={0}
          selectedShot={1}
          trueX={40}
          trueY={230}
          trueMarked
          onPickTrue={() => {}}
          isAr={false}
          size={300}
          connectReads
        />
        <CalibrationTargetFace
          profileType="CIRCULAR"
          reads={[{ shot: 1, sensorX: 120, sensorY: -180, score: 3 }]}
          offsetXmm={0}
          offsetYmm={0}
          selectedShot={1}
          trueX={0}
          trueY={0}
          trueMarked
          onPickTrue={() => {}}
          isAr={false}
          size={300}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
