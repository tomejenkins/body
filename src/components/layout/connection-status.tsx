"use client";
import { useEffect, useState } from "react";

// Browser reachability is only a hint. An online event never confirms a save
// or proves that Auth/PostgREST is reachable.
export function ConnectionStatus() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <span role="status" className="connection-status">
      {offline ? "Offline · saving needs a connection" : ""}
    </span>
  );
}
