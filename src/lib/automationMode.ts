import { useSyncExternalStore } from "react";

// A per-operator view preference: it only decides whether the console shows the
// automation dashboard. Runs and their database are chosen by the backend.
const KEY = "portless.automation-mode";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

let current = read();

export function setAutomationMode(on: boolean) {
  current = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Private windows can refuse storage; the toggle still works for this visit.
  }
  listeners.forEach((listener) => listener());
}

export function isAutomationMode(): boolean {
  return current;
}

export function useAutomationMode(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
