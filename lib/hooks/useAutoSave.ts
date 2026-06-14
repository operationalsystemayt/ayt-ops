// lib/hooks/useAutoSave.ts
"use client";
import { useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounced auto-save for edits to an existing record.
 * Skips the save on first mount — only fires when `value` changes afterwards.
 */
export function useAutoSave<T>(value: T, onSave: (val: T) => Promise<void>, delay = 800) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const mountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(() => {
      onSaveRef.current(value)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);

  return { status };
}
