"use client";

import { useEffect, useState } from "react";
import { localDateIn, type IsoDate } from "@/lib/sprintDay";

export type DeviceToday = { tz: string; today: IsoDate };

/**
 * The device's zone and calendar date, read after mount and again whenever the tab comes
 * back into view. Never read during render: the server renders in its own zone, so a
 * date computed there mismatches the client for hours a day, and a value memoised at
 * mount is yesterday's once midnight passes (full review 2026-09-09, #16). `null` until
 * the first read.
 */
export function useDeviceToday(): DeviceToday | null {
  const [value, setValue] = useState<DeviceToday | null>(null);
  useEffect(() => {
    const read = () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setValue({ tz, today: localDateIn(tz, new Date()) });
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);
  return value;
}
