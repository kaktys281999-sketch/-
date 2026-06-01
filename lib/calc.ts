// Чистые денежные вычисления (без React) — чтобы их можно было покрыть тестами.
// store.tsx реэкспортирует всё отсюда, поэтому существующие импорты не меняются.
import { AppState, Operation, Debt } from "./types";
import { getCategorySign, CREDIT_PAYMENT_CATEGORY } from "./categories";
import { monthKeyFromISO, todayISO } from "./format";

// Дельта операции для баланса счёта
export function operationDelta(op: Operation): number {
  if (op.type === "income") return op.amount;
  if (op.type === "expense_personal" || op.type === "expense_work")
    return -op.amount;
  // credit_loan — по знаку категории
  return getCategorySign(op.type, op.category) * op.amount;
}

// Влияние долга на баланс конкретного счёта.
// «Мне должны»: дал в долг → деньги ушли (−), возврат → пришли (+).
// «Я должен»: взял в долг → деньги пришли (+), возврат → ушли (−).
export function debtAccountDelta(debt: Debt, accountId: string): number {
  const sign = debt.direction === "owed_to_me" ? -1 : 1; // эффект исходной выдачи/получения
  let delta = 0;
  if (debt.accountId === accountId) delta += sign * debt.amount;
  for (const p of debt.payments) {
    if (p.accountId === accountId) delta += -sign * p.amount; // возврат обратен исходному
  }
  return delta;
}

// ===== Производные вычисления (селекторы) =====

export function currentBalance(state: AppState, accountId: string): number {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc) return 0;
  const opDelta = state.operations
    .filter((o) => o.accountId === accountId && !o.deleted)
    .reduce((sum, o) => sum + operationDelta(o), 0);
  const debtDelta = (state.debts ?? [])
    .filter((d) => !d.deleted)
    .reduce((sum, d) => sum + debtAccountDelta(d, accountId), 0);
  return acc.baseBalance + opDelta + debtDelta;
}

// На руках = сумма балансов всех счетов
export function totalOnHand(state: AppState): number {
  return state.accounts.reduce(
    (sum, a) => sum + currentBalance(state, a.id),
    0
  );
}

export interface MonthSummary {
  income: number;
  expense: number;
  diff: number;
}

// Доход / расход за месяц (кредиты и займы НЕ входят)
export function monthSummary(state: AppState, mKey: string): MonthSummary {
  let income = 0;
  let expense = 0;
  for (const op of state.operations) {
    if (op.deleted) continue;
    if (monthKeyFromISO(op.date) !== mKey) continue;
    if (op.type === "income") income += op.amount;
    else if (op.type === "expense_personal" || op.type === "expense_work")
      expense += op.amount;
  }
  return { income, expense, diff: income - expense };
}

export interface CreditInfo {
  totalDue: number; // всего к выплате
  overpay: number; // переплата
  paid: number; // выплачено
  remaining: number; // осталось выплатить
  nextPaymentDate: string | null;
  nextPaymentAmount: number;
}

// Кредит: расчёты по ТЗ
export function creditInfo(state: AppState): CreditInfo {
  const { credit } = state;
  const totalDue = credit.payment * credit.count;
  const overpay = totalDue - credit.received;

  // Выплачено = сумма операций «Платёж по кредиту» после даты получения
  const paid = state.operations
    .filter(
      (o) =>
        !o.deleted &&
        o.type === "credit_loan" &&
        o.category === CREDIT_PAYMENT_CATEGORY &&
        o.date > credit.receivedDate
    )
    .reduce((sum, o) => sum + o.amount, 0);

  const remaining = totalDue - paid;

  // Ближайший платёж — первая будущая (>= сегодня) дата из расписания
  const today = todayISO();
  const upcoming = [...credit.paymentDates].sort().find((d) => d >= today);
  const nextPaymentDate = upcoming ?? null;

  return {
    totalDue,
    overpay,
    paid,
    remaining,
    nextPaymentDate,
    nextPaymentAmount: credit.payment,
  };
}

// ===== Долги =====

// Сколько осталось вернуть по долгу (не уходит в минус)
export function debtOutstanding(d: Debt): number {
  const paid = d.payments.reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, d.amount - paid);
}

export function debtPaidTotal(d: Debt): number {
  return d.payments.reduce((sum, p) => sum + p.amount, 0);
}

export function isDebtSettled(d: Debt): boolean {
  return debtPaidTotal(d) >= d.amount;
}

export interface DebtsSummary {
  owedToMe: number; // мне должны (остаток)
  iOwe: number; // я должен (остаток)
  net: number; // owedToMe − iOwe
}

export function debtsSummary(state: AppState): DebtsSummary {
  let owedToMe = 0;
  let iOwe = 0;
  for (const d of state.debts ?? []) {
    if (d.deleted) continue;
    const out = debtOutstanding(d);
    if (d.direction === "owed_to_me") owedToMe += out;
    else iOwe += out;
  }
  return { owedToMe, iOwe, net: owedToMe - iOwe };
}

// Реальная позиция = на руках − остаток по кредиту + что мне вернут − что я должен
export function realPosition(state: AppState): number {
  const debts = debtsSummary(state);
  return (
    totalOnHand(state) - creditInfo(state).remaining + debts.owedToMe - debts.iOwe
  );
}
