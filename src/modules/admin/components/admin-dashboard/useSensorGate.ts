import { useEffect, useState } from "react";
import { api, apiFetchJson, ApiError } from "../../../../utils/api";
import type { SensorGate } from "./types";

interface Params {
  isAr: boolean;
  triggerSuccessBanner: (msg: string) => void;
}

/**
 * Tracks the backend sensor gate (whether incoming shots are accepted) via
 * an initial fetch plus the `lomah:sensor-gate` broadcast event, and exposes
 * a setter that pushes hold/release changes to the backend.
 */
export function useSensorGate({ isAr, triggerSuccessBanner }: Params) {
  const [sensorGate, setSensorGate] = useState<SensorGate>({
    adminHeld: true,
    accepting: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    apiFetchJson<SensorGate>("/api/sensor-gate", { signal: controller.signal })
      .then((data) => setSensorGate(data))
      .catch((err) => {
        if (err.name !== "AbortError")
          console.warn("[Sensor Gate] Fetch failed:", err);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onGate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setSensorGate(detail);
    };
    window.addEventListener("lomah:sensor-gate", onGate);
    return () => window.removeEventListener("lomah:sensor-gate", onGate);
  }, []);

  const setSensorHold = async (held: boolean) => {
    try {
      const data = await api.post<SensorGate>("/sensor-gate", { held });
      setSensorGate(data);
      triggerSuccessBanner(
        held
          ? isAr
            ? "المستشعر متوقف — الضربات الواردة تُتجاهل"
            : "Sensor held — incoming shots ignored"
          : isAr
            ? "المستشعر نشط — تُقبل الضربات عند تشغيل الجلسة"
            : "Sensor live — hits accepted when session is active",
      );
    } catch (err) {
      triggerSuccessBanner(
        err instanceof ApiError
          ? isAr
            ? "فشل التحكم بالمستشعر — أعد تشغيل الخادم"
            : "Sensor control failed — restart backend (npm run dev)"
          : isAr
            ? "فشل الاتصال بالخادم"
            : "Could not reach backend",
      );
    }
  };

  return { sensorGate, setSensorHold };
}
