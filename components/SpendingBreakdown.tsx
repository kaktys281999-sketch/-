"use client";

import { AppState } from "@/lib/types";
import { monthKeyFromISO, formatMoney } from "@/lib/format";
import { Card } from "./ui";

// Расходы по категориям за месяц (личное + рабочее)
function expensesByCategory(state: AppState, month: string) {
  const map = new Map<string, number>();
  for (const op of state.operations) {
    if (op.deleted) continue;
    if (monthKeyFromISO(op.date) !== month) continue;
    if (op.type !== "expense_personal" && op.type !== "expense_work") continue;
    map.set(op.category, (map.get(op.category) ?? 0) + op.amount);
  }
  const rows = Array.from(map.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, total };
}

export function SpendingBreakdown({
  state,
  month,
}: {
  state: AppState;
  month: string;
}) {
  const { rows, total } = expensesByCategory(state, month);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[13px] font-medium uppercase tracking-wide text-label-2">
          Расходы по категориям
        </span>
        {total > 0 && (
          <span className="text-[13px] font-semibold text-label-2">
            {formatMoney(total)}
          </span>
        )}
      </div>
      <Card>
      {rows.length === 0 ? (
        <p className="py-3 text-center text-sm text-label-3">
          Расходов в этом месяце пока нет
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => {
            const budget = state.budgets?.[r.category] ?? 0;
            const hasBudget = budget > 0;
            const over = hasBudget && r.amount > budget;
            // ширина: к лимиту (если задан) иначе доля от общих расходов
            const fill = hasBudget
              ? Math.min(100, (r.amount / budget) * 100)
              : total > 0
              ? (r.amount / total) * 100
              : 0;
            return (
              <div key={r.category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="truncate pr-2 text-slate-700 dark:text-slate-200">
                    {r.category}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                    {hasBudget ? (
                      <>
                        {formatMoney(r.amount)}{" "}
                        <span
                          className={
                            over
                              ? "text-red-600 dark:text-red-400"
                              : "text-slate-400 dark:text-slate-500"
                          }
                        >
                          / {formatMoney(budget)}
                        </span>
                      </>
                    ) : (
                      <>
                        {formatMoney(r.amount)} ·{" "}
                        {Math.round(total > 0 ? (r.amount / total) * 100 : 0)}%
                      </>
                    )}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      over ? "bg-red-500" : "bg-brand"
                    }`}
                    style={{
                      width: `${fill}%`,
                      opacity: hasBudget ? 1 : 1 - i * 0.12,
                    }}
                  />
                </div>
                {over && (
                  <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                    Превышен на {formatMoney(r.amount - budget)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </Card>
    </div>
  );
}
