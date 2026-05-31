"use client";

import {
  useStore,
  totalOnHand,
  monthSummary,
  creditInfo,
  realPosition,
  currentBalance,
} from "@/lib/store";
import { formatMoney, formatDateLong, monthLabel } from "@/lib/format";
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
}: {
  month: string;
  onSelectMonth?: (key: string) => void;
}) {
  const { state } = useStore();
  const onHand = totalOnHand(state);
  const summary = monthSummary(state, month);
  const credit = creditInfo(state);
  const position = realPosition(state);
  const goal = state.goal;
  const goalRemaining = goal.target - goal.saved;
  const goalPercent = goal.target > 0 ? (goal.saved / goal.target) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Реальная позиция — крупно */}
      <div
        className={`rounded-2xl p-5 ${
          position < 0
            ? "border border-red-100 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40"
            : "bg-brand text-white"
        }`}
      >
        <div
          className={`text-sm font-medium ${
            position < 0 ? "text-red-700 dark:text-red-300" : "text-white/70"
          }`}
        >
          Реальная позиция
        </div>
        <div className="mt-1.5 text-4xl font-extrabold tracking-tight">
          <Money
            value={position}
            colorNegative={position < 0}
            className={position < 0 ? "text-red-600 dark:text-red-400" : "text-white"}
          />
        </div>
        <div
          className={`mt-1.5 text-xs ${
            position < 0 ? "text-red-500 dark:text-red-400" : "text-white/55"
          }`}
        >
          На руках − остаток долга по кредиту
        </div>
      </div>

      {/* На руках + счета */}
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">На руках</span>
          <span className="text-xl font-bold">{formatMoney(onHand)}</span>
        </div>
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {state.accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: ACCOUNT_COLORS[a.id] ?? "#94a3b8" }}
                />
                {a.name}
              </span>
              <Money value={currentBalance(state, a.id)} />
            </div>
          ))}
        </div>
      </Card>

      {/* За месяц */}
      <Card>
        <div className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400">
          {monthLabel(month)}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Доход</div>
            <div className="font-semibold text-emerald-600 dark:text-emerald-400">
              {formatMoney(summary.income)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Расход</div>
            <div className="font-semibold text-red-600 dark:text-red-400">
              {formatMoney(summary.expense)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Разница</div>
            <div className="font-semibold">
              <Money value={summary.diff} />
            </div>
          </div>
        </div>
      </Card>

      {/* Динамика по месяцам */}
      <MonthlyTrend state={state} month={month} onSelectMonth={onSelectMonth} />

      {/* Расходы по категориям */}
      <SpendingBreakdown state={state} month={month} />

      {/* Цель */}
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Цель: {goal.name}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {Math.round(goalPercent)}%
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar percent={goalPercent} />
        </div>
        <div className="mt-2 flex justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-300">
            Накоплено {formatMoney(goal.saved)}
          </span>
          <span className="text-slate-600 dark:text-slate-300">
            Осталось {formatMoney(goalRemaining)}
          </span>
        </div>
        <div className="mt-1 text-right text-xs text-slate-400 dark:text-slate-500">
          Цель {formatMoney(goal.target)}
        </div>
      </Card>

      {/* Кредит */}
      <Card>
        <div className="mb-2 text-sm font-medium">Кредит</div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-300">Ближайший платёж</span>
          <span className="font-medium">
            {credit.nextPaymentDate
              ? `${formatDateLong(credit.nextPaymentDate)} · ${formatMoney(
                  credit.nextPaymentAmount
                )}`
              : "—"}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-300">Остаток долга</span>
          <span className="font-medium">{formatMoney(credit.remaining)}</span>
        </div>
      </Card>
    </div>
  );
}
