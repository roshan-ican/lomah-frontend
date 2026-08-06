import React from "react";
import { Target, MonitorSmartphone } from "lucide-react";

interface StationDashboardWrapperProps {
  laneId: number;
}

export function StationDashboardWrapper({
  laneId,
}: StationDashboardWrapperProps) {
  return (
    <div className="flex-grow flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white font-mono p-6 relative overflow-hidden select-none">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-zinc-900 rounded-full opacity-40 pointer-events-none flex items-center justify-center">
        <div className="w-[400px] h-[400px] border border-zinc-900 rounded-full flex items-center justify-center">
          <div className="w-[200px] h-[200px] border border-zinc-900 rounded-full"></div>
        </div>
      </div>

      <div className="z-10 text-center space-y-6 max-w-md">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-lg">
          <Target className="w-7 h-7 text-amber-500 animate-pulse" />
        </div>

        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-widest text-zinc-300">
            LANE <span className="text-amber-500">{laneId}</span>
          </h1>
          <p className="admin-text-sm uppercase tracking-widest text-zinc-500 font-bold">
            Hardware Terminal Online
          </p>
        </div>

        <div className="p-3.5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl flex items-center gap-3 text-left">
          <MonitorSmartphone className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="admin-text-sm text-zinc-400 leading-relaxed font-sans">
            Device authenticated via fixed network routing.
            <br /> Standing by for range officer configuration details...
          </p>
        </div>
      </div>
    </div>
  );
}
