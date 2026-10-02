"use client";

import { monthKey, monthLabel, shiftMonth } from "@/lib/format";

export function MonthSwitcher({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const current = monthKey(new Date());
  const isCurrent = value === current;
  return (
    <div className="flex items-center justify-between rounded-xl bg-black/5 p-1 dark:bg-white/10">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, -1))}
        className="flex h-9 w-12 items-center justify-center rounded-lg text-xl text-brand active:bg-black/5 dark:active:bg-white/10"
        aria-label="Предыдущий месяц"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => !isCurrent && onChange(current)}
        disabled={isCurrent}
        className="text-[15px] font-semibold tracking-tight disabled:cursor-default"
        title={isCurrent ? undefined : "К текущему месяцу"}
      >
        {monthLabel(value)}
        {!isCurrent && <span className="ml-1.5 text-[12px] text-brand">сегодня</span>}
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, 1))}
        className="flex h-9 w-12 items-center justify-center rounded-lg text-xl text-brand active:bg-black/5 dark:active:bg-white/10"
        aria-label="Следующий месяц"
      >
        ›
      </button>
    </div>
  );
}
