"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api, type CustomTemplate } from "@/lib/client";

/** ที่เก็บรายการรูปแบบที่นำเข้า (ใช้ร่วมกันทุกหน้าจอ) */
let state: { list: CustomTemplate[]; loaded: boolean; error: string | null } = { list: [], loaded: false, error: null };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

const emit = () => listeners.forEach((l) => l());

export function reloadCustomTemplates() {
  inflight = api<{ templates: CustomTemplate[] }>("/api/templates")
    .then((r) => {
      state = { list: r.templates, loaded: true, error: null };
    })
    .catch((e) => {
      state = { ...state, loaded: true, error: e instanceof Error ? e.message : String(e) };
    })
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

export function setCustomTemplates(list: CustomTemplate[]) {
  state = { ...state, list };
  emit();
}

export function useCustomTemplates() {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  useEffect(() => {
    if (!state.loaded && !inflight) reloadCustomTemplates();
  }, []);
  return snap;
}
