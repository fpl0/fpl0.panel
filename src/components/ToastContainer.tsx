import { For } from "solid-js";
import { toasts } from "../lib/store";

export function ToastContainer() {
  return (
    <div class="toast-container">
      <For each={toasts()}>
        {(toast) => (
          <div class={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        )}
      </For>
    </div>
  );
}
