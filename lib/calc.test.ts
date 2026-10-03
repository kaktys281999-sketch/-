// Тесты денежных расчётов. Запуск: npm test
// Без фреймворка — простой набор проверок, падает с кодом 1 при ошибке.
import {
  operationDelta,
  operationAccountDelta,
  debtAccountDelta,
  creditAccountDelta,
  transferAccountDelta,
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
  paymentCalendar,
  accountMonthFlow,
  accountTrend,
  subscriptionsMonthlyTotal,
  isSubscriptionPaid,
  subscriptionStatuses,
  subscriptionsDue,
  suggestSubscriptions,
  expensePace,
  categoryBudget,
  notesBreakdown,
  categoryNotesBreakdown,
  creditCardDebt,
  creditCardDueDate,
  nextCreditCardDueDate,
  creditCardLimit,
  creditCardAvailable,
  creditCardDebtTotal,
  creditCardOverpay,
  restoreRecurringIds,
  creditCardCurrentCycle,
  creditCardCycleForMonth,
  creditCardCycleNeedsPayment,
  accountBalanceAt,
  reconcileAccount,
  accountWithoutReconciliation,
  accountsNeedingReconciliation,
} from "./calc";
import { mergeStates, pull, push, toPayload, fromPayload, canonicalJson } from "./sync";
import { freshDraft, pickToAccount, findRecentDuplicate } from "./draft";
import { ensureAlfaAccounts } from "./accounts";
import { AppState, Operation, Debt, Credit, RecurringRule, Transfer } from "./types";

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

function transfer(p: Partial<Transfer>): Transfer {
  return {
    id: `t${n++}`,
    date: "2026-05-10",
    amount: 0,
    fromAccountId: "sber",
    toAccountId: "yandex",
    note: "",
    ...p,
  };
}

// ---- operationDelta ----
eq(operationDelta(op({ type: "income", category: "Прочий доход", amount: 100 })), 100, "доход +");
eq(operationDelta(op({ type: "expense_personal", amount: 100 })), -100, "расход личный −");
eq(operationDelta(op({ type: "expense_personal", category: "Рестораны и кафе", amount: 100 })), -100, "Рестораны и кафе — расход −");
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

const onHandRegularOps = state({
  operations: [
    op({ type: "income", category: "Прочий доход", amount: 1200, accountId: "sber" }),
    op({ type: "expense_personal", amount: 450, accountId: "sber" }),
    op({ type: "expense_work", category: "Profi", amount: 300, accountId: "yandex" }),
  ],
});
eq(
  totalOnHand(onHandRegularOps),
  10000 - 300 + 5000 + 1200 - 450,
  "обычные операции меняют «на руках»"
);

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

// частичные платежи не отмечают кредит погашенным (баг из аудита)
const cPartial = credit({ payment: 1000, count: 3, payments: [
  { id: "a", date: "2026-01-01", amount: 500, accountId: "yandex" },
  { id: "b", date: "2026-02-01", amount: 500, accountId: "yandex" },
  { id: "c", date: "2026-03-01", amount: 500, accountId: "yandex" },
] });
const cvPartial = creditView(cPartial);
eq([cvPartial.remaining, cvPartial.isPaidOff, cvPartial.paidCount], [1500, false, 1], "частичные платежи: не погашен, 1 из 3 по сумме");

// ---- creditAccountDelta (платёж списывает со счёта) ----
eq(creditAccountDelta(c1, "yandex"), -5000, "платёж по кредиту списан с Яндекса");
eq(creditAccountDelta(c1, "sber"), 0, "чужой счёт не задет");
const cReceived = credit({
  received: 30000,
  accountId: "sber",
  receivedAffectsBalance: true,
  payments: [{ id: "p", date: "2026-01-02", amount: 1000, accountId: "sber" }],
});
eq(creditAccountDelta(cReceived, "sber"), 29000, "новый кредит: тело начислено, платёж списан");
const cOldReceived = credit({ received: 30000, accountId: "sber" });
eq(creditAccountDelta(cOldReceived, "sber"), 0, "старый кредит без флага не начисляет тело повторно");

// ---- transferAccountDelta ----
const trPayCard = transfer({
  amount: 4000,
  fromAccountId: "sber",
  toAccountId: "card",
});
eq(transferAccountDelta(trPayCard, "sber"), -4000, "перевод: источник уменьшается");
eq(transferAccountDelta(trPayCard, "card"), 4000, "перевод: получатель увеличивается");
eq(transferAccountDelta(trPayCard, "yandex"), 0, "перевод: чужой счёт не задет");
eq(
  operationAccountDelta(
    op({
      type: "transfer",
      accountId: "sber",
      toAccountId: "sber",
      amount: 4000,
      category: "",
    }),
    "sber"
  ),
  0,
  "операция-самоперевод не влияет на баланс"
);

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

// ---- paymentCalendar ----
const paymentsCalendarState = state({
  accounts: [
    { id: "yandex", name: "Яндекс", baseBalance: 10000 },
    {
      id: "card",
      name: "Сплит",
      baseBalance: -5500,
      kind: "credit_card",
      creditPaymentDay: 2,
    },
  ],
  recurring: [
    rule({ id: "sub1", kind: "subscription", title: "Музыка", amount: 500, dayOfMonth: 5, startMonth: "2026-01" }),
    rule({ id: "subPaid", kind: "subscription", title: "Облако", amount: 700, dayOfMonth: 6, startMonth: "2026-01" }),
    rule({ id: "rent", title: "Аренда", amount: 20000, dayOfMonth: 10, startMonth: "2026-01" }),
    rule({ id: "salary", title: "Зарплата", type: "income", category: "Прочий доход", amount: 50000, dayOfMonth: 20, startMonth: "2026-01" }),
    rule({ id: "move", title: "Переложить", type: "transfer", category: "", amount: 1000, dayOfMonth: 22, startMonth: "2026-01" }),
  ],
  operations: [op({ id: "rec-subPaid-2026-08", recurringId: "subPaid", amount: 700, date: "2026-08-06" })],
  credits: [
    credit({
      id: "creditA",
      name: "Альфа",
      payment: 1000,
      count: 2,
      paymentDates: ["2026-08-15", "2026-09-15"],
      payments: [{ id: "cp1", date: "2026-08-01", amount: 300, accountId: "yandex" }],
    }),
  ],
  debts: [
    debt({ id: "owe1", direction: "i_owe", person: "Боря", amount: 3000, dueDate: "2026-08-20" }),
    debt({ id: "me1", direction: "owed_to_me", person: "Ира", amount: 2000, dueDate: "2026-08-21" }),
  ],
});
const payCal = paymentCalendar(paymentsCalendarState, "2026-08", "2026-07-09");
eq(
  payCal.map((p) => [p.date, p.kind, p.title, p.amount, Boolean(p.paid), Boolean(p.manualAmount)]),
  [
    ["2026-08-02", "credit_card", "Оплата кредитки «Сплит»", 5500, false, true],
    ["2026-08-05", "subscription", "Подписка «Музыка»", 500, false, false],
    ["2026-08-06", "subscription", "Подписка «Облако»", 700, true, false],
    ["2026-08-10", "recurring", "Аренда", 20000, false, false],
    ["2026-08-15", "credit", "Платёж по «Альфа»", 700, false, false],
    ["2026-08-20", "debt", "Долг «Боря»", 3000, false, false],
  ],
  "календарь оплат собирает обязательства месяца"
);
// Неоплаченный срок кредитки (2 июля) не пропадает на следующий день:
// висит просроченным, пока не закроется окно платежа (срок + 10 дней).
eq(
  paymentCalendar(paymentsCalendarState, "2026-07", "2026-07-09")
    .filter((p) => p.kind === "credit_card")
    .map((p) => [p.date, Boolean(p.paid)]),
  [["2026-07-02", false]],
  "просроченная неоплаченная кредитка остаётся в календаре"
);
eq(
  paymentCalendar(paymentsCalendarState, "2026-07", "2026-07-25").some(
    (p) => p.kind === "credit_card"
  ),
  true,
  "неоплаченный срок висит до самого напоминания о следующем"
);
eq(
  paymentCalendar(paymentsCalendarState, "2026-07", "2026-07-26").some(
    (p) => p.kind === "credit_card"
  ),
  false,
  "с открытием напоминания о следующем сроке (за 7 дней) старый уходит"
);

