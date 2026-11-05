"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ProgressResult } from "@/features/progress/actions";
const subscribe = () => () => {};
export function useBrowserZone() {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}
export function useProgress<T>(
  key: string,
  load: () => Promise<ProgressResult<T>>,
  enabled: boolean,
) {
  const [result, setResult] = useState<{
    key: string;
    result: ProgressResult<T>;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void load()
      .then((result) => {
        if (alive) setResult({ key, result });
      })
      .catch(() => {
        if (alive)
          setResult({
            key,
            result: { error: "Progress could not be loaded. Please retry." },
          });
      });
    return () => {
      alive = false;
    };
  }, [key, enabled, load]);
  return result?.key === key ? result.result : null;
}
