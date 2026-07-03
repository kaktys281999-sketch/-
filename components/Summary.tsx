"use client";

import { useState } from "react";
import {
  useStore,
  totalOnHand,
  monthSummary,
  creditInfo,
  creditViews,
  realPosition,
  currentBalance,
  debtsSummary,
  debtOutstanding,
  isDebtSettled,
  upcomingThisMonth,
  accountMonthFlow,
  accountTrend,
  subscriptionStatuses,
  subscriptionsMonthlyTotal,
  expensePace,
  notesBreakdown,
  creditCardDebt,
  creditCardDueDate,
} from "@/lib/store";
import {
  formatMoney,
  formatDateLong,
  formatDateShort,
  monthLabel,
  monthKey,
  shiftMonth,
  daysUntil,
  relativeDayLabel,
  todayISO,
} from "@/lib/format";
import { Card, Money, ProgressBar, Sparkline } from "./ui";
import { SpendingBreakdown } from "./SpendingBreakdown";
import { MonthlyTrend } from "./MonthlyTrend";
import { accountColor } from "@/lib/accounts";
import { Account } from "@/lib/types";

type ReminderKind = "subscription" | "credit" | "debt" | "credit_card";

type Reminder = {
  key: string;
  days: number;
  iso: string;
  title: string;
  amount: number;
  kind: ReminderKind;
  targetId: string;
  defaultAccountId: string;
  actionLabel: string;
  onOpen?: () => void;
};

