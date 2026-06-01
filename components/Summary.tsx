"use client";

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
} from "@/lib/store";
import {
  formatMoney,
  formatDateLong,
  monthLabel,
  daysUntil,
  relativeDayLabel,
} from "@/lib/format";
import { Card, Money, ProgressBar } from "./ui";
import { SpendingBreakdown } from "./SpendingBreakdown";
import { MonthlyTrend } from "./MonthlyTrend";

// Фирменные цвета банков для точек у счетов
const ACCOUNT_COLORS: Record<string, string> = {
  yandex: "#FC3F1D",
  sber: "#21A038",
  tinkoff: "#FFDD2D",
};

export function Summary({
  month,
  onSelectMonth,
  onOpenDebts,
  onOpenCredits,
}: {
  month: string;
  onSelectMonth?: (key: string) => void;
  onOpenDebts?: () => void;
  onOpenCredits?: () => void;
}) {
  const { state } = useStore();
  const onHand = totalOnHand(state);
  const summary = monthSummary(state, month);
  const credit = creditInfo(state);
  const position = realPosition(state);
  const debts = debtsSummary(state);
  const hasDebts = debts.owedToMe > 0 || debts.iOwe > 0;
  // Единые напоминания (кредиты + долги) на ближайшие 7 дней или просроченные
  type Reminder = {
    key: string;
    days: number;
    iso: string;
    title: string;
    amount: number;
    onClick?: () => void;
  };
  const reminders: Reminder[] = [];
  for (const v of creditViews(state)) {
    if (!v.nextPaymentDate) continue;
    const days = daysUntil(v.nextPaymentDate);
    if (days > 7) continue;
    reminders.push({
      key: `c-${v.credit.id}`,
      days,
      iso: v.nextPaymentDate,
      title: `Платёж по «${v.credit.name}»`,
      amount: v.nextPaymentAmount,
      onClick: onOpenCredits,
    });
  }
  for (const d of state.debts ?? []) {
    if (d.deleted || !d.dueDate || isDebtSettled(d)) continue;
    const days = daysUntil(d.dueDate);
    if (days > 7) continue;
    reminders.push({
      key: `d-${d.id}`,
      days,
      iso: d.dueDate,
      title:
        d.direction === "i_owe"
          ? `Вернуть долг «${d.person || "без имени"}»`
          : `Возврат от «${d.person || "без имени"}»`,
      amount: debtOutstanding(d),
      onClick: onOpenDebts,
    });
  }
  reminders.sort((a, b) => a.days - b.days);
  const goal = state.goal;
  const goalRemaining = goal.target - goal.saved;
  const goalPercent = goal.target > 0 ? (goal.saved / goal.target) * 100 : 0;

  return (
    <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0">
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

      {/* Напоминания: платежи по кредитам и сроки возврата долгов */}
      {reminders.length > 0 && (
        <div className="space-y-2 md:col-span-2">
          {reminders.map((r) => {
            const urgent = r.days <= 0;
            return (
              <button
                key={r.key}
                type="button"
                onClick={r.onClick}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ${
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
                <div className="min-w-0 flex-1">
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
                    {relativeDayLabel(r.iso)} · {formatDateLong(r.iso)}
                  </div>
                </div>
                <span className="shrink-0 text-[15px] font-semibold">
                  {formatMoney(r.amount)}
                </span>
              </button>
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
                style={{ backgroundColor: ACCOUNT_COLORS[a.id] ?? "#94a3b8" }}
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

      {/* За месяц */}
      <div>
        <SectionTitle>{monthLabel(month)}</SectionTitle>
        <Card>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[13px] text-label-2">Доход</div>
              <div className="mt-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                {formatMoney(summary.income)}
              </div>
            </div>
            <div>
              <div className="text-[13px] text-label-2">Расход</div>
              <div className="mt-0.5 font-semibold text-red-600 dark:text-red-400">
                {formatMoney(summary.expense)}
              </div>
            </div>
            <div>
              <div className="text-[13px] text-label-2">Разница</div>
              <div className="mt-0.5 font-semibold">
                <Money value={summary.diff} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Динамика по месяцам */}
      <div className="md:col-span-2">
        <MonthlyTrend state={state} month={month} onSelectMonth={onSelectMonth} />
      </div>

      {/* Расходы по категориям */}
      <div className="md:col-span-2">
        <SpendingBreakdown state={state} month={month} />
      </div>

      {/* Цель */}
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
      {children}
    </div>
  );
}
