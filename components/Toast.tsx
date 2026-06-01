"use client";

// Снэкбар с действием «Отменить». Появляется снизу над навигацией.
export function UndoToast({
  message,
  actionLabel = "Отменить",
  onAction,
  onClose,
}: {
  message: string;
  actionLabel?: string;
  onAction: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4">
      <div className="animate-fadein pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/10 dark:bg-slate-800">
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={onAction}
          className="font-semibold text-brand"
          style={{ color: "#a78bfa" }}
        >
          {actionLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="text-slate-400 active:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
