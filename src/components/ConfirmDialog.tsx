import { onMount, onCleanup } from "solid-js";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: Props) {
  let cardRef: HTMLDivElement | undefined;
  let cancelRef: HTMLButtonElement | undefined;

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onCancel();
      return;
    }
    // Focus trap: cycle focus within the dialog
    if (e.key === "Tab" && cardRef) {
      const focusable = cardRef.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
    cancelRef?.focus();
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div class="dialog-overlay" onClick={props.onCancel}>
      <div
        ref={cardRef}
        class="dialog-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="dialog-title">{props.title}</h3>
        <p id="dialog-desc">{props.message}</p>
        <div class="dialog-actions">
          <button class="btn" ref={cancelRef} onClick={props.onCancel}>
            Cancel
          </button>
          <button
            class={`btn ${props.danger ? "btn-danger" : "btn-primary"}`}
            onClick={props.onConfirm}
          >
            {props.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
