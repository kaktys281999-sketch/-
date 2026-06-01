"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, operationDelta } from "@/lib/store";
import { UndoToast } from "./Toast";
import { Operation, OpType } from "@/lib/types";
import {
  formatMoney,
  formatDateLong,
  monthKeyFromISO,
  monthLabel,
} from "@/lib/format";
import { Card, Money, SearchField } from "./ui";
import { OperationForm } from "./OperationForm";

// Цвет-метка по типу операции
const TYPE_COLOR: Record<OpType, string> = {
  income: "#10b981",
  expense_personal: "#f43f5e",
  expense_work: "#f59e0b",
  credit_loan: "#6926E3",
};

export function Operations({ month }: { month: string }) {
  const { state, updateOperation, deleteOperation, restoreOperation } =
    useStore();
  const [filter, setFilter] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [editing, setEditing] = useState<Operation | null>(null);
  // id недавно удалённой операции — для снэкбара «Отменить»
  const [undoId, setUndoId] = useState<string | null>(null);

  // автоскрытие снэкбара через 6 секунд
  useEffect(() => {
    if (!undoId) return;
    const t = setTimeout(() => setUndoId(null), 6000);
    return () => clearTimeout(t);
  }, [undoId]);

  function handleDelete(id: string) {
    deleteOperation(id);
    setEditing(null);
    setUndoId(id);
  }

  const q = query.trim().toLowerCase();

  // Операции месяца (без учёта фильтра) — для расчёта доступных категорий
  const monthAll = useMemo(
    () =>
      state.operations.filter(
        (o) => !o.deleted && monthKeyFromISO(o.date) === month
      ),
    [state.operations, month]
  );

  // При поиске ищем по всем месяцам, иначе — только текущий
  const baseOps = useMemo(
    () => (q ? state.operations.filter((o) => !o.deleted) : monthAll),
    [q, state.operations, monthAll]
  );

  // Категории, которые реально встречаются (для чипов)
  const presentCategories = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const o of baseOps) {
      if (!seen.has(o.category)) {
        seen.add(o.category);
        order.push(o.category);
      }
    }
    return order;
  }, [baseOps]);

  const monthOps = useMemo(() => {
    const accName = (id: string) =>
      state.accounts.find((a) => a.id === id)?.name.toLowerCase() ?? "";
    const qNum = q.replace(/\s/g, "");
    return baseOps
      .filter((o) => (filter ? o.category === filter : true))
      .filter((o) => {
        if (!q) return true;
        return (
          o.category.toLowerCase().includes(q) ||
          (o.note ?? "").toLowerCase().includes(q) ||
          accName(o.accountId).includes(q) ||
          String(o.amount).includes(qNum)
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [baseOps, filter, q, state.accounts]);

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
        <h2 className="px-1 text-xl font-bold tracking-tight">
          Редактировать операцию
        </h2>
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
        </Card>
        <Card className="!p-0">
          <button
            type="button"
            onClick={() => handleDelete(editing.id)}
            className="w-full py-3.5 text-center text-[17px] font-medium text-red-600 dark:text-red-400"
          >
            Удалить операцию
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Поиск */}
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Поиск: категория, заметка, сумма…"
      />

      {q && (
        <div className="px-1 text-[13px] text-label-2">
          Поиск по всем месяцам · найдено: {monthOps.length}
        </div>
      )}

      {/* Чипы-фильтры по категориям */}
      {presentCategories.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          <p className="py-8 text-center text-[15px] text-label-3">
            {q ? "Ничего не найдено" : "Операций за этот месяц нет"}
          </p>
        </Card>
      )}

      <div className="md:columns-2 md:gap-4">
      {byDay.map(([date, ops]) => {
        const expense = dayExpense(ops);
        return (
          <div key={date} className="mb-3 break-inside-avoid md:mb-4">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[13px] font-medium uppercase tracking-wide text-label-2">
                {formatDateLong(date)}
              </span>
              {expense > 0 && (
                <span className="text-[13px] text-label-3">
                  −{formatMoney(expense)}
                </span>
              )}
            </div>
            <Card className="!p-0">
              {ops.map((op, idx) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setEditing(op)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03] dark:active:bg-white/5 ${
                    idx > 0 ? "border-t border-[var(--separator)]" : ""
                  }`}
                >
                  <span
                    className="h-9 w-9 shrink-0 rounded-full"
                    style={{ backgroundColor: TYPE_COLOR[op.type] + "22" }}
                  >
                    <span
                      className="mx-auto mt-[14px] block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: TYPE_COLOR[op.type] }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">
                      {op.category}
                    </div>
                    <div className="truncate text-[13px] text-label-2">
                      {accountName(op.accountId)}
                      {op.note ? ` · ${op.note}` : ""}
                    </div>
                  </div>
                  <Money
                    value={operationDelta(op)}
                    showPlus
                    colorPositive
                    className="shrink-0 text-[15px] font-semibold"
                  />
                </button>
              ))}
            </Card>
          </div>
        );
      })}
      </div>

      {undoId && (
        <UndoToast
          message="Операция удалена"
          onAction={() => {
            restoreOperation(undoId);
            setUndoId(null);
          }}
          onClose={() => setUndoId(null)}
        />
      )}
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
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14px] font-medium ${
        active
          ? "bg-brand text-white"
          : "bg-black/[0.06] text-slate-600 dark:bg-white/10 dark:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
