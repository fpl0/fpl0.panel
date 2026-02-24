import { For } from "solid-js";
import { toasts, dismissToast } from "../lib/store";

export function ToastContainer() {
  return (
    <div class="toast-container" aria-live="polite" role="status">
      <For each={toasts()}>
        {(toast) => (
          <div class={`toast toast-${toast.type}`}>
            <span class="toast-message">{toast.message}</span>
            <button class="toast-dismiss" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">&times;</button>
          </div>
        )}
      </For>
    </div>
  );
}