// ---- accountMonthFlow ----
const sf = state({
  operations: [
    op({ type: "income", category: "Прочий доход", amount: 5000, accountId: "sber", date: "2026-06-02" }),
    op({ type: "expense_personal", amount: 700, accountId: "sber", date: "2026-06-03" }),
    op({ type: "expense_personal", amount: 300, accountId: "sber", date: "2026-06-04", deleted: true }),
    op({ type: "expense_personal", amount: 1000, accountId: "yandex", date: "2026-06-05" }),
    op({ type: "expense_personal", amount: 999, accountId: "sber", date: "2026-05-30" }), // другой месяц
  ],
  transfers: [
    transfer({ amount: 3000, fromAccountId: "sber", toAccountId: "yandex", date: "2026-06-07" }),
  ],
});
eq(accountMonthFlow(sf, "sber", "2026-06"), { income: 5000, expense: 3700, net: 1300 }, "обороты Сбера за июнь с переводом");
eq(accountMonthFlow(sf, "yandex", "2026-06"), { income: 3000, expense: 1000, net: 2000 }, "обороты Яндекса за июнь с переводом");
eq(accountMonthFlow(sf, "tinkoff", "2026-06"), { income: 0, expense: 0, net: 0 }, "нет оборотов");

// ---- credit card account ----
const sCard = state({
  accounts: [
    { id: "sber", name: "Сбер", baseBalance: 10000 },
    { id: "card", name: "Кредитка", baseBalance: 0, kind: "credit_card", creditPaymentDay: 31, creditLimit: 10000 },
  ],
  operations: [
    op({ accountId: "card", amount: 2500, date: "2026-06-05" }),
  ],
  transfers: [
    transfer({ amount: 1000, fromAccountId: "sber", toAccountId: "card", date: "2026-06-10" }),
  ],
});
eq(currentBalance(sCard, "card"), -1500, "кредитка: трата увеличила долг, перевод уменьшил");
eq(creditCardDebt(sCard, "card"), 1500, "долг по кредитке = отрицательный баланс по модулю");
eq(creditCardLimit(sCard.accounts[1]), 10000, "кредитка: лимит хранится отдельно");
eq(creditCardAvailable(sCard, "card"), 8500, "кредитка: доступно = лимит − долг");
eq(creditCardDebtTotal(sCard), 1500, "кредитка: общий долг по кредиткам");
eq(totalOnHand(sCard), 9000, "кредитка: на руках считаются только обычные счета");
eq(realPosition(sCard), 7500, "кредитка: реальная позиция учитывает долг по карте");
eq(
  totalOnHand(
    state({
      accounts: [
        { id: "sber", name: "Сбер", baseBalance: 10000 },
        { id: "card", name: "Кредитка", baseBalance: 0, kind: "credit_card", creditLimit: 10000 },
      ],
      operations: [op({ accountId: "card", amount: 2500 })],
    })
  ),
  10000,
  "трата с кредитки не меняет «на руках», меняет долг по карте"
);
eq(creditCardDueDate(sCard.accounts[1], "2026-02"), "2026-02-28", "день оплаты кредитки обрезается под месяц");
eq(
  nextCreditCardDueDate(
    { ...sCard.accounts[1], creditPaymentDay: 2 },
    "2026-07-04"
  ),
  "2026-08-02",
  "кредитка: прошедшее число оплаты переносится на следующий месяц"
);
eq(
  nextCreditCardDueDate(
    { ...sCard.accounts[1], creditPaymentDay: 2 },
    "2026-08-02"
  ),
  "2026-08-02",
  "кредитка: в день оплаты напоминание остаётся на сегодня"
);

const sCardOverLimit = state({
  accounts: [
    { id: "card", name: "Кредитка", baseBalance: -12000, kind: "credit_card", creditLimit: 10000 },
  ],
});
eq(creditCardAvailable(sCardOverLimit, "card"), -2000, "кредитка: доступный лимит может уйти ниже нуля");

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

// ---- mergeStates: счёт, добавленный на «старом» устройстве, не теряется ----
const local = state({
  updatedAt: 100,
  accounts: [
    { id: "yandex", name: "Яндекс", baseBalance: 10000 },
    { id: "cash", name: "Наличные", baseBalance: 500 }, // добавлен локально
  ],
});
const remote = state({
  updatedAt: 200, // «свежее» — выиграет по балансам
  accounts: [
    { id: "yandex", name: "Яндекс", baseBalance: 12345 },
    { id: "newphone", name: "Тинькофф", baseBalance: 700 }, // добавлен на другом
  ],
});
const merged = mergeStates(local, remote);
const mIds = merged.accounts.map((a) => a.id).sort();
eq(mIds, ["cash", "newphone", "yandex"], "слияние счетов объединяет все id");
eq(merged.accounts.find((a) => a.id === "yandex")!.baseBalance, 12345, "по общему счёту выигрывает свежий документ");

const localDeletedAccount = state({
  updatedAt: 300,
  accounts: [{ id: "yandex", name: "Яндекс", baseBalance: 10000 }],
  primaryAccountId: "cash",
  deletedAccountIds: { cash: 300 },
});
const remoteWithOldAccount = state({
  updatedAt: 200,
  accounts: [
    { id: "yandex", name: "Яндекс", baseBalance: 10000 },
    { id: "cash", name: "Наличные", baseBalance: 500 },
  ],
});
const mergedDeletedAccount = mergeStates(localDeletedAccount, remoteWithOldAccount);
eq(
  mergedDeletedAccount.accounts.some((a) => a.id === "cash"),
  false,
  "удалённый счёт не воскресает при слиянии со старым состоянием"
);
eq(
  mergedDeletedAccount.deletedAccountIds?.cash,
  300,
  "надгробие удалённого счёта сохраняется при слиянии"
);
eq(
  mergedDeletedAccount.primaryAccountId,
  "yandex",
  "основной счёт после слияния не указывает на удалённый id"
);

// ---- статистика по заметкам (Пятёрочка/Пятерочка группируются) ----
const sNotes = state({
  operations: [
    op({ category: "Продукты / еда / вода", amount: 1000, date: "2026-06-02", note: "Пятёрочка" }),
    op({ category: "Продукты / еда / вода", amount: 1500, date: "2026-06-10", note: "Пятерочка" }), // е вместо ё
    op({ category: "Продукты / еда / вода", amount: 800, date: "2026-06-12", note: "Магнит" }),
    op({ category: "Продукты / еда / вода", amount: 300, date: "2026-06-15", note: "" }), // без заметки
    op({ type: "income", category: "Прочий доход", amount: 9999, date: "2026-06-03", note: "Пятёрочка" }), // доход не считаем
  ],
});
const nb = notesBreakdown(sNotes, "2026-06");
eq([nb[0].label, nb[0].total, nb[0].count], ["Пятёрочка", 2500, 2], "Пятёрочка: ё/е сгруппированы, 2500");
eq(nb.map((n) => n.label), ["Пятёрочка", "Магнит"], "топ мест без пустых заметок");
const cnb = categoryNotesBreakdown(sNotes, "Продукты / еда / вода", "2026-06");
eq(cnb.find((n) => n.label === "(без заметки)")?.total, 300, "категория: бакет «без заметки»");
eq(cnb.reduce((s, n) => s + n.total, 0), 3600, "сумма по заметкам = расход категории");

// ---- интеграционные инварианты на «богатом» состоянии ----
const rich = state({
  accounts: [
    { id: "yandex", name: "Я", baseBalance: 10000 },
    { id: "sber", name: "С", baseBalance: 5000 },
    { id: "cash", name: "Наличные", baseBalance: 0 },
    { id: "card", name: "Кредитка", baseBalance: -3000, kind: "credit_card", creditLimit: 10000 },
  ],
  operations: [
    op({ type: "income", category: "Прочий доход", amount: 50000, accountId: "yandex", date: "2026-06-02" }),
    op({ type: "expense_personal", amount: 4000, accountId: "yandex", date: "2026-06-03" }),
    op({ type: "expense_work", category: "Profi", amount: 2000, accountId: "sber", date: "2026-06-05" }),
    op({ amount: 999, accountId: "cash", date: "2026-06-06", deleted: true }),
  ],
  credits: [credit({ payment: 10921, count: 3, accountId: "yandex", payments: [{ id: "p", date: "2026-06-26", amount: 10921, accountId: "yandex" }] })],
  debts: [
    debt({ direction: "owed_to_me", accountId: "sber", amount: 1500, payments: [{ id: "x", date: "2026-05-20", amount: 500, accountId: "yandex" }] }),
    debt({ direction: "i_owe", accountId: "cash", amount: 2000 }),
  ],
});
const regularBal = rich.accounts
  .filter((a) => a.kind !== "credit_card")
  .reduce((s, a) => s + currentBalance(rich, a.id), 0);
