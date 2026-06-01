"use client";

import { useState, useEffect } from "react";
import { Operation, OpType } from "@/lib/types";
import { TYPES, getTypeDef } from "@/lib/categories";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/format";

// Цвета банков для точек у чипов счетов
const ACCOUNT_COLORS: Record<string, string> = {
  yandex: "#FC3F1D",
  sber: "#21A038",
  tinkoff: "#FFDD2D",
};

const chipCls = (active: boolean) =>
  `rounded-full px-3.5 py-2 text-sm font-medium transition ${
    active
      ? "bg-brand text-white"
      : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
  }`;

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
  prefill,
  submitLabel,
  onSubmit,
  onCancel,
  onDraftChange,
}: {
  initial?: Operation;
  // частичное заполнение (например, из шаблона) — без даты
  prefill?: Partial<Omit<Operation, "id">>;
  submitLabel: string;
  onSubmit: (op: Omit<Operation, "id">) => void;
  onCancel?: () => void;
  // текущий черновик наружу — чтобы сохранить как шаблон
  onDraftChange?: (draft: Omit<Operation, "id">) => void;
}) {
  const { state } = useStore();
  const defaultAccount = state.accounts[0]?.id ?? "";

  const [draft, setDraft] = useState<OperationDraft>(() => {
    const src = initial ?? prefill;
    if (src) {
      return {
        date: (initial?.date ?? todayISO()),
        type: src.type ?? TYPES[0].type,
        category: src.category ?? getTypeDef(src.type ?? TYPES[0].type).categories[0].name,
        amount: src.amount ? String(src.amount) : "",
        accountId: src.accountId ?? defaultAccount,
        note: src.note ?? "",
      };
    }
    return emptyDraft(defaultAccount);
  });

  const typeDef = getTypeDef(draft.type);
  const [error, setError] = useState(false);

  // Отдаём текущий черновик наружу (для «сохранить как шаблон»)
  useEffect(() => {
    if (!onDraftChange) return;
    const amount = Math.abs(
      Number(draft.amount.replace(/\s/g, "").replace(",", "."))
    );
    onDraftChange({
      date: draft.date,
      type: draft.type,
      category: draft.category,
      amount: Number.isNaN(amount) ? 0 : amount,
      accountId: draft.accountId,
      note: draft.note.trim(),
    });
  }, [draft, onDraftChange]);

  function handleTypeChange(type: OpType) {
    const def = getTypeDef(type);
    setDraft((d) => ({ ...d, type, category: def.categories[0].name }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Math.abs(
      Number(draft.amount.replace(/\s/g, "").replace(",", "."))
    );
    if (!amount || Number.isNaN(amount)) {
      setError(true);
      return;
    }
    setError(false);
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

  const labelCls =
    "block text-[13px] font-medium uppercase tracking-wide text-label-2 mb-2";
  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-3 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Крупный ввод суммы */}
      <div className="flex items-center justify-center gap-1 py-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={draft.amount}
          onChange={(e) => {
            if (error) setError(false);
            setDraft((d) => ({ ...d, amount: e.target.value }));
          }}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0"
          autoFocus={!initial}
          className="w-auto max-w-[70%] bg-transparent text-center text-[52px] font-bold leading-none tracking-tight tabular-nums outline-none placeholder:text-label-3"
          required
        />
        <span className="text-[40px] font-semibold text-label-3">₽</span>
      </div>
      {error && (
        <p className="-mt-3 text-center text-[13px] font-medium text-red-600 dark:text-red-400">
          Введите сумму больше нуля
        </p>
      )}

      <div>
        <label className={labelCls}>Тип</label>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.type}
              onClick={() => handleTypeChange(t.type)}
              className={`rounded-xl px-3 py-2.5 text-[14px] font-medium ${
                draft.type === t.type
                  ? "bg-brand text-white"
                  : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Категория</label>
        <div className="flex flex-wrap gap-2">
          {typeDef.categories.map((c) => (
            <button
              type="button"
              key={c.name}
              onClick={() => setDraft((d) => ({ ...d, category: c.name }))}
              className={chipCls(draft.category === c.name)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Счёт</label>
        <div className="flex flex-wrap gap-2">
          {state.accounts.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => setDraft((d) => ({ ...d, accountId: a.id }))}
              className={`flex items-center gap-2 ${chipCls(
                draft.accountId === a.id
              )}`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-black/5"
                style={{ backgroundColor: ACCOUNT_COLORS[a.id] ?? "#94a3b8" }}
              />
              {a.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={labelCls}>Дата</label>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            className={fieldCls}
            required
          />
        </div>
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

      <div className="flex gap-2.5 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-black/[0.06] py-3.5 text-[17px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200"
          >
            Отмена
          </button>
        )}
        <button
          type="submit"
          className="flex-[2] rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-white"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
