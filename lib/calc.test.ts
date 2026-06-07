// Тесты денежных расчётов. Запуск: npm test
// Без фреймворка — простой набор проверок, падает с кодом 1 при ошибке.
import {
  operationDelta,
  debtAccountDelta,
  creditAccountDelta,
  currentBalance,
  totalOnHand,
  monthSummary,
  creditInfo,
  creditView,
  debtOutstanding,
  debtPaidTotal,
  isDebtSettled,
  debtsSummary,
  realPosition,
  dueRecurringOperations,
  upcomingThisMonth,
  accountMonthFlow,
  accountTrend,
  subscriptionsMonthlyTotal,
  isSubscriptionPaid,
  subscriptionStatuses,
  suggestSubscriptions,
  expensePace,
  categoryBudget,
} from "./calc";
import { AppState, Operation, Debt, Credit, RecurringRule } from "./types";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`✗ ${msg}\n    ожидалось: ${e}\n    получено:  ${a}`);
  }
}

// ---- помощники для фикстур ----
let n = 0;
function op(p: Partial<Operation>): Operation {
  return {
    id: `o${n++}`,
    date: "2026-05-10",
    type: "expense_personal",
    category: "Продукты / еда / вода",
    amount: 0,
    accountId: "sber",
    note: "",
    ...p,
  };
}
function debt(p: Partial<Debt>): Debt {
  return {
    id: `d${n++}`,
    direction: "owed_to_me",
    person: "Кто-то",
    amount: 0,
    date: "2026-05-01",
    accountId: "sber",
    note: "",
    payments: [],
    ...p,
  };
}
function state(p: Partial<AppState>): AppState {
  return {
    accounts: [
      { id: "yandex", name: "Яндекс", baseBalance: 10000 },
      { id: "sber", name: "Сбер", baseBalance: 5000 },
      { id: "tinkoff", name: "Т-Банк", baseBalance: 0 },
    ],
    operations: [],
    credits: [],
    goal: { name: "", target: 0, saved: 0 },
    debts: [],
    updatedAt: 0,
    ...p,
  };
}

function credit(p: Partial<Credit>): Credit {
  return {
    id: `c${n++}`,
    name: "Кредит",
    received: 0,
    receivedDate: "2026-01-01",
    payment: 0,
    count: 0,
    paymentDates: [],
    accountId: "yandex",
    payments: [],
    ...p,
  };
}

// ---- operationDelta ----
eq(operationDelta(op({ type: "income", category: "Прочий доход", amount: 100 })), 100, "доход +");
eq(operationDelta(op({ type: "expense_personal", amount: 100 })), -100, "расход личный −");
eq(operationDelta(op({ type: "expense_work", amount: 100 })), -100, "расход рабочий −");
eq(operationDelta(op({ type: "credit_loan", category: "Получен кредит", amount: 100 })), 100, "получен кредит +");
eq(operationDelta(op({ type: "credit_loan", category: "Платёж по кредиту", amount: 100 })), -100, "платёж по кредиту −");

// ---- debtAccountDelta ----
const dGive = debt({ direction: "owed_to_me", accountId: "sber", amount: 1500 });
eq(debtAccountDelta(dGive, "sber"), -1500, "дал в долг: со счёта ушло");
eq(debtAccountDelta(dGive, "yandex"), 0, "чужой счёт не задет");
const dGivePaid = debt({
  direction: "owed_to_me",
  accountId: "sber",
  amount: 1500,
  payments: [{ id: "p1", date: "2026-05-20", amount: 500, accountId: "yandex" }],
});
eq(debtAccountDelta(dGivePaid, "yandex"), 500, "возврат пришёл на другой счёт");
eq(debtAccountDelta(dGivePaid, "sber"), -1500, "исходный счёт остаётся в минусе до возврата на него");
const dOwe = debt({ direction: "i_owe", accountId: "tinkoff", amount: 2000 });
eq(debtAccountDelta(dOwe, "tinkoff"), 2000, "взял в долг: на счёт пришло");

