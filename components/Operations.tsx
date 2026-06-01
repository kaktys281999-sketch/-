"use client";

import { useMemo, useState } from "react";
import { useStore, operationDelta } from "@/lib/store";
import { Operation, OpType } from "@/lib/types";
import {
  formatMoney,
  formatDateLong,
  monthKeyFromISO,
  monthLabel,
} from "@/lib/format";
import { Card, Money } from "./ui";
import { OperationForm } from "./OperationForm";

// Цвет-метка по типу операции
const TYPE_COLOR: Record<OpType, string> = {
  income: "#10b981",
  expense_personal: "#f43f5e",
  expense_work: "#f59e0b",
  credit_loan: "#6926E3",
};

export function Operations({ month }: { month: string }) {
  const { state, updateOperation, deleteOperation } = useStore();
  const [filter, setFilter] = useState<string>("");
  const [editing, setEditing] = useState<Operation | null>(null);

  // Операции месяца (без учёта фильтра) — для расчёта доступных категорий
  const monthAll = useMemo(
    () =>
      state.operations.filter(
        (o) => !o.deleted && monthKeyFromISO(o.date) === month
      ),
    [state.operations, month]
  );

  // Категории, которые реально встречаются в этом месяце (для чипов)
  const presentCategories = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const o of monthAll) {
      if (!seen.has(o.category)) {
        seen.add(o.category);
        order.push(o.category);
      }
    }
    return order;
  }, [monthAll]);

  const monthOps = useMemo(() => {
    return monthAll
      .filter((o) => (filter ? o.category === filter : true))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [monthAll, filter]);

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

      {/* Чипы-фильтры по категориям месяца */}
      {presentCategories.length > 0 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip active={filter === ""} onClick={() => setFilter("")}>
            Все
          </Chip>
          {presentCategories.map((c) => (
            <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
              {c}
            </Chip>
          ))}
        </div>
      )}

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
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800/60"
                >
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: TYPE_COLOR[op.type] }}
                  />
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
                    colorPositive
                    className="shrink-0 font-semibold"
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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-brand text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
