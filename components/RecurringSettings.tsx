"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { OpType } from "@/lib/types";
import { TYPES, getTypeDef } from "@/lib/categories";
import { formatMoney, monthKey } from "@/lib/format";
import { Card } from "./ui";

// Типы для регулярных операций (кредиты/займы исключаем)
const REC_TYPES = TYPES.filter((t) => t.type !== "credit_loan");

function SettingsTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
      {children}
    </div>
  );
}

export function RecurringSettings({ fieldCls }: { fieldCls: string }) {
  const { state, updateRecurring, deleteRecurring } = useStore();
  const [adding, setAdding] = useState(false);

  const rules = (state.recurring ?? []).filter((r) => !r.deleted);
  const accountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <div>
      <SettingsTitle>Регулярные операции</SettingsTitle>

      {rules.length > 0 && (
        <Card className="!p-0">
          {rules.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${
                i > 0 ? "border-t border-[var(--separator)]" : ""
              } ${r.active === false ? "opacity-50" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">
                  {r.title || r.category}
                </div>
                <div className="truncate text-[13px] text-label-2">
                  {formatMoney(r.amount)} · каждое {r.dayOfMonth} число ·{" "}
                  {accountName(r.accountId)}
                </div>
              </div>
              <input
                type="checkbox"
                checked={r.active !== false}
                onChange={(e) =>
                  updateRecurring(r.id, { active: e.target.checked })
                }
                className="h-5 w-5 shrink-0 accent-brand"
                aria-label="Включено"
              />
              <button
                type="button"
                onClick={() => {
                  if (confirm("Удалить регулярное правило? Уже созданные операции останутся.")) {
                    deleteRecurring(r.id);
                  }
                }}
                aria-label="Удалить"
                className="shrink-0 text-label-3"
              >
                ✕
              </button>
            </div>
          ))}
        </Card>
      )}

      {adding ? (
        <RecurringForm
          fieldCls={fieldCls}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 w-full rounded-xl bg-black/[0.04] py-2.5 text-[15px] font-medium text-brand dark:bg-white/[0.06]"
        >
          + Добавить регулярную операцию
        </button>
      )}

      <p className="mt-1.5 px-1 text-[13px] text-label-2">
        Создаётся автоматически каждый месяц в указанное число (начиная с текущего
        месяца).
      </p>
    </div>
  );
}

function RecurringForm({
  fieldCls,
  onClose,
}: {
  fieldCls: string;
  onClose: () => void;
}) {
  const { state, addRecurring } = useStore();
  const defaultAccount =
    (state.primaryAccountId &&
    state.accounts.some((a) => a.id === state.primaryAccountId)
      ? state.primaryAccountId
      : state.accounts[0]?.id) ?? "";

  const [type, setType] = useState<OpType>("expense_personal");
  const [category, setCategory] = useState(
    getTypeDef("expense_personal").categories[0].name
  );
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const [accountId, setAccountId] = useState(defaultAccount);
  const [error, setError] = useState("");

  const typeDef = getTypeDef(type);
  const num = (s: string) => Math.abs(Number(s.replace(/\s/g, "").replace(",", ".")));

  function changeType(t: OpType) {
    setType(t);
    setCategory(getTypeDef(t).categories[0].name);
  }

  function submit() {
    const sum = num(amount);
    const d = Math.round(num(day));
    if (!sum) return setError("Введите сумму");
    if (!d || d < 1 || d > 31) return setError("Число месяца от 1 до 31");
    addRecurring({
      title: title.trim() || category,
      type,
      category,
      amount: sum,
      accountId,
      dayOfMonth: d,
      startMonth: monthKey(new Date()),
      note: "",
      active: true,
    });
    onClose();
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
      active
        ? "bg-brand text-white"
        : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
    }`;

  return (
    <Card className="mt-2">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {REC_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => changeType(t.type)}
              className={`rounded-xl px-2 py-2 text-[13px] font-medium ${
                type === t.type
                  ? "bg-brand text-white"
                  : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
              }`}
            >
              {t.label.replace("Расход — ", "")}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {typeDef.categories.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setCategory(c.name)}
              className={chip(category === c.name)}
            >
              {c.name}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название (необязательно)"
          className={fieldCls}
        />

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
              Сумма, ₽
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={amount}
              onChange={(e) => {
                if (error) setError("");
                setAmount(e.target.value);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="0"
              className={fieldCls}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
              Число месяца
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="31"
              value={day}
              onChange={(e) => {
                if (error) setError("");
                setDay(e.target.value);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              className={fieldCls}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {state.accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccountId(a.id)}
              className={chip(accountId === a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-[13px] font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-black/[0.06] py-2.5 text-[15px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-[2] rounded-xl bg-brand py-2.5 text-[15px] font-semibold text-white"
          >
            Добавить
          </button>
        </div>
      </div>
    </Card>
  );
}
