"use client";

import { useStore } from "@/lib/store";

// Кнопка «Сохранить» в шапке — отправляет данные в Google-таблицу (push),
// чтобы не заходить каждый раз в настройки. Статус виден рядом в SyncBadge.
export function SaveButton() {
  const { sync, syncState, pushNow } = useStore();
  if (!sync.url.trim()) return null;

  const busy = syncState.status === "syncing";

  return (
    <button
      type="button"
      onClick={() => void pushNow()}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-[14px] font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-50"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
        aria-hidden="true"
      >
        {busy ? (
          <path
            d="M12 3a9 9 0 1 0 9 9"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ) : (
          <>
            <path
              d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M8 4v5h7V4M8 21v-7h8v7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>
      {busy ? "Сохраняю…" : "Сохранить"}
    </button>
  );
}