// ---- debtOutstanding / paid / settled ----
eq(debtOutstanding(dGivePaid), 1000, "остаток долга 1500−500");
eq(debtPaidTotal(dGivePaid), 500, "возвращено 500");
eq(isDebtSettled(dGivePaid), false, "ещё не погашен");
const dOver = debt({ amount: 1000, payments: [{ id: "p", date: "2026-05-02", amount: 1200, accountId: "sber" }] });
eq(debtOutstanding(dOver), 0, "переплата не уходит в минус");
eq(isDebtSettled(dOver), true, "переплата = погашен");

// ---- currentBalance / totalOnHand ----
const s1 = state({
  operations: [
    op({ type: "income", category: "Прочий доход", amount: 2000, accountId: "sber" }),
    op({ type: "expense_personal", amount: 700, accountId: "sber" }),
    op({ type: "expense_personal", amount: 999, accountId: "sber", deleted: true }), // удалённая — игнор
  ],
  debts: [debt({ direction: "owed_to_me", accountId: "sber", amount: 1500 })],
});
eq(currentBalance(s1, "sber"), 5000 + 2000 - 700 - 1500, "баланс Сбера с учётом долга и без удалённой");
eq(currentBalance(s1, "yandex"), 10000, "Яндекс без операций = база");
eq(currentBalance(s1, "missing"), 0, "несуществующий счёт = 0");
eq(totalOnHand(s1), 10000 + (5000 + 2000 - 700 - 1500) + 0, "на руках = сумма счетов");

// ---- debtsSummary (удалённые игнорируются) ----
const s2 = state({
  debts: [
    debt({ direction: "owed_to_me", amount: 1500 }),
    debt({ direction: "owed_to_me", amount: 500, payments: [{ id: "p", date: "2026-05-03", amount: 200, accountId: "sber" }] }),
    debt({ direction: "i_owe", amount: 800 }),
    debt({ direction: "i_owe", amount: 9999, deleted: true }),
  ],
});
eq(debtsSummary(s2), { owedToMe: 1800, iOwe: 800, net: 1000 }, "сводка долгов");

// ---- monthSummary (кредиты/займы и другие месяцы не входят) ----
const s3 = state({
  operations: [
    op({ type: "income", category: "Прочий доход", amount: 3000, date: "2026-05-05" }),
    op({ type: "expense_personal", amount: 1000, date: "2026-05-06" }),
    op({ type: "credit_loan", category: "Получен кредит", amount: 50000, date: "2026-05-07" }),
    op({ type: "expense_personal", amount: 4444, date: "2026-04-30" }), // другой месяц
  ],
});
eq(monthSummary(s3, "2026-05"), { income: 3000, expense: 1000, diff: 2000 }, "итоги мая");
eq(monthSummary(s3, "2026-04"), { income: 0, expense: 4444, diff: -4444 }, "итоги апреля");

// ---- creditView (один кредит: остаток, X из N, следующая дата) ----
const c1 = credit({
  received: 45000,
  payment: 5000,
  count: 10,
  paymentDates: ["2026-02-01", "2026-03-01", "2026-04-01"],
  payments: [{ id: "p1", date: "2026-02-01", amount: 5000, accountId: "yandex" }],
});
const cv = creditView(c1);
eq([cv.totalDue, cv.paid, cv.remaining, cv.overpay], [50000, 5000, 45000, 5000], "кредит: всего/выплачено/остаток/переплата");
eq([cv.paidCount, cv.nextPaymentDate], [1, "2026-03-01"], "1 из 10, следующая дата");
const cPaidOff = credit({ payment: 1000, count: 2, payments: [
  { id: "a", date: "2026-01-01", amount: 1000, accountId: "yandex" },
  { id: "b", date: "2026-02-01", amount: 1000, accountId: "yandex" },
] });
eq([creditView(cPaidOff).remaining, creditView(cPaidOff).isPaidOff, creditView(cPaidOff).nextPaymentDate], [0, true, null], "погашенный кредит");

// ---- creditAccountDelta (платёж списывает со счёта) ----
eq(creditAccountDelta(c1, "yandex"), -5000, "платёж по кредиту списан с Яндекса");
eq(creditAccountDelta(c1, "sber"), 0, "чужой счёт не задет");

