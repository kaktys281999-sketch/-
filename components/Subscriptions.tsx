"use client";

import { useMemo, useState } from "react";
import {
  useStore,
  subscriptionStatuses,
  subscriptionsMonthlyTotal,
  subscriptionSpent,
  suggestSubscriptions,
  subscriptionRules,
  isSubscriptionPaid,
  type SubSuggestion,
} from "@/lib/store";
import { OpType, RecurringRule } from "@/lib/types";
import { TYPES, getTypeDef } from "@/lib/categories";
import {
  formatMoney,
  formatDateShort,
  monthKey,
  monthLabel,
  todayISO,
} from "@/lib/format";
import { Card, NumberInput } from "./ui";
import { RecurringSettings } from "./RecurringSettings";

// Категории-расходы (личное + рабочее) и их тип
const EXPENSE_CATS: { name: string; type: OpType }[] = TYPES.filter(
  (t) => t.type === "expense_personal" || t.type === "expense_work"
).flatMap((t) => t.categories.map((c) => ({ name: c.name, type: t.type })));

function typeForCategory(cat: string): OpType {
  return EXPENSE_CATS.find((c) => c.name === cat)?.type ?? "expense_personal";
}

type SubItem = {
  rule: RecurringRule;
  active: boolean;
  paid: boolean;
  due: boolean;
  upcoming: boolean;
};

