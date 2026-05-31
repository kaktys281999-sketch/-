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
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, -1))}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800"
        aria-label="Предыдущий месяц"
      >
        ‹
      </button>
      <span className="text-base font-semibold">{monthLabel(value)}</span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, 1))}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800"
        aria-label="Следующий месяц"
      >
        ›
      </button>
    </div>
  );
}
