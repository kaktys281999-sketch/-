"use client";

import { AppState } from "@/lib/types";
import { monthKeyFromISO, formatMoney } from "@/lib/format";
import { Card } from "./ui";

// Расходы по категориям за месяц (личное + рабочее)
function expensesByCategory(state: AppState, month: string) {
  const map = new Map<string, number>();
  for (const op of state.operations) {
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
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">
          Расходы по категориям
        </span>
        {total > 0 && (
          <span className="text-sm font-semibold">{formatMoney(total)}</span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-3 text-center text-sm text-slate-400">
          Расходов в этом месяце пока нет
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => {
            const percent = total > 0 ? (r.amount / total) * 100 : 0;
            return (
              <div key={r.category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="truncate pr-2 text-slate-700">
                    {r.category}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {formatMoney(r.amount)} · {Math.round(percent)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{
                      width: `${percent}%`,
                      opacity: 1 - i * 0.12,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