eq(Math.round(regularBal), Math.round(totalOnHand(rich)), "инвариант: на руках = сумма обычных счетов");
eq(
  Math.round(realPosition(rich)),
  Math.round(
    totalOnHand(rich) -
      creditInfo(rich).remaining -
      creditCardDebtTotal(rich) +
      debtsSummary(rich).owedToMe -
      debtsSummary(rich).iOwe
  ),
  "инвариант: реальная позиция = формула"
);
const noNaN = [
  totalOnHand(rich),
  realPosition(rich),
  ...rich.accounts.map((a) => currentBalance(rich, a.id)),
  creditInfo(rich).remaining,
  expensePace(rich, "2026-06", "2026-06-15").projected,
].every((n) => Number.isFinite(n));
eq(noNaN, true, "инвариант: нет NaN/∞ в ключевых числах");

// ---- float-хвост: погашение не «застревает» из-за 0.1+0.2 ----
const dustDebt = debt({
  direction: "i_owe",
  accountId: "cash",
  amount: 0.9,
  payments: [
    { id: "d1", date: "2026-01-02", amount: 0.3, accountId: "cash" },
    { id: "d2", date: "2026-01-03", amount: 0.3, accountId: "cash" },
    { id: "d3", date: "2026-01-04", amount: 0.3, accountId: "cash" },
  ],
});
eq(debtOutstanding(dustDebt), 0, "долг 0.9 тремя по 0.3 — остаток 0 (без float-хвоста)");
eq(isDebtSettled(dustDebt), true, "долг 0.9 тремя по 0.3 — погашен");
const partialCredit = credit({
  payment: 100,
  count: 3,
  accountId: "yandex",
  payments: [
    { id: "c1", date: "2026-02-01", amount: 0.1, accountId: "yandex" },
    { id: "c2", date: "2026-03-01", amount: 0.2, accountId: "yandex" },
  ],
});
eq(creditView(partialCredit).remaining, 299.7, "остаток кредита округлён до копеек (300 − 0.1 − 0.2)");

// ---- переводы между счетами ----
const transferState = state({
  operations: [
    op({ type: "transfer", accountId: "sber", toAccountId: "tinkoff", amount: 1000, category: "", date: "2026-05-10" }),
  ],
});
eq(currentBalance(transferState, "sber"), 4000, "перевод: со счёта-источника списалось (5000−1000)");
eq(currentBalance(transferState, "tinkoff"), 1000, "перевод: на счёт-получатель пришло (0+1000)");
eq(totalOnHand(transferState), 15000, "перевод: всего на руках не меняется");
eq(monthSummary(transferState, "2026-05").income, 0, "перевод — не доход");
eq(monthSummary(transferState, "2026-05").expense, 0, "перевод — не расход");


// ---- подписки: граница месяца ----
// Найдено 31.08.2026 на живых данных. У подписки хранится только число месяца,
// и пока напоминание перебирало ЛИШЬ текущий месяц, подписка первых чисел не
// могла попасть в окно предупреждения вообще: 31 августа сентябрьский
// экземпляр не создавался нигде. «Квартира» 1-го числа, 22 000 рублей,
// становилась видна ровно в день списания.
// Старые тесты этого не ловили, потому что спрашивали про июнь, стоя в июне.
const kv = (p: Partial<RecurringRule> = {}) =>
  sub({ id: "kv", amount: 22000, dayOfMonth: 1, startMonth: "2026-01", ...p });

// главный случай: август оплачен, стоим 31 августа, сентябрь через день
const sBorder = state({
  recurring: [kv()],
  operations: [
    // Июль закрыт намеренно: перебор смотрит на месяц НАЗАД, и без этой
    // строки тест про границу месяца проверял бы заодно и взгляд назад.
    op({ id: "rec-kv-2026-07", recurringId: "kv", amount: 22000, date: "2026-07-01" }),
    op({ id: "rec-kv-2026-08", recurringId: "kv", amount: 22000, date: "2026-08-01" }),
  ],
});
const dueBorder = subscriptionsDue(sBorder, "2026-08-31", 7);
eq(dueBorder.length, 1, "граница месяца: сентябрьская подписка видна 31 августа");
eq(dueBorder[0]?.date ?? "ничего не вернулось", "2026-09-01", "граница месяца: дата экземпляра сентябрьская");
eq(dueBorder[0]?.month ?? "ничего не вернулось", "2026-09", "граница месяца: оплата уйдёт в сентябрь, не в август");
eq(dueBorder[0]?.overdue ?? "ничего не вернулось", false, "граница месяца: это предстоящее, а не просрочка");

// в середине месяца оплаченная молчит, а следующая ещё далеко
eq(
  subscriptionsDue(sBorder, "2026-08-10", 7).length,
  0,
  "граница месяца: в середине августа тишина, и это правда"
);

// просроченное не исчезает, сколько бы ни прошло, и не вытесняется будущим
const dueBoth = subscriptionsDue(state({
  recurring: [kv()],
  operations: [
    op({ id: "rec-kv-2026-07", recurringId: "kv", amount: 22000, date: "2026-07-01" }),
  ],
}), "2026-08-31", 7);
eq(dueBoth.length, 2, "неоплаченный август и близкий сентябрь показываются ОБА");
eq([dueBoth[0]?.month, dueBoth[0]?.overdue], ["2026-08", true], "август просрочен");
eq([dueBoth[1]?.month, dueBoth[1]?.overdue], ["2026-09", false], "сентябрь предстоит");

// окно соблюдается с обеих сторон
const sWin = state({
  recurring: [sub({ id: "w", amount: 100, dayOfMonth: 8, startMonth: "2026-01" })],
  operations: [
    op({ id: "rec-w-2026-06", recurringId: "w", amount: 100, date: "2026-06-08" }),
    op({ id: "rec-w-2026-07", recurringId: "w", amount: 100, date: "2026-07-08" }),
  ],
});
eq(subscriptionsDue(sWin, "2026-07-31", 7).length, 0, "окно: 8 дней вперёд это уже далеко");
eq(subscriptionsDue(sWin, "2026-08-01", 7).length, 1, "окно: ровно 7 дней вперёд ещё близко");

// короткий месяц не рождает несуществующую дату
const clamp = subscriptionsDue(
  state({
    recurring: [sub({ id: "c", amount: 300, dayOfMonth: 31, startMonth: "2026-01" })],
    operations: [
      op({ id: "rec-c-2026-08", recurringId: "c", amount: 300, date: "2026-08-31" }),
    ],
  }),
  "2026-09-25",
  7
);
eq(clamp.length, 1, "короткий месяц: один экземпляр");
eq(clamp[0]?.date ?? "ничего не вернулось", "2026-09-30", "короткий месяц: 31-е становится 30-м, а не пропадает");

// выключенная и ещё не начавшаяся молчат
eq(
  subscriptionsDue(state({ recurring: [kv({ id: "off", active: false })] }), "2026-08-31", 7).length,
  0,
  "выключенная подписка о себе не напоминает"
);
eq(
  subscriptionsDue(state({ recurring: [kv({ id: "later", startMonth: "2026-10" })] }), "2026-08-31", 7).length,
  0,
  "ещё не начавшаяся подписка о себе не напоминает"
);


// ---- подписки: взгляд назад ----
// Найдено самопроверкой 02.09.2026. Перебирались только текущий месяц и
// следующий, поэтому пропущенный платёж ПРОШЛОГО месяца исчезал навсегда:
// свежий месяц оплачен, прошлый нет, и сводка молчала. Комментарий при этом
// обещал, что просроченное отдаётся всегда.
const kvLB = (p: Partial<RecurringRule> = {}) =>
  sub({ id: "lb", amount: 1000, dayOfMonth: 21, startMonth: "2026-01", ...p });

