"use client";

import { useEffect, useRef } from "react";
import { clinFetch } from "@/lib/clinFetch";

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
    void clinFetch("/api/branding/jobs/tick", { method: "POST" }).catch(() => {
      /* optional UX improvement — ignore failures */
    });
  }, []);

  return null;
}
