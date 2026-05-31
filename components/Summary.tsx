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
import { Logo } from "./Logo";

export function Summary({ month }: { month: string }) {
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
        className={`relative overflow-hidden rounded-3xl p-5 shadow-sm ${
          position < 0
            ? "border border-red-200 bg-red-50"
            : "bg-gradient-to-br from-brand to-brand-deep text-white"
        }`}
      >
        {/* Водяной знак логотипа */}
        <Logo
          className={`pointer-events-none absolute -right-5 -top-4 h-28 w-28 ${
            position < 0 ? "text-red-200/50" : "text-white/10"
          }`}
        />
        <div
          className={`relative text-sm font-medium ${
            position < 0 ? "text-red-700" : "text-white/70"
          }`}
        >
          Реальная позиция
        </div>
        <div className="relative mt-1 text-4xl font-extrabold tracking-tight">
          <Money
            value={position}
            colorNegative={position < 0}
            className={position < 0 ? "text-red-600" : "text-white"}
          />
        </div>
        <div
          className={`relative mt-1 text-xs ${
            position < 0 ? "text-red-600" : "text-white/60"
          }`}
        >
          На руках − остаток долга по кредиту
        </div>
      </div>

      {/* На руках + счета */}
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">На руках</span>
          <span className="text-xl font-bold">{formatMoney(onHand)}</span>
        </div>
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {state.accounts.map((a) => (
            <div key={a.id} className="flex justify-between text-sm">
              <span className="text-slate-600">{a.name}</span>
              <Money value={currentBalance(state, a.id)} />
            </div>
          ))}
        </div>
      </Card>

      {/* За месяц */}
      <Card>
        <div className="mb-2 text-sm font-medium text-slate-500">
          {monthLabel(month)}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-slate-500">Доход</div>
            <div className="font-semibold text-emerald-600">
              {formatMoney(summary.income)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Расход</div>
            <div className="font-semibold text-red-600">
              {formatMoney(summary.expense)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Разница</div>
            <div className="font-semibold">
              <Money value={summary.diff} />
            </div>
          </div>
        </div>
      </Card>

      {/* Цель */}
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Цель: {goal.name}</span>
          <span className="text-sm text-slate-500">
            {Math.round(goalPercent)}%
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar percent={goalPercent} />
        </div>
        <div className="mt-2 flex justify-between text-sm">
          <span className="text-slate-600">
            Накоплено {formatMoney(goal.saved)}
          </span>
          <span className="text-slate-600">
            Осталось {formatMoney(goalRemaining)}
          </span>
        </div>
        <div className="mt-1 text-right text-xs text-slate-400">
          Цель {formatMoney(goal.target)}
        </div>
      </Card>

      {/* Кредит */}
      <Card>
        <div className="mb-2 text-sm font-medium">Кредит</div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Ближайший платёж</span>
          <span className="font-medium">
            {credit.nextPaymentDate
              ? `${formatDateLong(credit.nextPaymentDate)} · ${formatMoney(
                  credit.nextPaymentAmount
                )}`
              : "—"}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span className="text-slate-600">Остаток долга</span>
          <span className="font-medium">{formatMoney(credit.remaining)}</span>
        </div>
      </Card>
    </div>
  );
}