// текущий месяц ОПЛАЧЕН, прошлый нет
const sMissed = state({
  recurring: [kvLB()],
  operations: [
    op({ id: "rec-lb-2026-09", recurringId: "lb", amount: 1000, date: "2026-09-21" }),
  ],
});
const lb = subscriptionsDue(sMissed, "2026-09-25", 7);
eq(lb.length, 1, "пропуск прошлого месяца виден, хотя текущий оплачен");
eq(lb[0]?.month ?? "ничего не вернулось", "2026-08", "и это именно прошлый месяц");
eq(lb[0]?.overdue ?? "ничего не вернулось", true, "помечен просроченным");

// оба оплачены — тишина
const sBothPaid = state({
  recurring: [kvLB()],
  operations: [
    op({ id: "rec-lb-2026-08", recurringId: "lb", amount: 1000, date: "2026-08-21" }),
    op({ id: "rec-lb-2026-09", recurringId: "lb", amount: 1000, date: "2026-09-21" }),
  ],
});
eq(subscriptionsDue(sBothPaid, "2026-09-25", 7).length, 0, "оба оплачены, молчим");

// назад ровно ОДИН шаг, позапрошлый не всплывает
eq(
  subscriptionsDue(sMissed, "2026-10-25", 7).filter(x => x.month === "2026-08").length,
  0,
  "позапрошлый месяц назад не тянем"
);

// подписка, которая ещё не началась, задним числом не всплывает
eq(
  subscriptionsDue(state({ recurring: [kvLB({ startMonth: "2026-09" })] }),
                   "2026-09-25", 7).filter(x => x.month === "2026-08").length,
  0,
  "до начала подписки долгов нет"
);

// ---- Форма: память после перевода ----
// Раньше после перевода форма падала (TypeError в makeFresh), а с ней и каждое
// следующее открытие «Добавить»: у типа «Перевод» нет категорий.
{
  const accs = [
    { id: "yandex", name: "Яндекс", baseBalance: 0 },
    { id: "sber", name: "Сбер", baseBalance: 0 },
    { id: "cash", name: "Наличные", baseBalance: 0 },
  ];
  const NOW = 1_000_000_000;
  const after = freshDraft(
    { type: "transfer", category: "", accountId: "yandex", toAccountId: "sber", date: "2026-10-01" },
    accs, "yandex", "2026-10-01", NOW
  );
  eq([after.type, after.accountId, after.toAccountId, after.category], ["transfer", "yandex", "sber", ""],
    "после перевода черновик снова перевод с тем же получателем");
  // старая память без получателя (так писала прежняя версия)
  const legacy = freshDraft(
    { type: "transfer", category: "", accountId: "yandex", date: "2026-10-01" },
    accs, "yandex", "2026-10-01", NOW
  );
  eq([legacy.type, legacy.toAccountId], ["transfer", "sber"], "старая память без получателя не роняет форму");
  // получатель удалён — берём другой счёт, но не источник
  const gone = freshDraft(
    { type: "transfer", category: "", accountId: "yandex", toAccountId: "deleted", date: "2026-10-01" },
    accs, "yandex", "2026-10-01", NOW
  );
  eq(gone.toAccountId, "sber", "удалённый получатель заменён другим счётом");
  // один счёт — перевод невозможен, откатываемся к расходу
  const single = freshDraft(
    { type: "transfer", category: "", accountId: "yandex", toAccountId: "sber", date: "2026-10-01" },
    [accs[0]], "yandex", "2026-10-01", NOW
  );
  eq(single.type, "expense_personal", "при одном счёте вместо перевода обычный расход");
  eq(pickToAccount(accs, "sber", "sber"), "yandex", "получатель не может совпасть с источником");
  // обычный расход по-прежнему запоминается
  const exp = freshDraft(
    { type: "expense_personal", category: "Рестораны и кафе", accountId: "sber", date: "2026-09-30", savedAt: NOW },
    accs, "yandex", "2026-10-01", NOW + 60_000
  );
  eq([exp.type, exp.category, exp.accountId, exp.date], ["expense_personal", "Рестораны и кафе", "sber", "2026-09-30"],
    "память расхода: тип, категория, счёт, дата (пакетный ввод)");
  const stale = freshDraft(
    { type: "expense_personal", category: "Рестораны и кафе", accountId: "sber", date: "2026-09-30", savedAt: NOW },
    accs, "yandex", "2026-10-01", NOW + 3 * 60 * 60 * 1000
  );
  eq([stale.category, stale.date], ["Рестораны и кафе", "2026-10-01"], "через 3 часа дата снова сегодняшняя, категория помнится");
  const legacyDate = freshDraft(
    { type: "expense_personal", category: "Рестораны и кафе", accountId: "sber", date: "2026-09-30" },
    accs, "yandex", "2026-10-01", NOW
  );
  eq(legacyDate.date, "2026-10-01", "старая память без времени — дата сегодняшняя");
}

// ---- Счета Альфа-Банка ----
{
  const base = [
    { id: "yandex", name: "Яндекс банк", baseBalance: 100 },
    { id: "cash", name: "Наличные", baseBalance: 0 },
  ];
  const added = ensureAlfaAccounts(base);
  eq(added.map((a) => a.id), ["yandex", "cash", "alfa", "alfa-business"], "оба счёта Альфы добавлены в конец");
  eq(added.filter((a) => a.id.startsWith("alfa")).map((a) => [a.baseBalance, a.kind ?? "regular"]),
    [[0, "regular"], [0, "regular"]], "обычные счета с нулевым остатком");
  eq(ensureAlfaAccounts(added), added, "повторный запуск ничего не добавляет");
  eq(ensureAlfaAccounts(base, { alfa: 1 }).map((a) => a.id), ["yandex", "cash", "alfa-business"],
    "удалённый пользователем счёт не возвращается");
  eq(ensureAlfaAccounts([...base, { id: "x1", name: " альфа-банк ", baseBalance: 5 }]).map((a) => a.id),
    ["yandex", "cash", "x1", "alfa-business"], "заведённый вручную под тем же именем не дублируется");
  // два устройства завели одни и те же счета — слияние их не задваивает
  const devA = state({ accounts: ensureAlfaAccounts(base), updatedAt: 10 });
  const devB = state({ accounts: ensureAlfaAccounts(base), updatedAt: 20 });
  eq(mergeStates(devA, devB).accounts.map((a) => a.id), ["yandex", "cash", "alfa", "alfa-business"],
    "слияние двух устройств без дублей");
  // счёт удалили на одном устройстве, другое завело его заново до синхронизации
  const deleted = state({
    accounts: base,
    deletedAccountIds: { alfa: 1790000000000 },
    updatedAt: 30,
  });
  eq(mergeStates(devA, deleted).accounts.some((a) => a.id === "alfa"), false,
    "надгробие удаления побеждает свежезаведённый счёт");
}

// ---- Переводы: защита от «перевода в никуда» ----
{
  const orphan = op({ type: "transfer", category: "", amount: 5000, accountId: "yandex", toAccountId: undefined });
  eq(operationAccountDelta(orphan, "yandex"), 0, "перевод без получателя не снимает деньги");
  eq(operationDelta(orphan), 0, "перевод без получателя: дельта 0");
  const ok = op({ type: "transfer", category: "", amount: 1000, accountId: "yandex", toAccountId: "sber" });
  const st = state({ operations: [ok] });
  eq([currentBalance(st, "yandex"), currentBalance(st, "sber"), totalOnHand(st)], [9000, 6000, 15000],
    "перевод меняет оба счёта и не меняет «На руках»");
  eq([monthSummary(st, "2026-05").income, monthSummary(st, "2026-05").expense], [0, 0],
    "перевод не доход и не расход");
  const rule = { id: "rt", title: "Копилка", type: "transfer" as const, category: "Продукты / еда / вода",
    amount: 5000, accountId: "yandex", dayOfMonth: 1, startMonth: "2026-09", note: "" };
  eq(dueRecurringOperations([rule], new Set(), "2026-10", "2026-10-05").length, 0,
    "регулярное правило-перевод операций не порождает");
}

