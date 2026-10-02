"use client";

import { useStore } from "@/lib/store";

// Компактный индикатор синхронизации в шапке.
// ↻ идёт · ✓ ок · ⚠️ ошибка. Тап — синхронизировать сейчас.
export function SyncBadge() {
  const { sync, syncState, pullNow } = useStore();

  // Синхронизация не настроена — ничего не показываем
  if (!sync.url.trim()) return null;

  const { status } = syncState;

  const map = {
    syncing: { icon: "↻", cls: "text-slate-400", label: "Синхронизация…", spin: true },
    ok: { icon: "✓", cls: "text-emerald-500", label: "Синхронизировано", spin: false },
    error: { icon: "⚠️", cls: "text-amber-500", label: "Ошибка синхронизации", spin: false },
    idle: { icon: "↻", cls: "text-slate-300 dark:text-slate-600", label: "Синхронизировать", spin: false },
    offline: { icon: "⚠️", cls: "text-amber-500", label: "Нет сети", spin: false },
  } as const;

  const s = map[status] ?? map.idle;

  return (
    <button
      type="button"
      onClick={() => void pullNow()}
      title={s.label}
      aria-label={s.label}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-base active:bg-slate-200/60 dark:active:bg-slate-700/60 ${s.cls}`}
    >
      <span className={s.spin ? "inline-block animate-spin" : ""}>{s.icon}</span>
    </button>
  );
}
