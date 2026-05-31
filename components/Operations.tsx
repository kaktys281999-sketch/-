"use client";

import { useMemo, useState } from "react";
import { useStore, operationDelta } from "@/lib/store";
import { Operation } from "@/lib/types";
import { TYPES } from "@/lib/categories";
import {
  formatMoney,
  formatDateLong,
  monthKeyFromISO,
  monthLabel,
} from "@/lib/format";
import { Card, Money } from "./ui";
import { OperationForm } from "./OperationForm";

// Все категории для фильтра
const ALL_CATEGORIES = TYPES.flatMap((t) => t.categories.map((c) => c.name));

export function Operations({ month }: { month: string }) {
  const { state, updateOperation, deleteOperation } = useStore();
  const [filter, setFilter] = useState<string>("");
  const [editing, setEditing] = useState<Operation | null>(null);

  const monthOps = useMemo(() => {
    return state.operations
      .filter((o) => monthKeyFromISO(o.date) === month)
      .filter((o) => (filter ? o.category === filter : true))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [state.operations, month, filter]);

  // Группировка по дням
  const byDay = useMemo(() => {
    const map = new Map<string, Operation[]>();
    for (const op of monthOps) {
      const arr = map.get(op.date) ?? [];
      arr.push(op);
      map.set(op.date, arr);
    }
    return Array.from(map.entries());
  }, [monthOps]);

  const accountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "—";

  // Итог расходов за день
  const dayExpense = (ops: Operation[]) =>
    ops
      .filter((o) => o.type === "expense_personal" || o.type === "expense_work")
      .reduce((sum, o) => sum + o.amount, 0);

  if (editing) {
    return (
      <div className="space-y-3">
        <h1 className="px-1 text-lg font-bold">Редактировать операцию</h1>
        <Card>
          <OperationForm
            key={editing.id}
            initial={editing}
            submitLabel="Сохранить"
            onCancel={() => setEditing(null)}
            onSubmit={(op) => {
              updateOperation(editing.id, op);
              setEditing(null);
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (confirm("Удалить операцию?")) {
                deleteOperation(editing.id);
                setEditing(null);
              }
            }}
            className="mt-3 w-full rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-600 active:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:active:bg-red-950/60"
          >
            Удалить операцию
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="px-1 text-lg font-bold">Операции · {monthLabel(month)}</h1>

      {/* Фильтр по категории */}
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        <option value="">Все категории</option>
        {ALL_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {byDay.length === 0 && (
        <Card>
          <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            Операций за этот месяц нет
          </p>
        </Card>
      )}

      {byDay.map(([date, ops]) => {
        const expense = dayExpense(ops);
        return (
          <div key={date}>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {formatDateLong(date)}
              </span>
              {expense > 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  расход {formatMoney(expense)}
                </span>
              )}
            </div>
            <Card className="divide-y divide-slate-100 !p-0 dark:divide-slate-800">
              {ops.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setEditing(op)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {op.category}
                    </div>
                    <div className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {accountName(op.accountId)}
                      {op.note ? ` · ${op.note}` : ""}
                    </div>
                  </div>
                  <Money
                    value={operationDelta(op)}
                    showPlus
                    className="ml-3 shrink-0 font-semibold"
                  />
                </button>
              ))}
            </Card>
          </div>
        );
      })}
    </div>
  );
}