// ---- Копеечные хвосты в балансе ----
{
  const st = state({
    accounts: [{ id: "card", name: "Альфа кредитка", baseBalance: 0, kind: "credit_card", creditLimit: 1000, creditPaymentDay: 5 }],
    operations: [
      op({ accountId: "card", amount: 149.9 }),
      op({ accountId: "card", amount: 149.9 }),
      op({ accountId: "card", amount: 149.9 }),
      op({ type: "transfer", category: "", accountId: "x", toAccountId: "card", amount: 449.7 }),
    ],
  });
  eq(currentBalance(st, "card"), 0, "баланс округлён до копеек");
  eq(creditCardDebt(st, "card"), 0, "нет фантомного долга 5,7e-14");
  eq(paymentCalendar(st, "2026-05", "2026-05-01").filter((i) => i.kind === "credit_card" && !i.paid).length, 0,
    "в календаре нет «оплатить кредитку · долг 0 ₽»");
}

// ---- Переплата по кредитке — деньги владельца ----
{
  const st = state({
    accounts: [
      { id: "yandex", name: "Яндекс", baseBalance: 20000 },
      { id: "card", name: "Сплит", baseBalance: -7241, kind: "credit_card", creditLimit: 15000, creditPaymentDay: 2 },
    ],
    operations: [op({ type: "transfer", category: "", accountId: "yandex", toAccountId: "card", amount: 10921 })],
  });
  eq(creditCardDebt(st, "card"), 0, "переплатили — долга нет");
  eq(creditCardOverpay(st, "card"), 3680, "переплата видна");
  eq(creditCardAvailable(st, "card"), 18680, "доступно = лимит + переплата");
  eq(totalOnHand(st), 12759, "переплата входит в «На руках» (9 079 + 3 680)");
  eq(realPosition(st), 12759, "реальная позиция не теряет переплату");
  const before = state({
    accounts: st.accounts,
    operations: [],
  });
  eq(realPosition(before), 20000 - 7241, "до оплаты");
  eq(realPosition(st), realPosition(before), "оплата кредитки с переплатой не меняет реальную позицию");
}

// ---- Кредиты: частичный платёж и остаток по каждому кредиту ----
{
  const c = credit({ payment: 8209, count: 16, paymentDates: ["2026-09-29", "2026-10-29"],
    payments: [{ id: "p1", date: "2026-09-30", amount: 5000, accountId: "yandex" }] });
  const v = creditView(c);
  eq([v.nextPaymentDate, v.nextPaymentAmount], ["2026-09-29", 3209], "после частичной оплаты осталось 3 209");
  const full = credit({ payment: 1000, count: 2, paymentDates: ["2026-01-01", "2026-02-01"],
    payments: [{ id: "a", date: "2026-01-01", amount: 1000, accountId: "yandex" }] });
  eq(creditView(full).nextPaymentAmount, 1000, "после целого платежа следующий полный");
  const over = credit({ payment: 1000, count: 1, paymentDates: ["2026-01-01"],
    payments: [{ id: "a", date: "2026-01-01", amount: 1000, accountId: "yandex" }, { id: "b", date: "2026-01-02", amount: 1000, accountId: "yandex" }] });
  const other = credit({ payment: 500, count: 4, paymentDates: [] });
  eq(creditInfo(state({ credits: [over, other] })).remaining, 2000,
    "переплата одного кредита не гасит долг по другому");
}

// ---- Обороты по счёту учитывают долги и кредиты ----
{
  const st = state({
    debts: [debt({ direction: "i_owe", amount: 3000, accountId: "sber", date: "2026-05-03",
      payments: [{ id: "dp", date: "2026-05-20", amount: 1000, accountId: "sber" }] })],
    credits: [credit({ received: 100000, receivedDate: "2026-05-01", receivedAffectsBalance: true, accountId: "sber",
      payments: [{ id: "cp", date: "2026-05-25", amount: 8209, accountId: "sber" }] })],
  });
  const f = accountMonthFlow(st, "sber", "2026-05");
  eq([f.income, f.expense], [103000, 9209], "долг и кредит видны в оборотах");
  eq(f.net, currentBalance(st, "sber") - 5000, "чистый оборот = изменение баланса");
}

// ---- Прогноз расхода не размазывает аренду ----
{
  const rent = { id: "rent", title: "Квартира", type: "expense_personal" as const, category: "Остальное / разное",
    amount: 22000, accountId: "yandex", dayOfMonth: 1, startMonth: "2026-01", note: "", kind: "subscription" as const };
  const st = state({
    recurring: [rent],
    operations: [op({ id: "rec-rent-2026-10", recurringId: "rent", amount: 22000, date: "2026-10-01" })],
  });
  eq(expensePace(st, "2026-10", "2026-10-01").projected, 22000, "1-го числа аренда не превращается в 682 000");
  const st2 = state({ recurring: [rent], operations: [op({ amount: 300, date: "2026-10-01" })] });
  eq(expensePace(st2, "2026-10", "2026-10-01").projected, 300 * 31 + 22000,
    "неоплаченная аренда входит в прогноз один раз");
}

// ---- Связь оплат с подпиской восстанавливается ----
{
  const ops = [
    op({ id: "rec-r1-2026-07", amount: 22000 }),
    op({ id: "rec-gone-2026-07", amount: 5 }),
    op({ id: "plain", amount: 1 }),
  ];
  const fixed = restoreRecurringIds(ops, [{ id: "r1", title: "", type: "expense_personal", category: "x",
    amount: 1, accountId: "sber", dayOfMonth: 1, startMonth: "2026-01", note: "" }]);
  eq(fixed.map((o) => o.recurringId ?? null), ["r1", null, null], "recurringId восстановлен только для живого правила");
  eq(restoreRecurringIds(fixed, []), fixed, "без изменений — тот же массив");
  const payload = toPayload(state({ operations: ops, recurring: [{ id: "r1", title: "", type: "expense_personal",
    category: "x", amount: 1, accountId: "sber", dayOfMonth: 1, startMonth: "2026-01", note: "" }] }));
  eq(fromPayload(payload).operations[0].recurringId, "r1", "из хаба тоже приходит исправленным");
}

// ---- Кредит с копейками: 10 платежей по 2 916,67 — это ровно 10 платежей ----
{
  const dates = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-15`);
  const c = credit({ payment: 2916.67, count: 12, paymentDates: dates,
    payments: Array.from({ length: 10 }, (_, i) => ({ id: `k${i}`, date: dates[i], amount: 2916.67, accountId: "yandex" })) });
  const v = creditView(c);
  eq([v.paidCount, v.nextPaymentDate, v.nextPaymentAmount], [10, "2026-11-15", 2916.67],
    "копейки не съедают оплаченный платёж (раньше: 9 из 12 и «просрочено · 0 ₽»)");
  const cal = paymentCalendar(state({ credits: [c] }), "2026-10", "2026-10-01").filter((i) => i.kind === "credit");
  eq(cal.map((i) => i.paid), [true], "календарь согласен: октябрьский платёж оплачен");
}

// и для суммы с долями копейки (35 000 / 12)
{
  const pay = 35000 / 12;
  const dates = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-15`);
  const c = credit({ payment: pay, count: 12, paymentDates: dates,
    payments: Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, date: dates[i], amount: pay, accountId: "yandex" })) });
  eq([creditView(c).paidCount, creditView(c).nextPaymentDate], [10, "2026-11-15"], "35 000 / 12 × 10 — это 10 платежей");
  eq(paymentCalendar(state({ credits: [c] }), "2026-10", "2026-10-01").filter((i) => i.kind === "credit").map((i) => i.paid),
    [true], "и календарь не показывает «0,03 ₽ к оплате»");
}

// ---- Сравнение состояний не зависит от порядка записей ----
{
  const a = op({ id: "a1", amount: 1 });
  const b = op({ id: "b1", amount: 2 });
  const s1 = state({ operations: [a, b] });
  const s2 = state({ operations: [b, { ...a }] });
  eq(canonicalJson(s1) === canonicalJson(s2), true, "одни и те же операции в разном порядке — одно состояние");
  const s3 = state({ operations: [a, { ...b, amount: 3 }] });
  eq(canonicalJson(s1) === canonicalJson(s3), false, "разное содержимое различается");
  const keyOrder = state({ operations: [{ amount: 1, id: "a1", date: a.date, type: a.type, category: a.category, accountId: a.accountId, note: "" } as Operation, b] });
  eq(canonicalJson(keyOrder) === canonicalJson(s1), true, "порядок ключей в объекте не важен");
}

