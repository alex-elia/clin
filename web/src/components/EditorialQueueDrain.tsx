"use client";

import { useEffect, useRef } from "react";

/** Once per browser session, drain due editorial jobs when the app loads. */
export function EditorialQueueDrain() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (typeof window === "undefined") return;
    const key = "clin.editorial.tick";
    if (sessionStorage.getItem(key)) return;
    ran.current = true;
    sessionStorage.setItem(key, "1");
    void fetch("/api/branding/jobs/tick", { method: "POST" }).catch(() => {
      /* optional UX improvement — ignore failures */
    });
  }, []);

  return null;
}
