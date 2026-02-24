/**
 * Toast notification system — ephemeral status messages.
 * Toasts auto-dismiss after 3 seconds and can be updated in-place or dismissed early.
 */
import { createSignal } from "solid-js";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "warn";
}

let toastId = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
const [toasts, setToasts] = createSignal<Toast[]>([]);
export { toasts };

function scheduleToastDismiss(id: number) {
  const prev = toastTimers.get(id);
  if (prev) clearTimeout(prev);
  toastTimers.set(
    id,
    setTimeout(() => {
      toastTimers.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000),
  );
}

export function addToast(message: string, type: Toast["type"] = "success") {
  const id = ++toastId;
  setToasts((prev) => [...prev, { id, message, type }]);
  scheduleToastDismiss(id);
  return id;
}

/** Update an existing toast in-place (message and/or type), then auto-dismiss. */
export function updateToast(id: number, message: string, type: Toast["type"] = "success") {
  setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, message, type } : t)));
  scheduleToastDismiss(id);
}

/** Immediately dismiss a toast and clean up its auto-dismiss timer. */
export function dismissToast(id: number) {
  const timer = toastTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    toastTimers.delete(id);
  }
  setToasts((prev) => prev.filter((t) => t.id !== id));
}
