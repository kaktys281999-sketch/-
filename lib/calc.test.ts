// Тесты денежных расчётов. Запуск: npm test
// Без фреймворка — простой набор проверок, падает с кодом 1 при ошибке.
import {
  operationDelta,
  debtAccountDelta,
  currentBalance,
  totalOnHand,
  monthSummary,
  creditInfo,
  debtOutstanding,
  debtPaidTotal,
  isDebtSettled,
  debtsSummary,
  realPosition,
} from "./calc";
import { AppState, Operation, Debt } from "./types";

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
    credit: {
      received: 0,
      receivedDate: "2026-01-01",
      payment: 0,
      count: 0,
      paymentDates: [],
    },
    goal: { name: "", target: 0, saved: 0 },
    debts: [],
    updatedAt: 0,
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

// ---- creditInfo (детерминированные поля) ----
const s4 = state({
  credit: { received: 45000, receivedDate: "2026-01-01", payment: 5000, count: 10, paymentDates: [] },
  operations: [
    op({ type: "credit_loan", category: "Платёж по кредиту", amount: 5000, date: "2026-02-01" }),
    op({ type: "credit_loan", category: "Платёж по кредиту", amount: 5000, date: "2025-12-01" }), // до получения — не в счёт
  ],
});
const ci = creditInfo(s4);
eq([ci.totalDue, ci.overpay, ci.paid, ci.remaining], [50000, 5000, 5000, 45000], "кредит: всего/переплата/выплачено/остаток");

// ---- realPosition (полный сценарий) ----
const s5 = state({
  credit: { received: 45000, receivedDate: "2026-01-01", payment: 5000, count: 10, paymentDates: [] },
  operations: [op({ type: "credit_loan", category: "Платёж по кредиту", amount: 5000, date: "2026-02-01" })],
  debts: [debt({ direction: "owed_to_me", accountId: "sber", amount: 1500 })],
});
// на руках: 10000 + (5000−1500) + 0 − 5000(платёж) = 8500
// реальная = 8500 − 45000(остаток) + 1500(вернут) − 0 = −35000
eq(totalOnHand(s5), 8500, "на руках в сценарии с кредитом");
eq(realPosition(s5), 8500 - 45000 + 1500, "реальная позиция");

// ---- итог ----
console.log(`\n${passed} проверок пройдено, ${failed} провалено.`);
if (failed > 0) process.exit(1);