// ---- creditInfo (агрегат по нескольким кредитам) ----
const s4 = state({
  credits: [
    credit({ received: 45000, payment: 5000, count: 10, paymentDates: ["2026-03-01"], payments: [{ id: "p", date: "2026-02-01", amount: 5000, accountId: "yandex" }] }),
    credit({ received: 4000, payment: 1500, count: 3, paymentDates: ["2026-02-15"], payments: [] }),
    credit({ payment: 9999, count: 9, deleted: true }), // надгробие — игнор
  ],
});
const ci = creditInfo(s4);
// totalDue = 50000 + 4500 = 54500; paid = 5000; remaining = 49500; overpay = 5000 + 500
eq([ci.totalDue, ci.paid, ci.remaining, ci.overpay], [54500, 5000, 49500, 5500], "агрегат кредитов");
eq(ci.nextPaymentDate, "2026-02-15", "ближайший платёж — самая ранняя дата");

// ---- realPosition (полный сценарий: кредит + долг) ----
const s5 = state({
  credits: [credit({ received: 45000, payment: 5000, count: 10, accountId: "yandex", paymentDates: ["2026-02-01"], payments: [{ id: "p", date: "2026-02-01", amount: 5000, accountId: "yandex" }] })],
  debts: [debt({ direction: "owed_to_me", accountId: "sber", amount: 1500 })],
});
// на руках: (10000 − 5000 платёж) + (5000 − 1500 долг) + 0 = 8500
// реальная = 8500 − 45000(остаток кредита) + 1500(вернут) − 0
eq(totalOnHand(s5), 8500, "на руках в сценарии с кредитом");
eq(realPosition(s5), 8500 - 45000 + 1500, "реальная позиция");

// ---- dueRecurringOperations ----
function rule(p: Partial<RecurringRule>): RecurringRule {
  return {
    id: "r1",
    title: "Аренда",
    type: "expense_personal",
    category: "Остальное / разное",
    amount: 20000,
    accountId: "yandex",
    dayOfMonth: 5,
    startMonth: "2026-04",
    note: "",
    active: true,
    ...p,
  };
}
// с апреля по июнь, сегодня 10 июня → апр, май, июнь (5-е уже наступило)
const due1 = dueRecurringOperations([rule({})], new Set(), "2026-06", "2026-06-10");
eq(due1.map((o) => o.id), ["rec-r1-2026-04", "rec-r1-2026-05", "rec-r1-2026-06"], "генерация апр–июн");
eq([due1[0].date, due1[0].amount, due1[0].recurringId], ["2026-04-05", 20000, "r1"], "поля сгенерированной операции");

// если 5-е ещё не наступило в текущем месяце — июнь не создаём
const due2 = dueRecurringOperations([rule({})], new Set(), "2026-06", "2026-06-03");
eq(due2.map((o) => o.id), ["rec-r1-2026-04", "rec-r1-2026-05"], "будущая дата месяца пропускается");

// уже существующие/удалённые id не пересоздаются
const due3 = dueRecurringOperations([rule({})], new Set(["rec-r1-2026-04", "rec-r1-2026-05"]), "2026-06", "2026-06-10");
eq(due3.map((o) => o.id), ["rec-r1-2026-06"], "без дублей по существующим id");

// выключенное/удалённое правило ничего не создаёт
eq(dueRecurringOperations([rule({ active: false })], new Set(), "2026-06", "2026-06-10").length, 0, "выключенное правило");
eq(dueRecurringOperations([rule({ deleted: true })], new Set(), "2026-06", "2026-06-10").length, 0, "удалённое правило");

// обрезка числа под короткий месяц (31 → 28 февраля)
const dueFeb = dueRecurringOperations([rule({ dayOfMonth: 31, startMonth: "2026-02" })], new Set(), "2026-02", "2026-02-28");
eq(dueFeb[0].date, "2026-02-28", "31-е число обрезано до конца февраля");

