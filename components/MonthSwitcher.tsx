"use client";

import { monthLabel, shiftMonth } from "@/lib/format";

export function MonthSwitcher({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
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
      <span className="text-[15px] font-semibold tracking-tight">
        {monthLabel(value)}
      </span>
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
