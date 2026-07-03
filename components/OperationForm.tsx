"use client";

import { useState, useEffect, useMemo } from "react";
import { Operation, OpType } from "@/lib/types";
import { TYPES, getTypeDef } from "@/lib/categories";
import { useStore, creditCardDebt, creditCardAvailable } from "@/lib/store";
import { todayISO, formatMoney } from "@/lib/format";
import { getLastUsed, setLastUsed } from "@/lib/lastUsed";
import { accountColor } from "@/lib/accounts";

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
  toAccountId: string;
  note: string;
}

// Дефолт новой операции: расход «Продукты» — самое частое действие
const DEFAULT_TYPE: OpType = "expense_personal";

function emptyDraft(defaultAccount: string): OperationDraft {
  const def = getTypeDef(DEFAULT_TYPE);
  return {
    date: todayISO(),
    type: def.type,
    category: def.categories[0].name, // «Продукты / еда / вода»
    amount: "",
    accountId: defaultAccount,
    toAccountId: "",
    note: "",
  };
}

// Дата «вчера» в ISO
function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Отображение суммы с разделителем тысяч во время ввода («15 000», «1 200,5»)
function formatAmountInput(raw: string): string {
  if (!raw) return "";
  const [intPart, decPart] = raw.replace(/\s/g, "").replace(",", ".").split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return decPart !== undefined ? `${grouped},${decPart}` : grouped;
}

// Быстрые добавки к сумме
const QUICK_AMOUNTS = [100, 500, 1000];

