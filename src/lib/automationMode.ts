import { useSyncExternalStore } from "react";

// A per-operator view preference: it only decides whether the console shows the
// automation dashboard. Runs and their database are chosen by the backend.
const KEY = "portless.automation-mode";

// Automation mode is a local tool: it needs the backend to start a second app and
// run long test workers, which the deployed (serverless) backend cannot do. So the
// toggle, the menu entry and the page exist only on the local dev server
// (`npm run dev`) or in a local build made with VITE_AUTOMATION_ENABLED=true.
// Everywhere else the mode is always off — even if a browser saved it as on.
export const AUTOMATION_AVAILABLE: boolean =
  import.meta.env.DEV || (import.meta.env.VITE_AUTOMATION_ENABLED ?? "").trim().toLowerCase() === "true";
const listeners = new Set<() => void>();

function read(): boolean {
  if (!AUTOMATION_AVAILABLE) return false;
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

let current = read();

export function setAutomationMode(on: boolean) {
  if (!AUTOMATION_AVAILABLE) on = false;
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
