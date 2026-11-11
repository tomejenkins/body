"use client";
import { useEffect } from "react";

export function OfflineRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !window.isSecureContext ||
      !("serviceWorker" in navigator)
    )
      return;
    // Registration failure/storage denial must never block the application.
    void navigator.serviceWorker
      .register("/body-sw.js", { updateViaCache: "none" })
      .catch(() => {});
  }, []);
  return null;
}