// Типы для формы: «Кредиты и займы» ведутся в отдельных вкладках «Долги»/«Кредиты»,
// поэтому из обычной формы их скрываем (категории остаются для старых записей).
const FORM_TYPES = TYPES.filter((t) => t.type !== "credit_loan");

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
  // Счёт по умолчанию — основной (из настроек), иначе первый в списке
  const defaultAccount = useMemo(() => {
    const primary = state.primaryAccountId;
    if (primary && state.accounts.some((a) => a.id === primary)) return primary;
    return state.accounts[0]?.id ?? "";
  }, [state.primaryAccountId, state.accounts]);

  // Свежий черновик: подставляем последний использованный набор,
  // иначе — дефолт «Расход / Продукты». Счёт берём из памяти, если он есть.
  const makeFresh = (): OperationDraft => {
    const last = getLastUsed();
    // скрытый из формы тип (кредиты/займы) не подставляем
    if (!last || last.type === "credit_loan") return emptyDraft(defaultAccount);
    const def = getTypeDef(last.type);
    const category = def.categories.some((c) => c.name === last.category)
      ? last.category
      : def.categories[0].name;
    const accountId = state.accounts.some((a) => a.id === last.accountId)
      ? last.accountId
      : defaultAccount;
    return {
      // дата новой операции — всегда сегодня (не «залипает» прошлая дата)
      date: todayISO(),
      type: last.type,
      category,
      amount: "",
      accountId,
      toAccountId: "",
      note: "",
    };
  };

  const [draft, setDraft] = useState<OperationDraft>(() => {
    const src = initial ?? prefill;
    if (src) {
      return {
        date: (initial?.date ?? todayISO()),
        type: src.type ?? TYPES[0].type,
        category: src.category ?? getTypeDef(src.type ?? TYPES[0].type).categories[0].name,
        amount: src.amount ? String(src.amount) : "",
        accountId: src.accountId ?? defaultAccount,
        toAccountId: src.toAccountId ?? "",
        note: src.note ?? "",
      };
    }
    return makeFresh();
  });

  const typeDef = getTypeDef(draft.type);
  const [error, setError] = useState(false);

  // Частота категорий — для сортировки чипов (частые выше)
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of state.operations) {
      if (o.deleted) continue;
      counts.set(o.category, (counts.get(o.category) ?? 0) + 1);
    }
    return counts;
  }, [state.operations]);

  // Категории текущего типа, отсортированные по частоте (стабильно для равных)
  const sortedCategories = useMemo(() => {
    return typeDef.categories
      .map((c, i) => ({ c, i, n: categoryCounts.get(c.name) ?? 0 }))
      .sort((a, b) => (b.n !== a.n ? b.n - a.n : a.i - b.i))
      .map((x) => x.c);
  }, [typeDef, categoryCounts]);

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
    if (type === "transfer") {
      setDraft((d) => ({
        ...d,
        type,
        category: "",
        toAccountId:
          d.toAccountId && d.toAccountId !== d.accountId
            ? d.toAccountId
            : state.accounts.find((a) => a.id !== d.accountId)?.id ?? "",
      }));
      return;
    }
    const def = getTypeDef(type);
    // выбираем самую частую категорию этого типа (как в отсортированных чипах)
    const top = def.categories
      .map((c, i) => ({ name: c.name, i, n: categoryCounts.get(c.name) ?? 0 }))
      .sort((a, b) => (b.n !== a.n ? b.n - a.n : a.i - b.i))[0];
    setDraft((d) => ({ ...d, type, category: top?.name ?? def.categories[0]?.name ?? "" }));
  }

  // выбор счёта-источника: для перевода держим получателя отличным от источника
  const pickFrom = (id: string) =>
    setDraft((d) => {
      if (d.type !== "transfer") return { ...d, accountId: id };
      const to =
        d.toAccountId && d.toAccountId !== id
          ? d.toAccountId
          : state.accounts.find((a) => a.id !== id)?.id ?? "";
      return { ...d, accountId: id, toAccountId: to };
    });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Math.abs(
      Number(draft.amount.replace(/\s/g, "").replace(",", "."))
    );
    if (!amount || Number.isNaN(amount)) {
      setError(true);
      return;
    }
    const isTransfer = draft.type === "transfer";
    if (isTransfer && (!draft.toAccountId || draft.toAccountId === draft.accountId)) {
      setError(true);
      return;
    }
    setError(false);
    onSubmit({
      date: draft.date,
      type: draft.type,
      category: isTransfer ? "" : draft.category,
      amount,
      accountId: draft.accountId,
      ...(isTransfer ? { toAccountId: draft.toAccountId } : {}),
      note: draft.note.trim(),
    });
    if (!initial) {
      // запоминаем набор для следующего раза и сбрасываем форму
      setLastUsed({
        type: draft.type,
        category: draft.category,
        accountId: draft.accountId,
        date: draft.date,
      });
      setDraft(makeFresh());
    }
  }

  const labelCls =
    "block text-[13px] font-medium uppercase tracking-wide text-label-2 mb-2";
  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-3 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";
  const draftAmount =
    Math.abs(Number(draft.amount.replace(/\s/g, "").replace(",", "."))) || 0;
  const fromAccount = state.accounts.find((a) => a.id === draft.accountId);
  const toAccount = state.accounts.find((a) => a.id === draft.toAccountId);
  const fromCreditCard = fromAccount?.kind === "credit_card";
  const toCreditCard = toAccount?.kind === "credit_card";
  const fromCardDebt = fromCreditCard
    ? creditCardDebt(state, draft.accountId)
    : 0;
  const toCardDebt = toCreditCard ? creditCardDebt(state, draft.toAccountId) : 0;
  const fromCardAvailable = fromCreditCard
    ? creditCardAvailable(state, draft.accountId)
    : 0;
  const toCardAvailable = toCreditCard
    ? creditCardAvailable(state, draft.toAccountId)
    : 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Крупный ввод суммы (с разделителем тысяч) */}
      <div className="flex items-center justify-center gap-1 py-2">
        <input
          type="text"
          inputMode="decimal"
          value={formatAmountInput(draft.amount)}
          onChange={(e) => {
            if (error) setError(false);
            // только цифры и один разделитель, не более 2 знаков после; храним с точкой
            let v = e.target.value.replace(/[^\d.,]/g, "").replace(/,/g, ".");
            const dot = v.indexOf(".");
            if (dot !== -1) {
              v =
                v.slice(0, dot + 1) +
                v.slice(dot + 1).replace(/\./g, "").slice(0, 2);
            }
            setDraft((d) => ({ ...d, amount: v }));
          }}
          placeholder="0"
          autoFocus={!initial}
          className="w-auto max-w-[80%] bg-transparent text-center text-[52px] font-bold leading-none tracking-tight tabular-nums outline-none placeholder:text-label-3"
          required
        />
        <span className="text-[40px] font-semibold text-label-3">₽</span>
      </div>
      {error && (
        <p className="-mt-3 text-center text-[13px] font-medium text-red-600 dark:text-red-400">
          {draft.type === "transfer" &&
          (!draft.toAccountId || draft.toAccountId === draft.accountId)
            ? "Выберите счёт-получатель"
            : "Введите сумму больше нуля"}
        </p>
      )}
      {/* Быстрые добавки */}
      <div className="-mt-2 flex justify-center gap-2">
        {QUICK_AMOUNTS.map((q) => (
          <button
            type="button"
            key={q}
            onClick={() => {
              if (error) setError(false);
              setDraft((d) => {
                // прибавляем к текущей сумме, копейки не теряем
                const cur =
                  Number(d.amount.replace(/\s/g, "").replace(",", ".")) || 0;
                const next = Math.round((cur + q) * 100) / 100;
                return { ...d, amount: String(next) };
              });
            }}
            className="rounded-full bg-black/[0.06] px-3.5 py-1.5 text-[13px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
          >
            +{q}
          </button>
        ))}
      </div>

      <div>
        <label className={labelCls}>Тип</label>
        <div className="grid grid-cols-2 gap-2">
          {FORM_TYPES.filter(
            (t) => t.type !== "transfer" || state.accounts.length >= 2
          ).map((t) => (
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

      {draft.type !== "transfer" && (
      <div>
        <label className={labelCls}>Категория</label>
        <div className="flex flex-wrap gap-2">
          {sortedCategories.map((c) => (
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
      )}

      <div>
        <label className={labelCls}>
          {draft.type === "transfer" ? "Со счёта" : "Счёт"}
        </label>
        <div className="flex flex-wrap gap-2">
          {state.accounts.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => pickFrom(a.id)}
              className={`flex items-center gap-2 ${chipCls(
                draft.accountId === a.id
              )}`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-black/5"
                style={{ backgroundColor: accountColor(a.id) }}
              />
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {draft.type === "transfer" && (
        <div>
          <label className={labelCls}>На счёт</label>
          <div className="flex flex-wrap gap-2">
            {state.accounts
              .filter((a) => a.id !== draft.accountId)
              .map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setDraft((d) => ({ ...d, toAccountId: a.id }))}
                  className={`flex items-center gap-2 ${chipCls(
                    draft.toAccountId === a.id
                  )}`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-black/5"
                    style={{ backgroundColor: accountColor(a.id) }}
                  />
                  {a.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {fromCreditCard &&
        draft.type !== "income" &&
        draft.type !== "transfer" && (
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Долг по карте станет {formatMoney(fromCardDebt + draftAmount)}
            {(fromAccount.creditLimit ?? 0) > 0
              ? ` · доступно ${formatMoney(fromCardAvailable - draftAmount)}`
              : ""}
          </p>
        )}

      {draft.type === "transfer" && fromCreditCard && (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Перевод с кредитки увеличит долг до{" "}
          {formatMoney(fromCardDebt + draftAmount)}
          {(fromAccount.creditLimit ?? 0) > 0
            ? ` · доступно ${formatMoney(fromCardAvailable - draftAmount)}`
            : ""}
        </p>
      )}

      {draft.type === "transfer" && toCreditCard && (
        <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          Оплата карты уменьшит долг до{" "}
          {formatMoney(Math.max(0, toCardDebt - draftAmount))}
          {(toAccount.creditLimit ?? 0) > 0
            ? ` · доступно ${formatMoney(toCardAvailable + draftAmount)}`
            : ""}
        </p>
      )}

      <div>
        <label className={labelCls}>Дата</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, date: todayISO() }))}
            className={chipCls(draft.date === todayISO())}
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, date: yesterdayISO() }))}
            className={chipCls(draft.date === yesterdayISO())}
          >
            Вчера
          </button>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            className={`${fieldCls} flex-1`}
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