// ---- Настройки сливаются по своей метке ----
{
  const hub = state({
    updatedAt: 100,
    settingsUpdatedAt: 0,
    goal: { name: "Квартира", target: 40000, saved: 0 },
    primaryAccountId: "yandex",
    templates: [{ id: "tpl-coffee", title: "Зацепи кофе", type: "expense_personal", category: "Рестораны и кафе", amount: 250, accountId: "yandex", note: "" }],
    budgets: { "Продукты / еда / вода": 15000 },
    accounts: [
      { id: "yandex", name: "Яндекс", baseBalance: 10000, updatedAt: 50 },
      { id: "cash", name: "Наличные", baseBalance: 1 },
    ],
  });
  // новое устройство: одна операция (документ свежее), настроек не трогали
  const fresh = state({
    updatedAt: 500,
    accounts: [{ id: "cash", name: "Наличные", baseBalance: 0 }],
    primaryAccountId: "cash",
    templates: [],
    operations: [op({ id: "fresh-op", amount: 10, accountId: "cash" })],
  });
  const m = mergeStates(fresh, hub);
  eq([m.goal.name, m.primaryAccountId, (m.templates ?? []).length, (m.budgets ?? {})["Продукты / еда / вода"]],
    ["Квартира", "yandex", 1, 15000], "новое устройство не затирает настройки таблицы");
  eq(m.accounts.find((x) => x.id === "cash")!.baseBalance, 1, "и остаток «Наличных» без метки берётся из таблицы");
  eq(m.operations.some((o) => o.id === "fresh-op"), true, "а его операция сохраняется");
  // на устройстве правда поменяли настройки — они побеждают
  const edited = { ...fresh, settingsUpdatedAt: 400, budgets: { "Продукты / еда / вода": 20000 } };
  eq((mergeStates(edited, hub).budgets ?? {})["Продукты / еда / вода"], 20000, "свежая правка настроек побеждает");
  // старая версия приложения прислала документ без метки — свежие настройки не откатываются
  const oldBuildPush = { ...hub, updatedAt: 900, settingsUpdatedAt: undefined, budgets: {} };
  eq((mergeStates(edited, oldBuildPush).budgets ?? {})["Продукты / еда / вода"], 20000,
    "документ старой версии не откатывает настройки");
  eq(mergeStates(edited, hub).settingsUpdatedAt, 400, "метка настроек — максимум из двух");
}

// ---- Переходный период: документ старой версии без метки настроек ----
{
  const newDesk = state({ updatedAt: 100, settingsUpdatedAt: 100, budgets: { "Еда": 15000 } });
  // телефон на старой версии поменял бюджет позже и отправил документ без метки
  const oldPhonePayload = { ...toPayload(state({ updatedAt: 200, budgets: { "Еда": 20000 } })) } as Record<string, unknown>;
  delete oldPhonePayload.settingsUpdatedAt;
  const fromOld = fromPayload(oldPhonePayload as unknown as ReturnType<typeof toPayload>);
  eq(fromOld.settingsUpdatedAt, 200, "настройки старого документа датируются его временем");
  eq((mergeStates(newDesk, fromOld).budgets ?? {})["Еда"], 20000, "более поздняя правка на старой версии не теряется");
  // а свежая правка на новой версии побеждает устаревший старый документ
  const staleOld = fromPayload({ ...oldPhonePayload, updatedAt: 50 } as unknown as ReturnType<typeof toPayload>);
  eq((mergeStates(newDesk, staleOld).budgets ?? {})["Еда"], 15000, "устаревший документ старой версии не откатывает настройки");
  // две вкладки с равной меткой и разными настройками сходятся за один шаг
  const tabA = state({ updatedAt: 10, settingsUpdatedAt: 5, budgets: { "Еда": 1 } });
  const tabB = state({ updatedAt: 11, settingsUpdatedAt: 5, budgets: { "Еда": 2 } });
  const a1 = mergeStates(tabB, tabA); // вкладка A получила событие от B
  eq((a1.budgets ?? {})["Еда"], 1, "при равной метке вкладка оставляет свои настройки");
}

// ---- Альфа: «Альфа банк» и «Альфа-Банк» — одно имя ----
eq(ensureAlfaAccounts([{ id: "m", name: "Альфа банк", baseBalance: 0 }]).map((a) => a.id), ["m", "alfa-business"],
  "имя с пробелом вместо дефиса не дублируется");

// ---- Кредитка: один платёж за цикл ----
{
  const split = { id: "split", name: "Сплит", baseBalance: -7910, kind: "credit_card" as const, creditLimit: 15000, creditPaymentDay: 2 };
  const pay = (date: string, amount: number) =>
    op({ type: "transfer", category: "", accountId: "yandex", toAccountId: "split", amount, date });
  const base = (ops: Operation[]) => state({ accounts: [{ id: "yandex", name: "Яндекс", baseBalance: 50000 }, split], operations: ops });

  const c = creditCardCurrentCycle(base([]), split, "2026-10-02")!;
  eq([c.due, c.from, c.to, c.paid], ["2026-10-02", "2026-09-24", "2026-10-25", false],
    "окно срока 2 октября: с 25 сен (напоминание) по 25 окт");
  eq(creditCardCurrentCycle(base([]), split, "2026-10-25")!.due, "2026-10-02", "25 окт — ещё октябрь");
  eq(creditCardCurrentCycle(base([]), split, "2026-10-26")!.due, "2026-11-02", "26 окт открывается напоминание о 2 ноября");
  eq(creditCardCurrentCycle(base([]), split, "2026-09-12")!.due, "2026-09-02", "12 сен — сентябрьский срок");

  // реальный случай: оплатили 2 сентября, долг снова есть от покупок
  const sepPaid = base([pay("2026-09-02", 9325)]);
  eq(creditCardCycleForMonth(sepPaid, split, "2026-09")!.paid, true, "сентябрь оплачен 2 сентября");
  eq(creditCardCurrentCycle(sepPaid, split, "2026-10-02")!.paid, false, "сентябрьский платёж не закрывает октябрь");

  // заплатили раньше срока (25 сен) — октябрь закрыт, напоминания нет
  const early = base([pay("2026-09-02", 2000), pay("2026-09-25", 1000)]);
  eq(creditCardCurrentCycle(early, split, "2026-09-28")!.paid, true, "платёж заранее закрывает свой срок");
  eq(creditCardDebt(early, "split") > 0, true, "даже если долг по карте ещё остался");
  // заплатили на 3 дня позже — тоже засчитано октябрю
  const late = base([pay("2026-10-05", 4000)]);
  eq(creditCardCycleForMonth(late, split, "2026-10")!.paid, true, "платёж через 3 дня после срока засчитан этому сроку");
  eq(creditCardCycleForMonth(late, split, "2026-11")!.paid, false, "и не следующему");
  // календарь показывает оплаченный срок с суммой
  const cal = paymentCalendar(late, "2026-10", "2026-10-06").filter((i) => i.kind === "credit_card");
  eq(cal.map((i) => [i.date, i.amount, Boolean(i.paid)]), [["2026-10-02", 4000, true]], "календарь: срок оплачен, внесено 4 000");
  // покупка с карты — не платёж
  const spend = base([op({ accountId: "split", amount: 500, date: "2026-09-20" })]);
  eq(creditCardCurrentCycle(spend, split, "2026-10-01")!.paid, false, "трата с карты платежом не считается");
  // удалённый платёж не считается
  const deletedPay = base([{ ...pay("2026-09-30", 3000), deleted: true }]);
  eq(creditCardCurrentCycle(deletedPay, split, "2026-10-01")!.paid, false, "удалённый платёж не считается");
  // день оплаты 31 в феврале
  const card31 = { ...split, creditPaymentDay: 31 };
  const feb = creditCardCycleForMonth(base([]), card31, "2026-02")!;
  eq([feb.due, feb.from, feb.to], ["2026-02-28", "2026-02-20", "2026-03-23"], "31-е в феврале: срок 28-го");

  // CC-1: не заплатили — напоминание не замолкает, пока не начнётся следующее
  const unpaid = base([]);
  for (const day of ["2026-10-03", "2026-10-13", "2026-10-20", "2026-10-25"]) {
    const cy = creditCardCurrentCycle(unpaid, split, day)!;
    eq([cy.due, creditCardCycleNeedsPayment(unpaid, cy, "split", day)], ["2026-10-02", true], `${day}: октябрь всё ещё к оплате`);
  }
  // CC-2: заплатили поздно (или записали поздно) — закрывается октябрь, а не ноябрь
  const lateRecorded = base([pay("2026-10-20", 5000)]);
  eq(creditCardCycleForMonth(lateRecorded, split, "2026-10")!.paid, true, "платёж 20 окт закрывает октябрь");
  eq(creditCardCycleForMonth(lateRecorded, split, "2026-11")!.paid, false, "ноябрь остаётся к оплате");
  // CC-3: на дату срока долга не было — покупка после срока не делает его просроченным
  const inCredit = state({
    accounts: [{ id: "yandex", name: "Яндекс", baseBalance: 50000 }, { ...split, baseBalance: 200 }],
    operations: [op({ accountId: "split", amount: 500, date: "2026-10-05" })],
  });
  const cyc = creditCardCurrentCycle(inCredit, split, "2026-10-06")!;
  eq([cyc.owedAtDue, creditCardCycleNeedsPayment(inCredit, cyc, "split", "2026-10-06")], [0, false],
    "на 2 окт карта была в плюсе — просрочки нет");
  eq(paymentCalendar(inCredit, "2026-10", "2026-10-06").filter((i) => i.kind === "credit_card").length, 0,
    "и в календаре её нет");
  // а следующий срок (2 ноября) этот долг уже требует
  const novDay = "2026-10-27";
  const cycNov = creditCardCurrentCycle(inCredit, split, novDay)!;
  eq([cycNov.due, creditCardCycleNeedsPayment(inCredit, cycNov, "split", novDay)], ["2026-11-02", true],
    "долг от покупки ждёт ноябрьского срока");
}