export function Subscriptions() {
  const { state, paySubscription } = useStore();
  const [adding, setAdding] = useState<Partial<SubSuggestion> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"subscriptions" | "recurring">(
    "subscriptions"
  );

  const month = monthKey(new Date());
  const today = todayISO();

  const statuses = useMemo(
    () => subscriptionStatuses(state, month, today),
    [state, month, today]
  );
  const monthly = subscriptionsMonthlyTotal(state);
  const spent = subscriptionSpent(state, month);
  const suggestions = useMemo(() => suggestSubscriptions(state), [state]);

  // Открыть можно любую подписку, в т.ч. выключенную (чтобы снова включить)
  const openRule = openId
    ? subscriptionRules(state).find((r) => r.id === openId) ?? null
    : null;

  const accountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "—";

  if (adding) {
    return <SubForm preset={adding} onClose={() => setAdding(null)} />;
  }
  if (openRule) {
    return <SubDetail rule={openRule} onClose={() => setOpenId(null)} />;
  }

  // Список всех подписок (включая выключенные — они показываются приглушённо).
  // Статус оплаты берём из активных, для выключенных считаем напрямую.
  const statusById = new Map(statuses.map((s) => [s.rule.id, s]));
  const items: SubItem[] = subscriptionRules(state).map((r) => {
    const st = statusById.get(r.id);
    return {
      rule: r,
      active: r.active !== false,
      paid: st ? st.paid : isSubscriptionPaid(state, r.id, month),
      due: st ? st.due : false,
      upcoming: st ? st.upcoming : false,
    };
  });
  const order = (s: SubItem) =>
    !s.active ? 3 : s.due ? 0 : s.upcoming ? 1 : 2;
  const sorted = items.sort(
    (a, b) =>
      order(a) - order(b) || a.rule.dayOfMonth - b.rule.dayOfMonth
  );

  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";

  return (
    <div className="space-y-4">
      {/* Переключатель: подписки / регулярные (авто) */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/[0.06] p-1 dark:bg-white/10">
        {(
          [
            ["subscriptions", "Подписки"],
            ["recurring", "Регулярные"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 text-[14px] font-medium ${
              mode === m
                ? "bg-[var(--card)] text-slate-900 shadow-sm dark:text-white"
                : "text-label-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "recurring" ? (
        <RecurringSettings fieldCls={fieldCls} />
      ) : (
        <SubsContent
          items={sorted}
          monthly={monthly}
          spent={spent}
          suggestions={suggestions}
          accountName={accountName}
          onAdd={(preset) => setAdding(preset)}
          onOpen={(id) => setOpenId(id)}
          onPay={(id) => paySubscription(id)}
        />
      )}
    </div>
  );
}

function SubsContent({
  items,
  monthly,
  spent,
  suggestions,
  accountName,
  onAdd,
  onOpen,
  onPay,
}: {
  items: SubItem[];
  monthly: number;
  spent: number;
  suggestions: SubSuggestion[];
  accountName: (id: string) => string;
  onAdd: (preset: Partial<SubSuggestion>) => void;
  onOpen: (id: string) => void;
  onPay: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Статистика */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <div className="text-[13px] text-label-2">В месяц</div>
          <div className="mt-0.5 text-[20px] font-bold">{formatMoney(monthly)}</div>
        </Card>
        <Card>
          <div className="text-[13px] text-label-2">В год</div>
          <div className="mt-0.5 text-[20px] font-bold">
            {formatMoney(monthly * 12)}
          </div>
        </Card>
        <Card>
          <div className="text-[13px] text-label-2">Оплачено</div>
          <div className="mt-0.5 text-[20px] font-bold text-emerald-600 dark:text-emerald-400">
            {formatMoney(spent)}
          </div>
        </Card>
      </div>

      <button
        type="button"
        onClick={() => onAdd({})}
        className="w-full rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-white"
      >
        Добавить подписку
      </button>

      {/* Предложения из трат */}
      {suggestions.length > 0 && (
        <div>
          <SectionTitle>Похоже на подписки в тратах</SectionTitle>
          <Card className="!p-0">
            {suggestions.slice(0, 6).map((s, i) => (
              <div
                key={`${s.category}|${s.note}`}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-[var(--separator)]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">
                    {s.note || s.category}
                  </div>
                  <div className="truncate text-[13px] text-label-2">
                    {formatMoney(s.amount)} · ~{s.dayOfMonth} числа · в {s.months}{" "}
                    мес.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(s)}
                  className="shrink-0 rounded-full bg-brand/10 px-3.5 py-1.5 text-[14px] font-semibold text-brand"
                >
                  Добавить
                </button>
              </div>
            ))}
          </Card>
          <p className="mt-1.5 px-1 text-[13px] text-label-2">
            Найдено по повторяющимся одинаковым тратам в разных месяцах.
          </p>
        </div>
      )}

      {items.length === 0 && suggestions.length === 0 && (
        <Card>
          <p className="py-8 text-center text-[15px] text-label-3">
            Подписок пока нет
          </p>
        </Card>
      )}

      {/* Список подписок */}
      {items.length > 0 && (
        <div>
          <SectionTitle>Мои подписки</SectionTitle>
          <Card className="!p-0">
            {items.map((s, i) => (
              <div
                key={s.rule.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-[var(--separator)]" : ""
                } ${s.active ? "" : "opacity-50"}`}
              >
                <button
                  type="button"
                  onClick={() => onOpen(s.rule.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-[15px] font-medium">
                    {s.rule.title || s.rule.category}
                  </div>
                  <div className="truncate text-[13px] text-label-2">
                    {formatMoney(s.rule.amount)} · {s.rule.dayOfMonth} числа ·{" "}
                    {accountName(s.rule.accountId)}
                  </div>
                </button>
                {!s.active ? (
                  <span className="shrink-0 text-[13px] text-label-3">выключена</span>
                ) : s.paid ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1.5 text-[13px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    оплачено
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPay(s.rule.id)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-semibold ${
                      s.due
                        ? "bg-brand text-white"
                        : "bg-black/[0.06] text-brand dark:bg-white/10"
                    }`}
                  >
                    Оплатить
                  </button>
                )}
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
      {children}
    </div>
  );
}

// ===== Форма добавления подписки =====

function SubForm({
  preset,
  onClose,
}: {
  preset: Partial<SubSuggestion>;
  onClose: () => void;
}) {
  const { state, addRecurring } = useStore();
  const defaultAccount =
    (state.primaryAccountId &&
    state.accounts.some((a) => a.id === state.primaryAccountId)
      ? state.primaryAccountId
      : state.accounts[0]?.id) ?? "";

  const [title, setTitle] = useState(preset.note ?? "");
  const [category, setCategory] = useState(
    preset.category ?? "Мобильный / подписки"
  );
  const [amount, setAmount] = useState(preset.amount ? String(preset.amount) : "");
  const [day, setDay] = useState(String(preset.dayOfMonth ?? 1));
  const [accountId, setAccountId] = useState(defaultAccount);
  const [error, setError] = useState("");

  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-3 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";
  const labelCls =
    "block text-[13px] font-medium uppercase tracking-wide text-label-2 mb-2";
  const num = (s: string) => Math.abs(Number(s.replace(/\s/g, "").replace(",", ".")));

  function submit() {
    const sum = num(amount);
    const d = Math.round(num(day));
    if (!sum) return setError("Введите сумму");
    if (!d || d < 1 || d > 31) return setError("Число месяца от 1 до 31");
    addRecurring({
      title: title.trim() || category,
      type: typeForCategory(category),
      category,
      amount: sum,
      accountId,
      dayOfMonth: d,
      startMonth: monthKey(new Date()),
      note: title.trim(),
      kind: "subscription",
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
    <div className="space-y-3">
      <h2 className="px-1 text-xl font-bold tracking-tight">Новая подписка</h2>
      <Card>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Название</label>
            <input
              type="text"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Netflix, Spotify, Claude…"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>Категория</label>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATS.map((c) => (
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
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Сумма, ₽</label>
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
              <label className={labelCls}>Число месяца</label>
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

          <div>
            <label className={labelCls}>Счёт</label>
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
              className="flex-1 rounded-2xl bg-black/[0.06] py-3.5 text-[17px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={submit}
              className="flex-[2] rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-white"
            >
              Сохранить
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ===== Детали подписки =====

function SubDetail({ rule, onClose }: { rule: RecurringRule; onClose: () => void }) {
  const {
    state,
    paySubscription,
    unpaySubscription,
    updateRecurring,
    deleteRecurring,
  } = useStore();
  const month = monthKey(new Date());
  const paidOp = state.operations.find(
    (o) => o.id === `rec-${rule.id}-${month}` && !o.deleted
  );
  const paid = !!paidOp;
  const [payAccount, setPayAccount] = useState(paidOp?.accountId ?? rule.accountId);
  const [payAmount, setPayAmount] = useState(
    String(paidOp?.amount ?? rule.amount)
  );
  const [payError, setPayError] = useState(false);
  const [editing, setEditing] = useState(false);

  const accountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "—";
  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";

  function pay() {
    const sum = Math.abs(Number(payAmount.replace(/\s/g, "").replace(",", ".")));
    if (!sum || Number.isNaN(sum)) {
      setPayError(true);
      return;
    }
    // при правке сохраняем исходную дату платежа, чтобы он не «переехал»
    paySubscription(rule.id, {
      amount: sum,
      accountId: payAccount,
      date: paidOp?.date,
    });
    setPayError(false);
  }
  const history = state.operations
    .filter((o) => !o.deleted && o.recurringId === rule.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={onClose}
          className="text-[15px] font-medium text-brand"
        >
          ‹ Назад
        </button>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="text-[15px] font-medium text-brand"
        >
          {editing ? "Готово" : "Изменить"}
        </button>
      </div>

      <Card>
        <div className="text-[15px] font-semibold">{rule.title || rule.category}</div>
        <div className="mt-1 text-[34px] font-bold leading-none tracking-tight">
          {formatMoney(rule.amount)}
        </div>
        <div className="mt-2 text-[13px] text-label-2">
          каждое {rule.dayOfMonth} число · {accountName(rule.accountId)} ·{" "}
          {formatMoney(rule.amount * 12)} в год
        </div>
      </Card>

      {/* Оплата за текущий месяц (сумма редактируется — может отличаться от типовой) */}
      {!editing && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium uppercase tracking-wide text-label-2">
              {monthLabel(month)} · оплата
            </span>
            {paid && (
              <span className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
                оплачено
              </span>
            )}
          </div>

          <label className="mb-1 block text-[13px] text-label-2">
            Сумма в этом месяце
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={payAmount}
            onChange={(e) => {
              if (payError) setPayError(false);
              setPayAmount(e.target.value);
            }}
            onWheel={(e) => e.currentTarget.blur()}
            placeholder={formatMoney(rule.amount)}
            className={fieldCls}
          />
          {rule.amount > 0 && (
            <div className="mt-1 text-[12px] text-label-3">
              Типовая: {formatMoney(rule.amount)} · меняется только этот месяц
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {state.accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setPayAccount(a.id)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                  payAccount === a.id
                    ? "bg-brand text-white"
                    : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>

          {payError && (
            <p className="mt-2 text-[13px] font-medium text-red-600 dark:text-red-400">
              Введите сумму больше нуля
            </p>
          )}

          <div className="mt-3 flex gap-2.5">
            <button
              type="button"
              onClick={pay}
              className="flex-[2] rounded-xl bg-brand py-3 text-[15px] font-semibold text-white"
            >
              {paid ? "Сохранить сумму" : "Оплатить"}
            </button>
            {paid && (
              <button
                type="button"
                onClick={() => unpaySubscription(rule.id, month)}
                className="flex-1 rounded-xl bg-black/[0.06] py-3 text-[15px] font-semibold text-red-600 dark:bg-white/10 dark:text-red-400"
              >
                Отменить
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Редактирование */}
      {editing && (
        <Card>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Название
              </label>
              <input
                type="text"
                value={rule.title}
                onChange={(e) => updateRecurring(rule.id, { title: e.target.value })}
                className={fieldCls}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                  Сумма, ₽
                </label>
                <NumberInput
                  value={rule.amount}
                  onCommit={(n) => updateRecurring(rule.id, { amount: n })}
                  className={fieldCls}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                  Число месяца
                </label>
                <NumberInput
                  value={rule.dayOfMonth}
                  onCommit={(n) =>
                    updateRecurring(rule.id, {
                      dayOfMonth: Math.min(31, Math.max(1, n)),
                    })
                  }
                  className={fieldCls}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Счёт
              </label>
              <div className="flex flex-wrap gap-2">
                {state.accounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => updateRecurring(rule.id, { accountId: a.id })}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                      rule.accountId === a.id
                        ? "bg-brand text-white"
                        : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between text-[15px]">
              <span>Активна</span>
              <input
                type="checkbox"
                checked={rule.active !== false}
                onChange={(e) =>
                  updateRecurring(rule.id, { active: e.target.checked })
                }
                className="h-5 w-5 accent-brand"
              />
            </label>
          </div>
        </Card>
      )}

      {/* История оплат */}
      {history.length > 0 && (
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
            История оплат
          </div>
          <Card className="!p-0">
            {history.map((o, i) => (
              <div
                key={o.id}
                className={`flex items-center justify-between px-4 py-3 text-[15px] ${
                  i > 0 ? "border-t border-[var(--separator)]" : ""
                }`}
              >
                <span className="text-label-2">
                  {formatDateShort(o.date)} · {accountName(o.accountId)}
                </span>
                <span className="font-medium">−{formatMoney(o.amount)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Удалить */}
      <Card className="!p-0">
        <button
          type="button"
          onClick={() => {
            if (confirm("Удалить подписку? Прошлые оплаты останутся в операциях.")) {
              deleteRecurring(rule.id);
              onClose();
            }
          }}
          className="w-full py-3.5 text-center text-[17px] font-medium text-red-600 dark:text-red-400"
        >
          Удалить подписку
        </button>
      </Card>
    </div>
  );
}
