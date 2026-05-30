"use client";

import { useState } from "react";
import { Operation, OpType } from "@/lib/types";
import { TYPES, getTypeDef } from "@/lib/categories";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/format";

export interface OperationDraft {
  date: string;
  type: OpType;
  category: string;
  amount: string;
  accountId: string;
  note: string;
}

function emptyDraft(defaultAccount: string): OperationDraft {
  const firstType = TYPES[0];
  return {
    date: todayISO(),
    type: firstType.type,
    category: firstType.categories[0].name,
    amount: "",
    accountId: defaultAccount,
    note: "",
  };
}

export function OperationForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Operation;
  submitLabel: string;
  onSubmit: (op: Omit<Operation, "id">) => void;
  onCancel?: () => void;
}) {
  const { state } = useStore();
  const defaultAccount = state.accounts[0]?.id ?? "";

  const [draft, setDraft] = useState<OperationDraft>(() =>
    initial
      ? {
          date: initial.date,
          type: initial.type,
          category: initial.category,
          amount: String(initial.amount),
          accountId: initial.accountId,
          note: initial.note,
        }
      : emptyDraft(defaultAccount)
  );

  const typeDef = getTypeDef(draft.type);

  function handleTypeChange(type: OpType) {
    const def = getTypeDef(type);
    setDraft((d) => ({ ...d, type, category: def.categories[0].name }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Math.abs(Number(draft.amount.replace(",", ".")));
    if (!amount || Number.isNaN(amount)) return;
    onSubmit({
      date: draft.date,
      type: draft.type,
      category: draft.category,
      amount,
      accountId: draft.accountId,
      note: draft.note.trim(),
    });
    if (!initial) {
      setDraft(emptyDraft(defaultAccount));
    }
  }

  const labelCls = "block text-sm font-medium text-slate-600 mb-1";
  const fieldCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-brand";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Дата</label>
        <input
          type="date"
          value={draft.date}
          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
          className={fieldCls}
          required
        />
      </div>

      <div>
        <label className={labelCls}>Тип</label>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.type}
              onClick={() => handleTypeChange(t.type)}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                draft.type === t.type
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Категория</label>
        <select
          value={draft.category}
          onChange={(e) =>
            setDraft((d) => ({ ...d, category: e.target.value }))
          }
          className={fieldCls}
        >
          {typeDef.categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Сумма, ₽</label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={draft.amount}
          onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
          placeholder="0"
          className={`${fieldCls} text-lg`}
          required
        />
      </div>

      <div>
        <label className={labelCls}>Счёт</label>
        <select
          value={draft.accountId}
          onChange={(e) =>
            setDraft((d) => ({ ...d, accountId: e.target.value }))
          }
          className={fieldCls}
        >
          {state.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Заметка</label>
        <input
          type="text"
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          placeholder="Необязательно"
          className={fieldCls}
        />
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-slate-100 py-4 text-base font-semibold text-slate-700 active:bg-slate-200"
          >
            Отмена
          </button>
        )}
        <button
          type="submit"
          className="flex-[2] rounded-xl bg-brand py-4 text-base font-semibold text-white active:bg-brand-dark"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