// ---- Баланс счёта на дату ----
{
  const st = state({
    operations: [
      op({ accountId: "sber", amount: 1000, date: "2026-05-10" }),
      op({ type: "income", category: "Прочий доход", accountId: "sber", amount: 300, date: "2026-05-20" }),
      op({ type: "transfer", category: "", accountId: "sber", toAccountId: "yandex", amount: 200, date: "2026-05-25" }),
    ],
    debts: [debt({ direction: "i_owe", accountId: "sber", amount: 700, date: "2026-05-15" })],
  });
  eq(currentBalance(st, "sber"), 5000 - 1000 + 300 - 200 + 700, "текущий");
  eq(accountBalanceAt(st, "sber", "2026-05-12"), 4000, "на 12 мая — до дохода, долга и перевода");
  eq(accountBalanceAt(st, "sber", "2026-05-31"), currentBalance(st, "sber"), "на конец месяца = текущему");
}

// ---- Сверка с банком: правка истории задним числом не сдвигает остаток ----
{
  const today = "2026-10-02";
  const withRec = (st: AppState, id: string, value: number, now = 1000): AppState => ({
    ...st,
    accounts: st.accounts.map((a) => (a.id === id ? { ...a, ...reconcileAccount(st, id, value, today, now) } : a)),
  });
  const base0 = state({
    operations: [
      op({ id: "old1", accountId: "sber", amount: 1000, date: "2026-09-20" }),
      op({ id: "today1", accountId: "sber", amount: 200, date: today }),
    ],
  });
  eq(currentBalance(base0, "sber"), 3800, "до сверки: 5000 − 1000 − 200");
  const rec = withRec(base0, "sber", 3500);
  const r = rec.accounts.find((a) => a.id === "sber")!.reconciled!;
  eq([currentBalance(rec, "sber"), r.adjustment, r.dayKeys], [3500, -300, ["op:today1"]], "сверка: в банке 3 500, поправка −300");
  eq(rec.accounts.find((a) => a.id === "sber")!.baseBalance + (-1000 - 200), 3500,
    "baseBalance тоже пересчитан — старые версии покажут то же");

  // дописали забытую трату задним числом — остаток не меняется
  const backfill = { ...rec, operations: [...rec.operations, op({ id: "late", accountId: "sber", amount: 700, date: "2026-09-25" })] };
  eq(currentBalance(backfill, "sber"), 3500, "трата задним числом уже учтена банком");
  // удалили старую запись — тоже
  const deletedOld = { ...rec, operations: rec.operations.map((o) => (o.id === "old1" ? { ...o, deleted: true } : o)) };
  eq(currentBalance(deletedOld, "sber"), 3500, "удаление старой записи остаток не сдвигает");
  // запись сегодняшнего дня, бывшая на момент сверки, правится — учтена
  const editedToday = { ...rec, operations: rec.operations.map((o) => (o.id === "today1" ? { ...o, amount: 999 } : o)) };
  eq(currentBalance(editedToday, "sber"), 3500, "сегодняшняя запись до сверки в ней учтена");
  // новая трата сегодня после сверки — считается
  const after = { ...rec, operations: [...rec.operations, op({ id: "coffee", accountId: "sber", amount: 250, date: today })] };
  eq(currentBalance(after, "sber"), 3250, "кофе после сверки уменьшает остаток");
  // и завтрашняя
  const tomorrow = { ...rec, operations: [...rec.operations, op({ type: "income", category: "Прочий доход", accountId: "sber", amount: 1000, date: "2026-10-03" })] };
  eq(currentBalance(tomorrow, "sber"), 4500, "доход после даты сверки считается");
  // перевод на сверенный счёт после сверки — считается
  const tr = { ...rec, operations: [...rec.operations, op({ type: "transfer", category: "", accountId: "yandex", toAccountId: "sber", amount: 300, date: "2026-10-03" })] };
  eq([currentBalance(tr, "sber"), currentBalance(tr, "yandex")], [3800, 9700], "перевод после сверки двигает оба счёта");
  // остаток на дату
  eq(accountBalanceAt(after, "sber", "2026-09-30"), 3500 + 200, "на 30 сен: до сегодняшней траты 200");
  eq(accountBalanceAt(after, "sber", today), 3250, "на конец сегодняшнего дня");
  // слияние двух устройств: сверка едет вместе со счётом
  const remote = { ...rec, updatedAt: 5, accounts: rec.accounts.map((a) => (a.id === "sber" ? { ...a, updatedAt: 2000 } : a)) };
  const local = { ...base0, updatedAt: 9 };
  eq(currentBalance(mergeStates(local, remote), "sber"), 3500, "сверка с другого устройства применяется");
  // снятие сверки сохраняет текущий остаток
  const plain = accountWithoutReconciliation(after, after.accounts.find((a) => a.id === "sber")!);
  const plainState = { ...after, accounts: after.accounts.map((a) => (a.id === "sber" ? plain : a)) };
  eq([plain.reconciled ?? null, currentBalance(plainState, "sber")], [null, 3250], "без сверки остаток тот же");
  // кредитка: долг вводится как минус, сверка работает так же
  const card = state({
    accounts: [{ id: "c", name: "Карта", baseBalance: 0, kind: "credit_card", creditLimit: 10000, creditPaymentDay: 2 }],
    operations: [op({ id: "p", accountId: "c", amount: 500, date: "2026-09-10" })],
  });
  const cardRec = withRec(card, "c", -800);
  eq(creditCardDebt(cardRec, "c"), 800, "долг по карте после сверки 800");
}

