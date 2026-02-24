interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: Props) {
  return (
    <div class="dialog-overlay" onClick={props.onCancel}>
      <div class="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h3>{props.title}</h3>
        <p>{props.message}</p>
        <div class="dialog-actions">
          <button class="btn" onClick={props.onCancel}>
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
