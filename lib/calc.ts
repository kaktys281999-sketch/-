// Чистые денежные вычисления (без React) — чтобы их можно было покрыть тестами.
// store.tsx реэкспортирует всё отсюда, поэтому существующие импорты не меняются.
import { AppState, Operation, Debt, Credit, RecurringRule } from "./types";
import { getCategorySign } from "./categories";
import { monthKeyFromISO, shiftMonth } from "./format";

const pad2 = (n: number) => String(n).padStart(2, "0");

// Список месяцев «YYYY-MM» от start до end включительно (с предохранителем)
function monthsRange(start: string, end: string): string[] {
  if (!start || start > end) return [];
  const res: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 600) {
    res.push(`${y}-${pad2(m)}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    guard++;
  }
  return res;
}

function lastDayOfMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// Какие операции по регулярным правилам нужно создать.
// id операции детерминированный (`rec-<rule>-<month>`) — это исключает дубли
// при повторной генерации и между устройствами при синхронизации.
export function dueRecurringOperations(
  rules: RecurringRule[],
  existingIds: Set<string>,
  currentMonth: string,
  today: string
): Operation[] {
  const out: Operation[] = [];
  for (const r of rules) {
    if (r.deleted || r.active === false || !r.startMonth || !r.category) continue;
    if (r.kind === "subscription") continue; // подписки списываются вручную
    for (const month of monthsRange(r.startMonth, currentMonth)) {
      const id = `rec-${r.id}-${month}`;
      if (existingIds.has(id)) continue; // уже создана или удалена (надгробие)
      const day = Math.min(Math.max(1, r.dayOfMonth || 1), lastDayOfMonth(month));
      const date = `${month}-${pad2(day)}`;
      if (month === currentMonth && date > today) continue; // ещё не наступило
      out.push({
        id,
        date,
        type: r.type,
        category: r.category,
        amount: r.amount,
        accountId: r.accountId,
        note: r.note ?? "",
        recurringId: r.id,
        updatedAt: 0,
      });
    }
  }
  return out;
}

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

// Влияние кредита на баланс счёта: платежи списываются со счёта (−).
// Сама полученная сумма уже учтена в стартовом балансе, поэтому её не добавляем.
export function creditAccountDelta(credit: Credit, accountId: string): number {
  let delta = 0;
  for (const p of credit.payments) {
    if (p.accountId === accountId) delta -= p.amount;
  }
  return delta;
}

// Предстоящие в текущем месяце списания: будущие регулярные операции этого
// месяца (ещё не созданные) и платёж по кредиту, если его срок в этом месяце.
export interface Upcoming {
  key: string;
  date: string;
  title: string;
  amount: number;
  sign: 1 | -1; // влияние на баланс: +доход / −расход
  kind: "recurring" | "credit";
}

export function upcomingThisMonth(
  state: AppState,
  currentMonth: string,
  today: string
): Upcoming[] {
  const existing = new Set(state.operations.map((o) => o.id));
  const res: Upcoming[] = [];

  for (const r of state.recurring ?? []) {
    if (r.deleted || r.active === false || !r.category) continue;
    if (r.kind === "subscription") continue; // подписки — отдельный блок
    if (r.startMonth > currentMonth) continue;
    const day = Math.min(
      Math.max(1, r.dayOfMonth || 1),
      lastDayOfMonth(currentMonth)
    );
    const date = `${currentMonth}-${pad2(day)}`;
    if (date <= today) continue; // уже наступила/создана
    if (existing.has(`rec-${r.id}-${currentMonth}`)) continue;
    res.push({
      key: `r-${r.id}`,
      date,
      title: r.title || r.category,
      amount: r.amount,
      sign: r.type === "income" ? 1 : -1,
      kind: "recurring",
    });
  }

  for (const c of activeCredits(state)) {
    const v = creditView(c);
    if (!v.nextPaymentDate) continue;
    if (monthKeyFromISO(v.nextPaymentDate) !== currentMonth) continue;
    if (v.nextPaymentDate < today) continue; // просрочка — это в напоминаниях
    res.push({
      key: `c-${c.id}`,
      date: v.nextPaymentDate,
      title: `Платёж по «${c.name}»`,
      amount: v.nextPaymentAmount,
      sign: -1,
      kind: "credit",
    });
  }

  return res.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ===== Подписки =====

// id операции-оплаты подписки за месяц (детерминированный, как у регулярных)
export function subscriptionOpId(ruleId: string, month: string): string {
  return `rec-${ruleId}-${month}`;
}

// Активные подписки (включённые)
export function subscriptionRules(state: AppState): RecurringRule[] {
  return (state.recurring ?? []).filter(
    (r) => !r.deleted && r.kind === "subscription"
  );
}
export function activeSubscriptions(state: AppState): RecurringRule[] {
  return subscriptionRules(state).filter((r) => r.active !== false);
}

// Сумма подписок в месяц и в год (по включённым)
export function subscriptionsMonthlyTotal(state: AppState): number {
  return activeSubscriptions(state).reduce((s, r) => s + r.amount, 0);
}

// Оплачена ли подписка в этом месяце (есть операция с детерминированным id)
export function isSubscriptionPaid(
  state: AppState,
  ruleId: string,
  month: string
): boolean {
  const id = subscriptionOpId(ruleId, month);
  return state.operations.some((o) => o.id === id && !o.deleted);
}

// Фактически потрачено на подписки за месяц (по операциям с recurringId подписок)
export function subscriptionSpent(state: AppState, month: string): number {
  const ids = new Set(subscriptionRules(state).map((r) => r.id));
  return state.operations
    .filter(
      (o) =>
        !o.deleted &&
        o.recurringId &&
        ids.has(o.recurringId) &&
        monthKeyFromISO(o.date) === month
    )
    .reduce((s, o) => s + o.amount, 0);
}

export interface SubscriptionStatus {
  rule: RecurringRule;
  date: string; // запланированная дата в этом месяце
  paid: boolean;
  due: boolean; // дата наступила и не оплачено
  upcoming: boolean; // ещё впереди в этом месяце
}

export function subscriptionStatuses(
  state: AppState,
  month: string,
  today: string
): SubscriptionStatus[] {
  return activeSubscriptions(state).map((r) => {
    const day = Math.min(Math.max(1, r.dayOfMonth || 1), lastDayOfMonth(month));
    const date = `${month}-${pad2(day)}`;
    const paid = isSubscriptionPaid(state, r.id, month);
    return {
      rule: r,
      date,
      paid,
      due: !paid && date <= today,
      upcoming: !paid && date > today,
    };
  });
}

// ----- Автоопределение подписок из истории трат -----
export interface SubSuggestion {
  category: string;
  note: string;
  amount: number;
  dayOfMonth: number;
  months: number; // в скольких месяцах встречалось
}

function mostCommon(nums: number[]): { value: number; count: number } {
  const m = new Map<number, number>();
  for (const n of nums) m.set(n, (m.get(n) ?? 0) + 1);
  let best = nums[0] ?? 0;
  let count = 0;
  for (const [v, c] of m) if (c > count) { best = v; count = c; }
  return { value: best, count };
}

// Похожие на подписки траты: одинаковая сумма повторяется в ≥2 месяцах,
// исключая уже заведённые подписки и операции от правил.
export function suggestSubscriptions(state: AppState): SubSuggestion[] {
  const existingSig = new Set(
    subscriptionRules(state).map(
      (r) => `${r.category}|${(r.note || r.title || "").trim().toLowerCase()}`
    )
  );

  const groups = new Map<
    string,
    { category: string; note: string; amounts: number[]; days: number[]; months: Set<string> }
  >();

  for (const o of state.operations) {
    if (o.deleted || o.recurringId) continue;
    if (o.type !== "expense_personal" && o.type !== "expense_work") continue;
    const note = (o.note || "").trim();
    const key = `${o.category}|${note.toLowerCase()}`;
    const g =
      groups.get(key) ??
      { category: o.category, note, amounts: [], days: [], months: new Set<string>() };
    g.amounts.push(o.amount);
    g.days.push(Number(o.date.slice(8, 10)));
    g.months.add(monthKeyFromISO(o.date));
    groups.set(key, g);
  }

  const res: SubSuggestion[] = [];
  for (const g of groups.values()) {
    if (g.months.size < 2) continue;
    const amount = mostCommon(g.amounts);
    if (amount.count < 2) continue; // одинаковая сумма должна повторяться
    const sig = `${g.category}|${g.note.toLowerCase()}`;
    if (existingSig.has(sig)) continue;
    res.push({
      category: g.category,
      note: g.note,
      amount: amount.value,
      dayOfMonth: mostCommon(g.days).value || 1,
      months: g.months.size,
    });
  }
  return res.sort((a, b) => b.months - a.months || b.amount - a.amount);
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
  const creditDelta = (state.credits ?? [])
    .filter((c) => !c.deleted)
    .reduce((sum, c) => sum + creditAccountDelta(c, accountId), 0);
  return acc.baseBalance + opDelta + debtDelta + creditDelta;
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

export interface AccountFlow {
  income: number; // пришло на счёт за месяц
  expense: number; // ушло со счёта за месяц
  net: number;
}

// Обороты по счёту за месяц (по операциям)
export function accountMonthFlow(
  state: AppState,
  accountId: string,
  mKey: string
): AccountFlow {
  let income = 0;
  let expense = 0;
  for (const o of state.operations) {
    if (o.deleted || o.accountId !== accountId) continue;
    if (monthKeyFromISO(o.date) !== mKey) continue;
    const d = operationDelta(o);
    if (d >= 0) income += d;
    else expense += -d;
  }
  return { income, expense, net: income - expense };
}

// Расход по конкретной категории за месяц
export function categoryExpense(
  state: AppState,
  category: string,
  month: string
): number {
  let sum = 0;
  for (const o of state.operations) {
    if (o.deleted) continue;
    if (o.type !== "expense_personal" && o.type !== "expense_work") continue;
    if (o.category !== category) continue;
    if (monthKeyFromISO(o.date) !== month) continue;
    sum += o.amount;
  }
  return sum;
}

// Бюджет категории за месяц с учётом переноса остатка за один месяц.
export interface CategoryBudget {
  base: number; // базовый лимит
  carry: number; // перенос с прошлого месяца (+остаток / −перерасход)
  effective: number; // доступно в этом месяце = base + carry
  spent: number; // потрачено в этом месяце
  remaining: number; // осталось = effective − spent
  rollover: boolean; // перенос включён для этой категории
}
export function categoryBudget(
  state: AppState,
  category: string,
  month: string
): CategoryBudget {
  const base = state.budgets?.[category] ?? 0;
  const spent = categoryExpense(state, category, month);
  const rollover = !!state.budgetRollover && base > 0;
  const carry = rollover
    ? base - categoryExpense(state, category, shiftMonth(month, -1))
    : 0;
  const effective = base + carry;
  return { base, carry, effective, spent, remaining: effective - spent, rollover };
}

// Темп расходов за месяц: средний в день и прогноз на конец месяца (run-rate).
export interface ExpensePace {
  daysElapsed: number;
  daysInMonth: number;
  avgDaily: number;
  projected: number; // прогноз расхода на конец месяца
}
export function expensePace(
  state: AppState,
  month: string,
  today: string
): ExpensePace {
  const daysInMonth = lastDayOfMonth(month);
  const isCurrent = monthKeyFromISO(today) === month;
  const daysElapsed = isCurrent
    ? Math.min(daysInMonth, Number(today.slice(8, 10)))
    : daysInMonth;
  const expense = monthSummary(state, month).expense;
  const avgDaily = expense / Math.max(1, daysElapsed);
  return {
    daysElapsed,
    daysInMonth,
    avgDaily: Math.round(avgDaily),
    projected: isCurrent ? Math.round(avgDaily * daysInMonth) : expense,
  };
}

// Динамика чистого оборота по счёту за n месяцев, заканчивая endMonth (старые → новые)
export function accountTrend(
  state: AppState,
  accountId: string,
  endMonth: string,
  n = 6
): { month: string; net: number }[] {
  const res: { month: string; net: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = shiftMonth(endMonth, -i);
    res.push({ month: m, net: accountMonthFlow(state, accountId, m).net });
  }
  return res;
}

export interface CreditInfo {
  totalDue: number; // всего к выплате
  overpay: number; // переплата
  paid: number; // выплачено
  remaining: number; // осталось выплатить
  nextPaymentDate: string | null;
  nextPaymentAmount: number;
}

// Активные кредиты (без надгробий)
export function activeCredits(state: AppState): Credit[] {
  return (state.credits ?? []).filter((c) => !c.deleted);
}

export interface CreditView {
  credit: Credit;
  totalDue: number; // payment * count
  paid: number; // сумма внесённых платежей
  remaining: number; // осталось (не уходит в минус)
  overpay: number; // переплата (totalDue − received)
  paidCount: number; // сколько платежей внесено (для «X из N»)
  nextPaymentDate: string | null; // следующая дата по расписанию
  nextPaymentAmount: number;
  isPaidOff: boolean;
}

// Расчёты по одному кредиту
export function creditView(c: Credit): CreditView {
  const totalDue = c.payment * c.count;
  const paid = c.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, totalDue - paid);
  const paidCount = Math.min(c.count, c.payments.length);
  const isPaidOff = remaining <= 0 || paidCount >= c.count;
  const nextPaymentDate = isPaidOff ? null : c.paymentDates[paidCount] ?? null;
  return {
    credit: c,
    totalDue,
    paid,
    remaining,
    overpay: totalDue - c.received,
    paidCount,
    nextPaymentDate,
    nextPaymentAmount: c.payment,
    isPaidOff,
  };
}

export function creditViews(state: AppState): CreditView[] {
  return activeCredits(state).map(creditView);
}

// Кредиты: агрегат по всем активным (для «Сводки» и реальной позиции)
export function creditInfo(state: AppState): CreditInfo {
  let totalDue = 0;
  let paid = 0;
  let overpay = 0;
  let next: { date: string; amount: number } | null = null;

  for (const v of creditViews(state)) {
    totalDue += v.totalDue;
    paid += v.paid;
    overpay += v.overpay;
    if (v.nextPaymentDate && (!next || v.nextPaymentDate < next.date)) {
      next = { date: v.nextPaymentDate, amount: v.nextPaymentAmount };
    }
  }

  return {
    totalDue,
    overpay,
    paid,
    remaining: Math.max(0, totalDue - paid),
    nextPaymentDate: next?.date ?? null,
    nextPaymentAmount: next?.amount ?? 0,
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