// ---- upcomingThisMonth ----
const su = state({
  recurring: [
    rule({ id: "rA", title: "Аренда", dayOfMonth: 25, startMonth: "2026-01", amount: 20000 }),
    rule({ id: "rB", title: "Зарплата", type: "income", category: "Прочий доход", dayOfMonth: 28, startMonth: "2026-01", amount: 50000 }),
    rule({ id: "rPast", dayOfMonth: 3, startMonth: "2026-01", amount: 999 }), // 3-е уже прошло
  ],
  operations: [],
  credits: [credit({ name: "Альфа", payment: 10921, count: 3, paymentDates: ["2026-06-26"], payments: [] })],
});
const up = upcomingThisMonth(su, "2026-06", "2026-06-10");
// порядок по дате: Аренда 25, Платёж 26, Зарплата 28
eq(up.map((u) => u.title), ["Аренда", "Платёж по «Альфа»", "Зарплата"], "предстоящие по дате: 25, 26, 28");
eq(up.map((u) => u.sign), [-1, -1, 1], "знаки: расход, кредит, доход");
// прошедшее 3-е число не входит; нетто = -20000 -10921 +50000
eq(up.reduce((s, u) => s + u.sign * u.amount, 0), 50000 - 20000 - 10921, "нетто предстоящих");
// уже созданная операция этого месяца исключается
const su2 = state({
  recurring: [rule({ id: "rA", dayOfMonth: 25, startMonth: "2026-01" })],
  operations: [op({ id: "rec-rA-2026-06" })],
});
eq(upcomingThisMonth(su2, "2026-06", "2026-06-10").length, 0, "созданная регулярная не предстоит");

// ---- accountMonthFlow ----
const sf = state({
  operations: [
    op({ type: "income", category: "Прочий доход", amount: 5000, accountId: "sber", date: "2026-06-02" }),
    op({ type: "expense_personal", amount: 700, accountId: "sber", date: "2026-06-03" }),
    op({ type: "expense_personal", amount: 300, accountId: "sber", date: "2026-06-04", deleted: true }),
    op({ type: "expense_personal", amount: 1000, accountId: "yandex", date: "2026-06-05" }),
    op({ type: "expense_personal", amount: 999, accountId: "sber", date: "2026-05-30" }), // другой месяц
  ],
});
eq(accountMonthFlow(sf, "sber", "2026-06"), { income: 5000, expense: 700, net: 4300 }, "обороты Сбера за июнь");
eq(accountMonthFlow(sf, "yandex", "2026-06"), { income: 0, expense: 1000, net: -1000 }, "обороты Яндекса за июнь");
eq(accountMonthFlow(sf, "tinkoff", "2026-06"), { income: 0, expense: 0, net: 0 }, "нет оборотов");

