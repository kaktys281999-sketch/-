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
  paymentCalendar,
  accountMonthFlow,
  accountTrend,
  subscriptionStatuses,
  subscriptionsMonthlyTotal,
  expensePace,
  notesBreakdown,
  creditCardDebt,
  nextCreditCardDueDate,
  creditCardAvailable,
} from "@/lib/store";
import type { PaymentCalendarItem } from "@/lib/store";
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
import { Card, Money, Sparkline } from "./ui";
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
  amountLabel?: string;
  manualAmount?: boolean;
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
    const date = nextCreditCardDueDate(a, today);
    if (!date) continue;
    const days = daysUntil(date);
    if (days > 7) continue;
    reminders.push({
      key: `cc-${a.id}`,
      days,
      iso: date,
      title: `Оплата кредитки «${a.name}»`,
      amount,
      amountLabel: `долг ${formatMoney(amount)}`,
      manualAmount: true,
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

  const paymentItems = paymentCalendar(state, month, today);
  const isCurrentMonth = month === monthKey(new Date());

  // Обороты по счетам за выбранный месяц (только со движением)
  const accountFlows = state.accounts
    .map((a) => ({ a, f: accountMonthFlow(state, a.id, month) }))
    .filter((x) => x.f.income > 0 || x.f.expense > 0);
  const regularAccounts = state.accounts.filter((a) => a.kind !== "credit_card");
  const creditCardAccounts = state.accounts.filter(
    (a) => a.kind === "credit_card"
  );
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
                    {relativeDayLabel(r.iso)} ·{" "}
                    {r.amountLabel ?? formatMoney(r.amount)}
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
          <span>
            <span className="block text-[15px] font-medium">На руках</span>
            <span className="block text-[12px] text-label-3">
              обычные счета, без кредиток
            </span>
          </span>
          <span className="text-[17px] font-semibold">{formatMoney(onHand)}</span>
        </div>
        {regularAccounts.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 border-t border-[var(--separator)] px-4 py-3 text-[15px]"
          >
            <span className="flex min-w-0 items-center gap-2.5 text-label-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: accountColor(a.id) }}
              />
              <span className="block min-w-0 truncate">{a.name}</span>
            </span>
            <Money value={currentBalance(state, a.id)} className="shrink-0" />
          </div>
        ))}
        {creditCardAccounts.length > 0 && (
          <div className="border-t border-[var(--separator)] px-4 pb-1 pt-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-label-3">
              Кредитки
            </div>
            <div className="mt-0.5 text-[12px] normal-case tracking-normal text-label-3">
              траты меняют долг и остаток, не сумму на руках
            </div>
          </div>
        )}
        {creditCardAccounts.map((a) => {
          const debt = creditCardDebt(state, a.id);
          const limit = Math.max(0, a.creditLimit ?? 0);
          const available = creditCardAvailable(state, a.id);
          return (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-label-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: accountColor(a.id) }}
                />
                <span className="min-w-0">
                  <span className="block truncate">{a.name}</span>
                  <span className="block truncate text-[12px] text-label-3">
                    долг {formatMoney(debt)}
                    {limit > 0 ? ` · лимит ${formatMoney(limit)}` : ""}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[11px] uppercase text-label-3">
                  {limit > 0 ? "Остаток" : "Баланс"}
                </span>
                <Money
                  value={limit > 0 ? available : currentBalance(state, a.id)}
                  className="block"
                />
              </span>
            </div>
          );
        })}
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

      <PaymentCalendarSection
        month={month}
        today={today}
        items={paymentItems}
        onOpenDebts={onOpenDebts}
        onOpenCredits={onOpenCredits}
        onOpenSubscriptions={onOpenSubscriptions}
      />

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

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function calendarCells(month: string): Array<number | null> {
  const [year, monthIndex] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const firstWeekday = new Date(year, monthIndex - 1, 1).getDay();
  const mondayOffset = (firstWeekday + 6) % 7;
  const cells: Array<number | null> = [
    ...Array.from({ length: mondayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isoForDay(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function compactMoney(value: number): string {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}${Math.round(abs / 1000000)}м`;
  if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}к`;
  return `${sign}${abs}`;
}

function paymentKindLabel(kind: PaymentCalendarItem["kind"]): string {
  if (kind === "subscription") return "Подписка";
  if (kind === "credit") return "Кредит";
  if (kind === "debt") return "Долг";
  if (kind === "credit_card") return "Кредитка";
  return "Регулярно";
}

function paymentKindClass(kind: PaymentCalendarItem["kind"]): string {
  if (kind === "subscription") {
    return "bg-sky-50 text-sky-700 dark:bg-sky-950/35 dark:text-sky-300";
  }
  if (kind === "credit") {
    return "bg-violet-50 text-violet-700 dark:bg-violet-950/35 dark:text-violet-300";
  }
  if (kind === "debt") {
    return "bg-red-50 text-red-700 dark:bg-red-950/35 dark:text-red-300";
  }
  if (kind === "credit_card") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300";
  }
  return "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300";
}

function paymentKindDotClass(kind: PaymentCalendarItem["kind"]): string {
  if (kind === "subscription") return "bg-sky-500";
  if (kind === "credit") return "bg-violet-500";
  if (kind === "debt") return "bg-red-500";
  if (kind === "credit_card") return "bg-amber-500";
  return "bg-slate-500";
}

function paymentAmountText(item: PaymentCalendarItem): string {
  return item.manualAmount
    ? `долг ${formatMoney(item.amount)}`
    : formatMoney(item.amount);
}

function paymentStateText(item: PaymentCalendarItem, today: string): string {
  if (item.paid) return "оплачено";
  if (item.manualAmount) return "сумма вручную";
  if (item.date < today) return "просрочено";
  return "к оплате";
}

function paymentTooltipTitle(items: PaymentCalendarItem[], today: string): string {
  return items
    .map(
      (item) =>
        `${paymentKindLabel(item.kind)}: ${item.title}, ${paymentAmountText(
          item
        )}, ${paymentStateText(item, today)}`
    )
    .join("\n");
}

function PaymentCalendarSection({
  month,
  today,
  items,
  onOpenDebts,
  onOpenCredits,
  onOpenSubscriptions,
}: {
  month: string;
  today: string;
  items: PaymentCalendarItem[];
  onOpenDebts?: () => void;
  onOpenCredits?: () => void;
  onOpenSubscriptions?: () => void;
}) {
  const byDate = new Map<string, PaymentCalendarItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const totalFixed = items
    .filter((item) => !item.paid && !item.manualAmount)
    .reduce((sum, item) => sum + item.amount, 0);
  const manualCount = items.filter((item) => !item.paid && item.manualAmount).length;
  const unpaidCount = items.filter((item) => !item.paid).length;
  const cells = calendarCells(month);
  const totalRows = Math.ceil(cells.length / 7);

  const openByKind = (kind: PaymentCalendarItem["kind"]) => {
    if (kind === "subscription") return onOpenSubscriptions;
    if (kind === "credit") return onOpenCredits;
    if (kind === "debt") return onOpenDebts;
    return undefined;
  };

  return (
    <div className="md:col-span-2">
      <SectionTitle>Календарь оплат</SectionTitle>
      <Card className="!p-0 overflow-visible">
        <div className="flex items-start justify-between gap-3 rounded-t-2xl bg-gradient-to-br from-brand/10 to-transparent px-4 py-3 dark:from-brand/20">
          <div>
            <div className="text-[13px] text-label-2">
              {monthLabel(month)} · фиксировано к оплате
            </div>
            <div className="mt-0.5 text-[22px] font-bold leading-none">
              {totalFixed > 0
                ? formatMoney(totalFixed)
                : manualCount > 0
                  ? "Сумма вручную"
                  : "0 ₽"}
            </div>
          </div>
          <div className="max-w-[48%] text-right text-[12px] leading-snug text-label-2">
            {unpaidCount > 0
              ? `${unpaidCount} к оплате`
              : "Все оплаты закрыты"}
            {manualCount > 0 && (
              <div className="mt-0.5 text-amber-700 dark:text-amber-300">
                {manualCount} с ручной суммой
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 px-3 pb-1 pt-3 text-center text-[11px] font-semibold uppercase text-label-3">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 px-3 pb-3">
          {cells.map((day, index) => {
            if (!day) {
              return (
                <div
                  key={`empty-${index}`}
                  className="min-h-[64px] rounded-xl bg-black/[0.025] dark:bg-white/[0.03]"
                />
              );
            }
            const row = Math.floor(index / 7);
            const col = index % 7;
            const iso = isoForDay(month, day);
            const dayItems = byDate.get(iso) ?? [];
            const unpaid = dayItems.filter((item) => !item.paid);
            const fixedSum = unpaid
              .filter((item) => !item.manualAmount)
              .reduce((sum, item) => sum + item.amount, 0);
            const hasManual = unpaid.some((item) => item.manualAmount);
            const isToday = iso === today;
            const isOverdue = unpaid.some(
              (item) => !item.manualAmount && item.date < today
            );
            const allPaid = dayItems.length > 0 && unpaid.length === 0;
            const tooltipX =
              col <= 1
                ? "left-0"
                : col >= 5
                  ? "right-0"
                  : "left-1/2 -translate-x-1/2";
            const tooltipY =
              row >= totalRows - 2 ? "bottom-full mb-2" : "top-full mt-2";
            return (
              <div
                key={iso}
                tabIndex={dayItems.length > 0 ? 0 : undefined}
                title={
                  dayItems.length > 0
                    ? paymentTooltipTitle(dayItems, today)
                    : undefined
                }
                aria-label={
                  dayItems.length > 0
                    ? paymentTooltipTitle(dayItems, today)
                    : undefined
                }
                className={`group relative min-h-[64px] rounded-xl border p-2 outline-none transition ${
                  isOverdue
                    ? "border-red-200 bg-red-50 shadow-sm dark:border-red-900/60 dark:bg-red-950/25"
                    : isToday
                      ? "border-brand/35 bg-brand/10 shadow-sm"
                      : dayItems.length > 0
                        ? "border-amber-200 bg-amber-50/70 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20"
                        : "border-transparent bg-black/[0.025] dark:bg-white/[0.035]"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[12px] font-semibold ${
                      isToday ? "bg-brand text-white" : "text-label-2"
                    }`}
                  >
                    {day}
                  </span>
                  {dayItems.length > 1 && (
                    <span className="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-label-2 dark:bg-white/10">
                      {dayItems.length}
                    </span>
                  )}
                </div>
                {fixedSum > 0 && (
                  <div className="mt-2 inline-flex max-w-full rounded-full bg-white/80 px-1.5 py-1 text-[11px] font-bold leading-none text-red-600 shadow-sm dark:bg-black/20 dark:text-red-300">
                    {compactMoney(fixedSum)}
                  </div>
                )}
                {fixedSum <= 0 && hasManual && (
                  <div className="mt-2 inline-flex max-w-full rounded-full bg-white/80 px-1.5 py-1 text-[10px] font-semibold leading-none text-amber-700 shadow-sm dark:bg-black/20 dark:text-amber-300">
                    вручн.
                  </div>
                )}
                {allPaid && (
                  <div className="mt-2 inline-flex max-w-full rounded-full bg-emerald-50 px-1.5 py-1 text-[10px] font-semibold leading-none text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    оплач.
                  </div>
                )}
                {dayItems.length > 0 && (
                  <div className="mt-2 flex gap-0.5">
                    {dayItems.slice(0, 4).map((item) => (
                      <span
                        key={item.key}
                        className={`h-1.5 flex-1 rounded-full ${paymentKindDotClass(
                          item.kind
                        )} ${item.paid ? "opacity-35" : ""}`}
                      />
                    ))}
                  </div>
                )}
                {dayItems.length > 0 && (
                  <div
                    className={`pointer-events-none absolute ${tooltipX} ${tooltipY} z-30 hidden w-64 rounded-2xl border border-[var(--separator)] bg-white p-3 text-left shadow-2xl group-hover:block group-focus:block dark:bg-[#2c2c2e]`}
                  >
                    <div className="mb-2 text-[12px] font-semibold uppercase text-label-3">
                      {formatDateShort(iso)}
                    </div>
                    <div className="space-y-2">
                      {dayItems.map((item) => (
                        <div key={item.key} className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${paymentKindDotClass(
                                  item.kind
                                )} ${item.paid ? "opacity-35" : ""}`}
                              />
                              <span className="min-w-0 text-[13px] font-medium leading-snug">
                                {item.title}
                              </span>
                            </span>
                            <span
                              className={`shrink-0 text-[12px] font-semibold ${
                                item.manualAmount
                                  ? "text-amber-700 dark:text-amber-300"
                                  : item.paid
                                    ? "text-label-3"
                                    : "text-slate-900 dark:text-slate-100"
                              }`}
                            >
                              {paymentAmountText(item)}
                            </span>
                          </div>
                          <div className="mt-0.5 pl-3.5 text-[11px] text-label-2">
                            {paymentKindLabel(item.kind)} ·{" "}
                            {paymentStateText(item, today)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-4 text-center text-[14px] text-label-2">
            На этот месяц оплат не запланировано.
          </div>
        ) : (
          <div className="border-t border-[var(--separator)]">
            {items.map((item, index) => {
              const opener = openByKind(item.kind);
              const overdue = !item.paid && !item.manualAmount && item.date < today;
              const amountText = paymentAmountText(item);
              const content = (
                <>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentKindClass(
                          item.kind
                        )}`}
                      >
                        {paymentKindLabel(item.kind)}
                      </span>
                      <span className="truncate text-[15px] font-medium">
                        {item.title}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-label-2">
                      {formatDateShort(item.date)}
                      {" · "}
                      {paymentStateText(item, today)}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-right text-[15px] font-semibold ${
                      item.paid
                        ? "text-label-3"
                        : item.manualAmount
                          ? "text-amber-700 dark:text-amber-300"
                          : overdue
                            ? "text-red-600 dark:text-red-300"
                            : ""
                    }`}
                  >
                    {amountText}
                  </span>
                </>
              );
              const className = `flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${
                index > 0 ? "border-t border-[var(--separator)]" : ""
              }`;
              return opener ? (
                <button
                  key={item.key}
                  type="button"
                  onClick={opener}
                  className={`${className} active:bg-black/[0.03] dark:active:bg-white/5`}
                >
                  {content}
                </button>
              ) : (
                <div key={item.key} className={className}>
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </Card>
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
  const manualAmount = reminder.manualAmount || cardPayment;
  const subtitleAmount = cardPayment
    ? `долг ${formatMoney(reminder.amount)}`
    : reminder.kind === "debt"
      ? `остаток ${formatMoney(reminder.amount)}`
      : reminder.kind === "credit"
        ? `платёж ${formatMoney(reminder.amount)}`
        : `обычно ${formatMoney(reminder.amount)}`;

  const [amountText, setAmountText] = useState(
    manualAmount ? "" : String(Math.round(reminder.amount))
  );
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
              {relativeDayLabel(reminder.iso)} · {subtitleAmount}
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
            placeholder={cardPayment ? "Сумма платежа" : "Сумма"}
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
            {cardPayment
              ? "Весь долг"
              : reminder.kind === "subscription"
                ? "Типовая"
                : "Вся сумма"}
          </button>
          {reminder.amount > 1 && (
            <button
              type="button"
              onClick={() => setAmountText(String(Math.round(reminder.amount / 2)))}
              className={chip(false)}
            >
              {cardPayment ? "Половина долга" : "Половина"}
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