export function Summary({
  month,
  onSelectMonth,
  onOpenDebts,
  onOpenCredits,
  onOpenSubscriptions,
  onOpenSearch,
}: {
  month: string;
  onSelectMonth?: (key: string) => void;
  onOpenDebts?: () => void;
  onOpenCredits?: () => void;
  onOpenSubscriptions?: () => void;
  onOpenSearch?: (query: string) => void;
}) {
  const { state, paySubscription, addCreditPayment, addDebtPayment, addOperation } =
    useStore();
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null);
  const onHand = totalOnHand(state);
  const summary = monthSummary(state, month);
  const credit = creditInfo(state);
  const position = realPosition(state);
  const debts = debtsSummary(state);
  const hasDebts = debts.owedToMe > 0 || debts.iOwe > 0;
  const realMonth = monthKey(new Date());
  const today = todayISO();
  const primary =
    state.primaryAccountId ?? state.accounts[0]?.id ?? "";

  // Единые напоминания с действием: подписки, кредиты, долги
  // в ближайшие 7 дней или просроченные.
  const reminders: Reminder[] = [];
  const defaultPayAccount = (excludeId?: string) => {
    const primaryAcc = state.accounts.find((a) => a.id === primary);
    if (primaryAcc && primaryAcc.id !== excludeId && primaryAcc.kind !== "credit_card") {
      return primaryAcc.id;
    }
    return (
      state.accounts.find((a) => a.id !== excludeId && a.kind !== "credit_card")?.id ??
      state.accounts.find((a) => a.id !== excludeId)?.id ??
      ""
    );
  };

  for (const s of subscriptionStatuses(state, realMonth, today)) {
    if (s.paid) continue;
    const days = daysUntil(s.date);
    if (days > 7) continue;
    reminders.push({
      key: `s-${s.rule.id}`,
      days,
      iso: s.date,
      title: `Подписка «${s.rule.title || s.rule.category}»`,
      amount: s.rule.amount,
      kind: "subscription",
      targetId: s.rule.id,
      defaultAccountId: s.rule.accountId,
      actionLabel: "Оплатить",
      onOpen: onOpenSubscriptions,
    });
  }
  for (const v of creditViews(state)) {
    if (!v.nextPaymentDate) continue;
    const days = daysUntil(v.nextPaymentDate);
    if (days > 7) continue;
    const acc = v.credit.accountId || primary;
    reminders.push({
      key: `c-${v.credit.id}`,
      days,
      iso: v.nextPaymentDate,
      title: `Платёж по «${v.credit.name}»`,
      amount: v.nextPaymentAmount,
      kind: "credit",
      targetId: v.credit.id,
      defaultAccountId: acc,
      actionLabel: "Внести",
      onOpen: onOpenCredits,
    });
  }
  for (const d of state.debts ?? []) {
    if (d.deleted || !d.dueDate || isDebtSettled(d)) continue;
    const days = daysUntil(d.dueDate);
    if (days > 7) continue;
    const iOwe = d.direction === "i_owe";
    reminders.push({
      key: `d-${d.id}`,
      days,
      iso: d.dueDate,
      title: iOwe
        ? `Вернуть долг «${d.person || "без имени"}»`
        : `Возврат от «${d.person || "без имени"}»`,
      amount: debtOutstanding(d),
      kind: "debt",
      targetId: d.id,
      defaultAccountId: d.accountId,
      actionLabel: iOwe ? "Погасить" : "Получено",
      onOpen: onOpenDebts,
    });
  }
  for (const a of state.accounts) {
    if (a.kind !== "credit_card") continue;
    const amount = creditCardDebt(state, a.id);
    if (amount <= 0) continue;
    const date = creditCardDueDate(a, realMonth);
    if (!date) continue;
    const days = daysUntil(date);
    if (days > 7) continue;
    reminders.push({
      key: `cc-${a.id}`,
      days,
      iso: date,
      title: `Оплата кредитки «${a.name}»`,
      amount,
      kind: "credit_card",
      targetId: a.id,
      defaultAccountId: defaultPayAccount(a.id),
      actionLabel: "Оплата",
    });
  }
  reminders.sort((a, b) => a.days - b.days);

  function submitReminderPayment(r: Reminder, amount: number, accountId: string, date: string) {
    if (r.kind === "subscription") {
      paySubscription(r.targetId, { amount, accountId, date });
    } else if (r.kind === "credit") {
      addCreditPayment(r.targetId, { amount, accountId, date });
    } else if (r.kind === "debt") {
      addDebtPayment(r.targetId, { amount, accountId, date });
    } else {
      addOperation({
        date,
        type: "transfer",
        category: "",
        amount,
        accountId,
        toAccountId: r.targetId,
        note: r.title,
      });
    }
    setActiveReminder(null);
  }

  // Предстоящие списания текущего месяца (показываем только для текущего месяца)
  const isCurrentMonth = month === monthKey(new Date());
  const upcoming = isCurrentMonth
    ? upcomingThisMonth(state, month, todayISO())
    : [];
  const upcomingNet = upcoming.reduce((s, u) => s + u.sign * u.amount, 0);

  // Обороты по счетам за выбранный месяц (только со движением)
  const accountFlows = state.accounts
    .map((a) => ({ a, f: accountMonthFlow(state, a.id, month) }))
    .filter((x) => x.f.income > 0 || x.f.expense > 0);
  const goal = state.goal;
  const goalRemaining = goal.target - goal.saved;
  const goalPercent = goal.target > 0 ? (goal.saved / goal.target) * 100 : 0;

  // Расширенная статистика месяца
  const savingsRate =
    summary.income > 0 ? Math.round((summary.diff / summary.income) * 100) : 0;
  const incomeExpenseTotal = summary.income + summary.expense;
  const prev = monthSummary(state, shiftMonth(month, -1));
  const incomeDeltaPct =
    prev.income > 0
      ? Math.round(((summary.income - prev.income) / prev.income) * 100)
      : null;
  const expenseDeltaPct =
    prev.expense > 0
      ? Math.round(((summary.expense - prev.expense) / prev.expense) * 100)
      : null;
  const pace = expensePace(state, month, today);
  const subsMonthly = subscriptionsMonthlyTotal(state);
  const topNotes = notesBreakdown(state, month).slice(0, 6);
  const hasData = state.operations.some((o) => !o.deleted);

  return (
    <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0">
      {!hasData && (
        <div className="rounded-2xl bg-brand p-4 text-[14px] leading-relaxed text-white md:col-span-2">
          Привет! Здесь будет ваша сводка. Добавьте первую операцию во вкладке
          «Добавить» — появятся балансы, статистика и графики.
        </div>
      )}
      {/* Реальная позиция — крупно */}
      <div
        className={`overflow-hidden rounded-2xl p-5 md:col-span-2 ${
          position < 0
            ? "bg-red-50 dark:bg-red-950/40"
            : "bg-gradient-to-br from-brand to-[#5417C2] text-white"
        }`}
      >
        <div
          className={`text-[13px] font-medium ${
            position < 0 ? "text-red-700 dark:text-red-300" : "text-white/70"
          }`}
        >
          Реальная позиция
        </div>
        <div className="mt-1 text-[40px] font-bold leading-none tracking-tight">
          <Money
            value={position}
            colorNegative={position < 0}
            className={position < 0 ? "text-red-600 dark:text-red-400" : "text-white"}
          />
        </div>
        <div
          className={`mt-2 text-[13px] ${
            position < 0 ? "text-red-500 dark:text-red-400" : "text-white/55"
          }`}
        >
          С учётом кредита и долгов
        </div>
      </div>

      {/* Напоминания с действием: подписки, кредиты, долги, кредитки */}
      {reminders.length > 0 && (
        <div className="space-y-2 md:col-span-2">
          {activeReminder && (
            <ReminderPaymentPanel
              reminder={activeReminder}
              accounts={state.accounts}
              onCancel={() => setActiveReminder(null)}
              onSubmit={submitReminderPayment}
            />
          )}
          {reminders.map((r) => {
            const urgent = r.days <= 0;
            return (
              <div
                key={r.key}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                  urgent
                    ? "bg-red-50 dark:bg-red-950/40"
                    : "bg-amber-50 dark:bg-amber-950/30"
                }`}
              >
                <span
                  className={`text-[20px] ${
                    urgent ? "text-red-500" : "text-amber-500 dark:text-amber-400"
                  }`}
                >
                  {urgent ? "⚠️" : "🔔"}
                </span>
                <button
                  type="button"
                  onClick={r.onOpen}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-[15px] font-semibold">
                    {r.title}
                  </div>
                  <div
                    className={`text-[13px] ${
                      urgent
                        ? "text-red-600 dark:text-red-300"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {relativeDayLabel(r.iso)} · {formatMoney(r.amount)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReminder(r)}
                  className="shrink-0 rounded-full bg-brand px-3.5 py-1.5 text-[14px] font-semibold text-white active:scale-95"
                >
                  {r.actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* На руках + счета */}
      <Card className="!p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[15px] font-medium">На руках</span>
          <span className="text-[17px] font-semibold">{formatMoney(onHand)}</span>
        </div>
        {state.accounts.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between border-t border-[var(--separator)] px-4 py-3 text-[15px]"
          >
            <span className="flex items-center gap-2.5 text-label-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: accountColor(a.id) }}
              />
              {a.name}
            </span>
            <Money value={currentBalance(state, a.id)} />
          </div>
        ))}
      </Card>

      {/* Долги */}
      {hasDebts && (
        <div>
          <SectionTitle>Долги</SectionTitle>
          <Card className="!p-0">
            <button
              type="button"
              onClick={onOpenDebts}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] active:bg-black/[0.03] dark:active:bg-white/5"
            >
              <span className="text-label-2">Мне должны</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {formatMoney(debts.owedToMe)}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenDebts}
              className="flex w-full items-center justify-between border-t border-[var(--separator)] px-4 py-3 text-left text-[15px] active:bg-black/[0.03] dark:active:bg-white/5"
            >
              <span className="text-label-2">Я должен</span>
              <span className="font-medium text-red-600 dark:text-red-400">
                {formatMoney(debts.iOwe)}
              </span>
            </button>
          </Card>
        </div>
      )}

      {/* За месяц — расширенная статистика */}
      <div className="md:col-span-2">
        <SectionTitle>{monthLabel(month)}</SectionTitle>
        <Card>
          {/* Разница + норма сбережений */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[13px] text-label-2">Разница за месяц</div>
              <div className="mt-0.5 text-[30px] font-bold leading-none tracking-tight">
                <Money value={summary.diff} colorPositive showPlus />
              </div>
            </div>
            {summary.income > 0 && (
              <div className="text-right">
                <div className="text-[13px] text-label-2">Норма сбережений</div>
                <div
                  className={`mt-0.5 text-[22px] font-bold leading-none ${
                    savingsRate >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {savingsRate}%
                </div>
              </div>
            )}
          </div>

          {/* Пропорция доход / расход */}
          {incomeExpenseTotal > 0 && (
            <div className="mt-3.5 flex h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${(summary.income / incomeExpenseTotal) * 100}%` }}
              />
              <div
                className="h-full bg-red-500"
                style={{ width: `${(summary.expense / incomeExpenseTotal) * 100}%` }}
              />
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-[13px]">
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400">
                ↑ {formatMoney(summary.income)}
              </span>
              <DeltaBadge pct={incomeDeltaPct} goodUp />
            </span>
            <span className="flex items-center gap-1.5">
              <DeltaBadge pct={expenseDeltaPct} goodUp={false} />
              <span className="text-red-600 dark:text-red-400">
                ↓ {formatMoney(summary.expense)}
              </span>
            </span>
          </div>

          {/* Метрики */}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--separator)] pt-3.5 text-center">
            <Metric
              label="Средний/день"
              value={formatMoney(pace.avgDaily)}
            />
            <Metric
              label={isCurrentMonth ? "Прогноз расхода" : "Расход"}
              value={formatMoney(pace.projected)}
              hint={
                isCurrentMonth
                  ? `${pace.daysElapsed} из ${pace.daysInMonth} дн.`
                  : undefined
              }
            />
            <Metric
              label="Подписки/мес"
              value={formatMoney(subsMonthly)}
              onClick={onOpenSubscriptions}
            />
          </div>
        </Card>
      </div>

      {/* Обороты по счетам за месяц */}
      {accountFlows.length > 0 && (
        <div>
          <SectionTitle>Обороты по счетам</SectionTitle>
          <Card className="!p-0">
            {accountFlows.map(({ a, f }, i) => (
              <div
                key={a.id}
                className={`px-4 py-3 ${
                  i > 0 ? "border-t border-[var(--separator)]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="flex items-center gap-2.5 text-label-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: accountColor(a.id) }}
                    />
                    {a.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 tabular-nums">
                    {f.income > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{formatMoney(f.income)}
                      </span>
                    )}
                    {f.expense > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        −{formatMoney(f.expense)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-2">
                  <Sparkline
                    values={accountTrend(state, a.id, month, 6).map((p) => p.net)}
                  />
                  <div className="mt-1 text-[11px] text-label-3">
                    чистый оборот за 6 мес.
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Предстоящие в этом месяце */}
      {upcoming.length > 0 && (
        <div>
          <SectionTitle>Предстоящие в этом месяце</SectionTitle>
          <Card className="!p-0">
            {upcoming.map((u, i) => (
              <div
                key={u.key}
                className={`flex items-center justify-between gap-3 px-4 py-3 text-[15px] ${
                  i > 0 ? "border-t border-[var(--separator)]" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{u.title}</div>
                  <div className="text-[13px] text-label-2">
                    {formatDateShort(u.date)}
                    {u.kind === "recurring" ? " · регулярно" : " · кредит"}
                  </div>
                </div>
                <Money
                  value={u.sign * u.amount}
                  showPlus
                  colorPositive
                  className="shrink-0 font-semibold"
                />
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-[var(--separator)] px-4 py-3 text-[15px]">
              <span className="text-label-2">Итого изменит баланс</span>
              <Money value={upcomingNet} showPlus colorPositive className="font-semibold" />
            </div>
          </Card>
        </div>
      )}

      {/* Динамика по месяцам */}
      <div className="md:col-span-2">
        <MonthlyTrend state={state} month={month} onSelectMonth={onSelectMonth} />
      </div>

      {/* Расходы по категориям (раскрываются по заметкам) */}
      <div className="md:col-span-2">
        <SpendingBreakdown
          state={state}
          month={month}
          onOpenNote={onOpenSearch}
        />
      </div>

      {/* Куда уходят деньги — топ мест по заметкам */}
      {topNotes.length > 0 && (
        <div className="md:col-span-2">
          <SectionTitle>Куда уходят деньги</SectionTitle>
          <Card className="!p-0">
            {topNotes.map((n, i) => (
              <button
                key={n.label}
                type="button"
                onClick={() => onOpenSearch?.(n.label)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] active:bg-black/[0.03] dark:active:bg-white/5 ${
                  i > 0 ? "border-t border-[var(--separator)]" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[12px] font-bold text-brand">
                    {i + 1}
                  </span>
                  <span className="truncate">
                    {n.label}
                    <span className="text-[13px] text-label-3"> · {n.count}×</span>
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatMoney(n.total)}
                </span>
              </button>
            ))}
          </Card>
          <p className="mt-1.5 px-1 text-[13px] text-label-2">
            По заметкам к операциям. Нажми, чтобы увидеть все траты места.
          </p>
        </div>
      )}

      {/* Цель (скрыта, пока цель не задана) */}
      {goal.target > 0 && (
      <div>
        <SectionTitle>Цель · {goal.name}</SectionTitle>
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">
              {formatMoney(goal.saved)}{" "}
              <span className="text-label-2">из {formatMoney(goal.target)}</span>
            </span>
            <span className="text-[15px] font-semibold text-brand">
              {Math.round(goalPercent)}%
            </span>
          </div>
          <div className="mt-2.5">
            <ProgressBar percent={goalPercent} />
          </div>
          <div className="mt-2 text-[13px] text-label-2">
            Осталось накопить {formatMoney(goalRemaining)}
          </div>
        </Card>
      </div>
      )}

      {/* Кредиты */}
      {credit.totalDue > 0 && (
        <div>
          <SectionTitle>Кредиты</SectionTitle>
          <Card className="!p-0">
            <button
              type="button"
              onClick={onOpenCredits}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] active:bg-black/[0.03] dark:active:bg-white/5"
            >
              <span className="text-label-2">Ближайший платёж</span>
              <span className="font-medium">
                {credit.nextPaymentDate
                  ? `${formatDateLong(credit.nextPaymentDate)} · ${formatMoney(
                      credit.nextPaymentAmount
                    )}`
                  : "—"}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenCredits}
              className="flex w-full items-center justify-between border-t border-[var(--separator)] px-4 py-3 text-left text-[15px] active:bg-black/[0.03] dark:active:bg-white/5"
            >
              <span className="text-label-2">Осталось выплатить</span>
              <span className="font-medium">{formatMoney(credit.remaining)}</span>
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="text-[12px] text-label-2">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-label-3">{hint}</div>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="text-center active:opacity-60">
      {inner}
    </button>
  ) : (
    <div className="text-center">{inner}</div>
  );
}

function ReminderPaymentPanel({
  reminder,
  accounts,
  onCancel,
  onSubmit,
}: {
  reminder: Reminder;
  accounts: Account[];
  onCancel: () => void;
  onSubmit: (
    reminder: Reminder,
    amount: number,
    accountId: string,
    date: string
  ) => void;
}) {
  const cardPayment = reminder.kind === "credit_card";
  const regularAccounts = accounts.filter(
    (a) => a.id !== reminder.targetId && a.kind !== "credit_card"
  );
  const accountOptions =
    cardPayment && regularAccounts.length > 0
      ? regularAccounts
      : accounts.filter((a) => a.id !== reminder.targetId);
  const initialAccount = accountOptions.some(
    (a) => a.id === reminder.defaultAccountId
  )
    ? reminder.defaultAccountId
    : accountOptions[0]?.id ?? "";

  const [amountText, setAmountText] = useState(String(Math.round(reminder.amount)));
  const [accountId, setAccountId] = useState(initialAccount);
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState("");

  const amount = Math.abs(Number(amountText.replace(/\s/g, "").replace(",", ".")));
  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-[13px] font-medium ${
      active
        ? "bg-brand text-white"
        : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
    }`;

  function submit() {
    if (!amount || Number.isNaN(amount)) {
      setError("Введите сумму больше нуля");
      return;
    }
    if (!accountId) {
      setError("Выберите счёт");
      return;
    }
    onSubmit(reminder, amount, accountId, date);
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">
              {reminder.title}
            </div>
            <div className="text-[13px] text-label-2">
              {relativeDayLabel(reminder.iso)} · обычно {formatMoney(reminder.amount)}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Закрыть"
            className="shrink-0 text-label-3"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={amountText}
            onChange={(e) => {
              if (error) setError("");
              setAmountText(e.target.value);
            }}
            onWheel={(e) => e.currentTarget.blur()}
            className={fieldCls}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${fieldCls} w-[9.5rem]`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAmountText(String(Math.round(reminder.amount)))}
            className={chip(false)}
          >
            {reminder.kind === "subscription" ? "Типовая" : "Вся сумма"}
          </button>
          {reminder.amount > 1 && (
            <button
              type="button"
              onClick={() => setAmountText(String(Math.round(reminder.amount / 2)))}
              className={chip(false)}
            >
              Половина
            </button>
          )}
        </div>

        {accountOptions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {accountOptions.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => setAccountId(a.id)}
                className={chip(accountId === a.id)}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        {cardPayment && (
          <p className="text-[13px] text-label-2">
            Оплата кредитки запишется переводом: выбранный счёт уменьшится,
            баланс карты приблизится к нулю.
          </p>
        )}

        {error && (
          <p className="text-[13px] font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-2.5">
          {reminder.onOpen && (
            <button
              type="button"
              onClick={() => {
                reminder.onOpen?.();
                onCancel();
              }}
              className="flex-1 rounded-xl bg-black/[0.06] py-3 text-[15px] font-semibold text-brand dark:bg-white/10"
            >
              Раздел
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            className="flex-[2] rounded-xl bg-brand py-3 text-[15px] font-semibold text-white disabled:opacity-40"
            disabled={!accountId}
          >
            Записать
          </button>
        </div>
      </div>
    </Card>
  );
}

// Изменение к прошлому месяцу: ▲/▼ N%. goodUp — рост это хорошо (доход) или плохо (расход)
function DeltaBadge({
  pct,
  goodUp,
}: {
  pct: number | null;
  goodUp: boolean;
}) {
  if (pct === null || pct === 0) return null;
  const up = pct > 0;
  const good = up === goodUp;
  return (
    <span
      className={`text-[12px] font-medium ${
        good
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-500 dark:text-red-400"
      }`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(pct)}%
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
      {children}
    </div>
  );
}