// ---- accountTrend ----
const st6 = state({
  operations: [
    op({ type: "income", category: "Прочий доход", amount: 1000, accountId: "sber", date: "2026-04-10" }),
    op({ type: "expense_personal", amount: 400, accountId: "sber", date: "2026-05-10" }),
    op({ type: "income", category: "Прочий доход", amount: 700, accountId: "sber", date: "2026-06-10" }),
  ],
});
const tr = accountTrend(st6, "sber", "2026-06", 6);
eq(tr.map((p) => p.month), ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"], "6 месяцев по порядку");
eq(tr.map((p) => p.net), [0, 0, 0, 1000, -400, 700], "чистый оборот по месяцам");

// ---- подписки ----
const sub = (p: Partial<RecurringRule>) =>
  rule({ kind: "subscription", ...p });

// подписки не списываются автоматически
eq(
  dueRecurringOperations([sub({ id: "s1", startMonth: "2026-04" })], new Set(), "2026-06", "2026-06-10").length,
  0,
  "подписка не авто-списывается"
);

// сумма в месяц по включённым
const ssub = state({
  recurring: [
    sub({ id: "s1", amount: 500, dayOfMonth: 5 }),
    sub({ id: "s2", amount: 1500, dayOfMonth: 20 }),
    sub({ id: "s3", amount: 999, dayOfMonth: 1, active: false }), // выключена
  ],
});
eq(subscriptionsMonthlyTotal(ssub), 2000, "сумма подписок в месяц (без выключенной)");

// статусы: due (5-е прошло, не оплачено), upcoming (20-е впереди)
const st = subscriptionStatuses(ssub, "2026-06", "2026-06-10");
eq([st[0].due, st[0].upcoming, st[0].paid], [true, false, false], "s1 — пора оплатить");
eq([st[1].due, st[1].upcoming, st[1].paid], [false, true, false], "s2 — предстоит");

// оплата фиксируется операцией с детерминированным id
const sPaid = state({
  recurring: [sub({ id: "s1", amount: 500, dayOfMonth: 5 })],
  operations: [op({ id: "rec-s1-2026-06", recurringId: "s1", amount: 500, date: "2026-06-05" })],
});
eq(isSubscriptionPaid(sPaid, "s1", "2026-06"), true, "оплачено в этом месяце");
eq(subscriptionStatuses(sPaid, "2026-06", "2026-06-10")[0].paid, true, "статус оплачено");

// автоопределение: одинаковая сумма в 2 месяцах → предложение
const sSugg = state({
  operations: [
    op({ category: "Мобильный / подписки", amount: 500, date: "2026-05-12", note: "Netflix" }),
    op({ category: "Мобильный / подписки", amount: 500, date: "2026-06-12", note: "Netflix" }),
    op({ category: "Продукты / еда / вода", amount: 700, date: "2026-05-03" }),
    op({ category: "Продукты / еда / вода", amount: 900, date: "2026-06-03" }), // суммы разные → не подписка
  ],
});
const sugg = suggestSubscriptions(sSugg);
eq(sugg.length, 1, "одно предложение");
eq([sugg[0].note, sugg[0].amount, sugg[0].dayOfMonth, sugg[0].months], ["Netflix", 500, 12, 2], "предложение Netflix");

// ---- expensePace ----
const sp = state({
  operations: [
    op({ type: "expense_personal", amount: 3000, date: "2026-06-10" }),
  ],
});
// текущий месяц, сегодня 15 июня: прошло 15 из 30, средний 200/день, прогноз 6000
const pace = expensePace(sp, "2026-06", "2026-06-15");
eq([pace.daysElapsed, pace.daysInMonth, pace.avgDaily, pace.projected], [15, 30, 200, 6000], "темп расходов (текущий месяц)");
// прошлый месяц: прогноз = факт
const pacePast = expensePace(sp, "2026-05", "2026-06-15");
eq(pacePast.projected, 0, "прошлый месяц — прогноз равен факту");

// ---- categoryBudget (перенос за один месяц) ----
const CAT = "Продукты / еда / вода";
const bd = (extra: Partial<AppState>) =>
  state({
    budgets: { [CAT]: 15000 },
    operations: [
      op({ category: CAT, amount: 12000, date: "2026-05-20" }), // прошлый месяц
      op({ category: CAT, amount: 4000, date: "2026-06-10" }), // текущий
    ],
    ...extra,
  });

// без переноса: лимит 15000, потрачено 4000, осталось 11000
const bNo = categoryBudget(bd({ budgetRollover: false }), CAT, "2026-06");
eq([bNo.base, bNo.carry, bNo.effective, bNo.spent, bNo.remaining], [15000, 0, 15000, 4000, 11000], "бюджет без переноса");

// с переносом: остаток мая 3000 → доступно 18000, осталось 14000
const bYes = categoryBudget(bd({ budgetRollover: true }), CAT, "2026-06");
eq([bYes.carry, bYes.effective, bYes.remaining], [3000, 18000, 14000], "перенос остатка +3000");

// перерасход в прошлом месяце уменьшает лимит
const bOver = categoryBudget(
  state({
    budgetRollover: true,
    budgets: { [CAT]: 15000 },
    operations: [
      op({ category: CAT, amount: 17000, date: "2026-05-20" }),
      op({ category: CAT, amount: 1000, date: "2026-06-10" }),
    ],
  }),
  CAT,
  "2026-06"
);
eq([bOver.carry, bOver.effective, bOver.remaining], [-2000, 13000, 12000], "перерасход переносится в минус");

// ---- итог ----
console.log(`\n${passed} проверок пройдено, ${failed} провалено.`);
if (failed > 0) process.exit(1);