// ---- Сверка: старые версии, записи «из прошлого» того же дня, будущие даты ----
{
  const today = "2026-10-02";
  const at = 5000;
  const recOf = (st: AppState, id: string, v: number) => ({
    ...st,
    accounts: st.accounts.map((a) => (a.id === id ? { ...a, ...reconcileAccount(st, id, v, today, at) } : a)),
  });
  // F3: старая версия ввела остаток (поменяла только baseBalance) — сверка устарела
  const rec = recOf(state({ operations: [op({ id: "x", accountId: "sber", amount: 100, date: "2026-09-01", updatedAt: 1 })] }), "sber", 3500);
  const oldBuildEdit = { ...rec, accounts: rec.accounts.map((a) => (a.id === "sber" ? { ...a, baseBalance: 9100 } : a)) };
  eq(currentBalance(oldBuildEdit, "sber"), 9000, "остаток, введённый на старой версии, не игнорируется");
  // F4: сгенерированная аренда (метка 0) и трата с телефона до сверки, доехавшая позже
  const base4 = state({});
  const rec4 = recOf(base4, "sber", 6000);
  const arrivedLater = {
    ...rec4,
    operations: [
      op({ id: "rec-rent-2026-10", recurringId: "rent", accountId: "sber", amount: 2000, date: today, updatedAt: 0 }),
      op({ id: "phone", accountId: "sber", amount: 300, date: today, updatedAt: at - 1000 }),
      op({ id: "afterRec", accountId: "sber", amount: 50, date: today, updatedAt: at + 1000 }),
    ],
  };
  eq(currentBalance(arrivedLater, "sber"), 5950, "записи дня, созданные до сверки, учтены; после — считаются");
  // F5: запись с будущей датой
  const future = state({ operations: [op({ id: "rent", accountId: "sber", amount: 2000, date: "2026-10-10", updatedAt: 1 })] });
  eq([currentBalance(future, "sber"), accountBalanceAt(future, "sber", today)], [3000, 5000], "до сверки: сегодня 5000, с будущей арендой 3000");
  const recF = recOf(future, "sber", 5000);
  const accF = recF.accounts.find((a) => a.id === "sber")!;
  eq([accF.reconciled!.adjustment, currentBalance(recF, "sber"), accF.baseBalance + 0 - 2000], [0, 3000, 3000],
    "банк и приложение на сегодня совпали — поправки нет; старые версии покажут то же");
}

// ---- Календарь: просроченное из прошлых месяцев переносится в текущий ----
{
  const st = state({
    credits: [credit({ id: "yb", name: "Яндекс банк", payment: 8209, count: 3,
      paymentDates: ["2026-09-29", "2026-10-29", "2026-11-29"], payments: [] })],
    debts: [
      debt({ id: "mama", direction: "i_owe", person: "Мама", amount: 11000, dueDate: "2026-09-30" }),
      debt({ id: "paid", direction: "i_owe", person: "Боря", amount: 500, dueDate: "2026-09-10",
        payments: [{ id: "p", date: "2026-09-10", amount: 500, accountId: "sber" }] }),
      debt({ id: "me", direction: "owed_to_me", person: "Ира", amount: 700, dueDate: "2026-09-15" }),
    ],
    recurring: [
      rule({ id: "claude", kind: "subscription", title: "Claude", amount: 25000, dayOfMonth: 26, startMonth: "2026-06" }),
      rule({ id: "icloud", kind: "subscription", title: "iCloud", amount: 300, dayOfMonth: 2, startMonth: "2026-06" }),
    ],
    operations: [op({ id: "rec-icloud-2026-09", recurringId: "icloud", amount: 300, date: "2026-09-02" })],
  });
  const oct = paymentCalendar(st, "2026-10", "2026-10-02");
  const carried = oct.filter((i) => i.carried).map((i) => [i.key, i.date, i.amount]);
  eq(carried, [
    ["sub-claude-2026-09", "2026-09-26", 25000],
    ["credit-yb-0", "2026-09-29", 8209],
    ["debt-mama", "2026-09-30", 11000],
  ], "в октябрь перенесены: сентябрьская подписка, платёж по кредиту и долг");
  eq(oct.some((i) => i.key === "credit-yb-1" && !i.carried), true, "октябрьский платёж по кредиту на месте");
  // в прошлом месяце (не текущем) переноса нет
  eq(paymentCalendar(st, "2026-11", "2026-10-02").some((i) => i.carried), false, "будущий месяц без переноса");
  eq(paymentCalendar(st, "2026-09", "2026-10-02").some((i) => i.carried), false, "прошлый месяц без переноса");
  // оплатили кредит — из переноса ушёл
  const paidCredit = { ...st, credits: st.credits.map((c) => ({ ...c, payments: [{ id: "x", date: "2026-10-02", amount: 8209, accountId: "yandex" }] })) };
  eq(paymentCalendar(paidCredit, "2026-10", "2026-10-02").some((i) => i.key === "credit-yb-0"), false, "оплаченный прошлый платёж не переносится");
}

// ---- Напоминание о сверке ----
{
  const rec = (date: string) => ({ date, balance: 100, at: 1, dayKeys: [], base: 100 });
  const st = state({
    accounts: [
      { id: "fresh", name: "Сверен вчера", baseBalance: 100, reconciled: rec("2026-10-02") },
      { id: "old", name: "Давно", baseBalance: 100, reconciled: rec("2026-09-15") },
      { id: "never", name: "Не сверялся", baseBalance: 0 },
      { id: "unused", name: "Пустой", baseBalance: 0 },
      { id: "stale", name: "Устаревшая сверка", baseBalance: 555, reconciled: rec("2026-10-02") },
    ],
    operations: [op({ accountId: "never", amount: 50, date: "2026-09-20" })],
  });
  const due = accountsNeedingReconciliation(st, "2026-10-03").map((d) => [d.account.id, d.days]);
  eq(due, [["old", 18], ["never", null], ["stale", null]],
    "напоминаем: 18 дней без сверки, не сверялся с движением, сверка устарела; молчим про свежую и пустой");
  eq(accountsNeedingReconciliation(st, "2026-10-03", 30).map((d) => d.account.id), ["never", "stale"],
    "порог настраивается");
}

// ---- Защита от двойного ввода ----
{
  const now = 1_000_000;
  const t1 = op({ id: "t1", type: "transfer", category: "", amount: 3000, accountId: "cash", toAccountId: "sber",
    date: "2026-09-21", updatedAt: now - 5000 });
  const same: Omit<Operation, "id"> = { type: "transfer", category: "", amount: 3000, accountId: "cash", toAccountId: "sber",
    date: "2026-09-21", note: "" };
  eq(findRecentDuplicate([t1], same, now)?.id, "t1", "тот же перевод через 5 секунд — дубль");
  eq(findRecentDuplicate([t1], same, now + 3 * 60 * 1000), undefined, "через 3 минуты — уже не считаем дублем");
  eq(findRecentDuplicate([t1], { ...same, amount: 3001 }, now), undefined, "другая сумма — не дубль");
  eq(findRecentDuplicate([t1], { ...same, toAccountId: "yandex" }, now), undefined, "другой получатель — не дубль");
  eq(findRecentDuplicate([{ ...t1, deleted: true }], same, now), undefined, "удалённая запись не мешает");
  eq(findRecentDuplicate([t1], { ...same, note: " " }, now)?.id, "t1", "пробел в заметке не делает запись другой");
}

// ---- Ответы хаба: отказ больше не выдаётся за успех ----
async function hubTests() {
  const realFetch = globalThis.fetch;
  const reply = (body: string, status = 200) =>
    (async () => new Response(body, { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  const outcome = async (f: () => Promise<unknown>) => {
    try {
      await f();
      return "ok";
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const payload = toPayload(state({}));
  try {
    globalThis.fetch = reply(JSON.stringify({ ok: true }));
    eq(await outcome(() => push("https://hub/exec?token=x", payload)), "ok", "push: {ok:true} — успех");
    globalThis.fetch = reply(JSON.stringify({ ok: false, error: "unauthorized" }));
    eq((await outcome(() => push("https://hub/exec", payload))).includes("токен"), true, "push: неверный токен — ошибка");
    globalThis.fetch = reply(JSON.stringify({ ok: false, error: "Exception: Lock timeout" }));
    eq((await outcome(() => push("https://hub/exec", payload))) !== "ok", true, "push: занятая блокировка — ошибка");
    globalThis.fetch = reply("<html>Google</html>");
    eq((await outcome(() => push("https://hub/exec", payload))) !== "ok", true, "push: HTML вместо JSON — ошибка");
    globalThis.fetch = reply(JSON.stringify({ ok: false, error: "unauthorized" }));
    eq((await outcome(() => pull("https://hub/exec"))).includes("токен"), true, "pull: неверный токен — понятная ошибка");
    globalThis.fetch = reply(JSON.stringify({ empty: true }));
    eq(await pull("https://hub/exec"), null, "pull: пустой хаб — null");
    globalThis.fetch = reply("not found", 404);
    eq((await outcome(() => pull("https://hub/exec"))).includes("404"), true, "pull: 404 — ошибка");
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---- итог ----
hubTests().then(() => {
  console.log(`\n${passed} проверок пройдено, ${failed} провалено.`);
  if (failed > 0) process.exit(1);
});
