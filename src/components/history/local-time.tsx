"use client";
import { useSyncExternalStore } from "react";
import { localTimestamp } from "@/features/history/model";
const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => null;
export function LocalTime({ value }: { value: string }) {
  const zone = useSyncExternalStore(subscribe, browserZone, serverZone);
  return (
    <time dateTime={value}>{zone ? localTimestamp(value, zone) : "…"}</time>
  );
}
