"use client";

import { AppState } from "@/lib/types";
import { monthSummary } from "@/lib/store";
import { shiftMonth, monthShortLabel, formatMoney } from "@/lib/format";
import { Card } from "./ui";

// Динамика доход/расход за последние 6 месяцев (заканчивая выбранным)
export function MonthlyTrend({
  state,
  month,
  onSelectMonth,
}: {
  state: AppState;
  month: string;
  onSelectMonth?: (key: string) => void;
}) {
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const data = months.map((m) => ({ key: m, ...monthSummary(state, m) }));
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[13px] font-medium uppercase tracking-wide text-label-2">
          Динамика по месяцам
        </span>
        <div className="flex items-center gap-3 text-[12px] text-label-2">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Доход
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Расход
          </span>
        </div>
      </div>
      <Card>
      <div className="flex items-end justify-between gap-1.5">
        {data.map((d) => {
          const active = d.key === month;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => onSelectMonth?.(d.key)}
              className="group flex flex-1 flex-col items-center gap-1.5"
            >
              <div className="flex h-24 items-end gap-[3px]">
                <Bar value={d.income} max={max} className="bg-emerald-500" />
                <Bar value={d.expense} max={max} className="bg-red-500" />
              </div>
              <span
                className={`text-[11px] font-medium ${
                  active
                    ? "text-brand"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {monthShortLabel(d.key)}
              </span>
            </button>
          );
        })}
      </div>
      </Card>
    </div>
  );
}

function Bar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className: string;
}) {
  // минимальная видимая высота для ненулевых значений
  const pct = value > 0 ? Math.max(6, (value / max) * 100) : 0;
  return (
    <div
      title={formatMoney(value)}
      className={`w-2.5 rounded-t-md transition-all ${className}`}
      style={{ height: `${pct}%` }}
    />
  );
}
