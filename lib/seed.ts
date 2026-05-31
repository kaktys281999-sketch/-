import { AppState, Operation } from "./types";

// Импортированная история из Excel-трекера (май + июнь 2026).
// Платежи по кредиту не включены — остаток долга считается как в твоей «Сводке».
export const SEED_FLAG = "finance-seed-2026-05-v1";

export const SEED_OPERATIONS: Operation[] = [
  { id: "seed-0", date: "2026-05-08", type: "income", category: "Проектные выплаты", amount: 4500, accountId: "sber", note: "" },
  { id: "seed-1", date: "2026-05-23", type: "income", category: "Проектные выплаты", amount: 7000, accountId: "sber", note: "" },
  { id: "seed-2", date: "2026-05-06", type: "income", category: "Разовые сделки", amount: 2000, accountId: "sber", note: "" },
  { id: "seed-3", date: "2026-05-14", type: "income", category: "Разовые сделки", amount: 2000, accountId: "sber", note: "" },
  { id: "seed-4", date: "2026-05-17", type: "income", category: "Разовые сделки", amount: 4000, accountId: "sber", note: "" },
  { id: "seed-5", date: "2026-05-20", type: "income", category: "Разовые сделки", amount: 1251, accountId: "sber", note: "" },
  { id: "seed-6", date: "2026-05-21", type: "income", category: "Разовые сделки", amount: 3500, accountId: "sber", note: "" },
  { id: "seed-7", date: "2026-05-22", type: "income", category: "Разовые сделки", amount: 3600, accountId: "sber", note: "" },
  { id: "seed-8", date: "2026-05-25", type: "income", category: "Разовые сделки", amount: 1500, accountId: "sber", note: "" },
  { id: "seed-9", date: "2026-05-26", type: "income", category: "Разовые сделки", amount: 1000, accountId: "sber", note: "" },
  { id: "seed-10", date: "2026-05-27", type: "income", category: "Разовые сделки", amount: 2000, accountId: "sber", note: "" },
  { id: "seed-11", date: "2026-05-14", type: "expense_personal", category: "Проезд / транспорт", amount: 769, accountId: "sber", note: "" },
  { id: "seed-12", date: "2026-05-15", type: "expense_personal", category: "Проезд / транспорт", amount: 230, accountId: "sber", note: "" },
  { id: "seed-13", date: "2026-05-17", type: "expense_personal", category: "Проезд / транспорт", amount: 683, accountId: "sber", note: "" },
  { id: "seed-14", date: "2026-05-22", type: "expense_personal", category: "Проезд / транспорт", amount: 682, accountId: "sber", note: "" },
  { id: "seed-15", date: "2026-05-23", type: "expense_personal", category: "Проезд / транспорт", amount: 165, accountId: "sber", note: "" },
  { id: "seed-16", date: "2026-05-24", type: "expense_personal", category: "Проезд / транспорт", amount: 110, accountId: "sber", note: "" },
  { id: "seed-17", date: "2026-05-26", type: "expense_personal", category: "Проезд / транспорт", amount: 120, accountId: "sber", note: "" },
  { id: "seed-18", date: "2026-05-27", type: "expense_personal", category: "Проезд / транспорт", amount: 130, accountId: "sber", note: "" },
  { id: "seed-19", date: "2026-05-29", type: "expense_personal", category: "Проезд / транспорт", amount: 362, accountId: "sber", note: "" },
  { id: "seed-20", date: "2026-05-14", type: "expense_personal", category: "Мобильный / подписки", amount: 380, accountId: "sber", note: "" },
  { id: "seed-21", date: "2026-05-27", type: "expense_personal", category: "Мобильный / подписки", amount: 159, accountId: "sber", note: "" },
  { id: "seed-22", date: "2026-05-14", type: "expense_personal", category: "Остальное / разное", amount: 140, accountId: "sber", note: "" },
  { id: "seed-23", date: "2026-05-15", type: "expense_personal", category: "Остальное / разное", amount: 249, accountId: "sber", note: "" },
  { id: "seed-24", date: "2026-05-17", type: "expense_personal", category: "Остальное / разное", amount: 891, accountId: "sber", note: "" },
  { id: "seed-25", date: "2026-05-20", type: "expense_personal", category: "Остальное / разное", amount: 433, accountId: "sber", note: "" },
  { id: "seed-26", date: "2026-05-21", type: "expense_personal", category: "Остальное / разное", amount: 181, accountId: "sber", note: "" },
  { id: "seed-27", date: "2026-05-22", type: "expense_personal", category: "Остальное / разное", amount: 954, accountId: "sber", note: "" },
  { id: "seed-28", date: "2026-05-23", type: "expense_personal", category: "Остальное / разное", amount: 2019, accountId: "sber", note: "" },
  { id: "seed-29", date: "2026-05-24", type: "expense_personal", category: "Остальное / разное", amount: 892, accountId: "sber", note: "" },
  { id: "seed-30", date: "2026-05-26", type: "expense_personal", category: "Остальное / разное", amount: 1880, accountId: "sber", note: "" },
  { id: "seed-31", date: "2026-05-27", type: "expense_personal", category: "Остальное / разное", amount: 1983, accountId: "sber", note: "" },
  { id: "seed-32", date: "2026-05-28", type: "expense_personal", category: "Остальное / разное", amount: 260, accountId: "sber", note: "" },
  { id: "seed-33", date: "2026-05-29", type: "expense_personal", category: "Остальное / разное", amount: 3336, accountId: "sber", note: "" },
  { id: "seed-34", date: "2026-05-30", type: "expense_personal", category: "Остальное / разное", amount: 622, accountId: "sber", note: "" },
  { id: "seed-35", date: "2026-05-21", type: "expense_work", category: "Claude / GPT / нейросети", amount: 950, accountId: "sber", note: "" },
  { id: "seed-36", date: "2026-05-26", type: "expense_work", category: "Claude / GPT / нейросети", amount: 9200, accountId: "sber", note: "" },
  { id: "seed-37", date: "2026-05-14", type: "expense_work", category: "Profi", amount: 2000, accountId: "sber", note: "" },
  { id: "seed-38", date: "2026-05-23", type: "expense_work", category: "Profi", amount: 1000, accountId: "sber", note: "" },
  { id: "seed-39", date: "2026-05-25", type: "expense_work", category: "Profi", amount: 1700, accountId: "sber", note: "" },
  { id: "seed-40", date: "2026-05-26", type: "expense_work", category: "Profi", amount: 140, accountId: "sber", note: "" },
  { id: "seed-41", date: "2026-05-26", type: "credit_loan", category: "Получен кредит", amount: 30000, accountId: "sber", note: "" },
  { id: "seed-42", date: "2026-05-22", type: "credit_loan", category: "Дал в долг", amount: 1200, accountId: "sber", note: "" },
  { id: "seed-43", date: "2026-05-25", type: "credit_loan", category: "Дал в долг", amount: 1000, accountId: "sber", note: "" },
  { id: "seed-44", date: "2026-05-29", type: "credit_loan", category: "Дал в долг", amount: 1200, accountId: "sber", note: "" },
  { id: "seed-45", date: "2026-05-30", type: "credit_loan", category: "Возврат долга мне", amount: 1000, accountId: "sber", note: "" },
  { id: "seed-46", date: "2026-06-19", type: "income", category: "Проектные выплаты", amount: 22500, accountId: "sber", note: "" },
];

const sign: Record<string, number> = { income: 1, expense_personal: -1, expense_work: -1 };
const csign: Record<string, number> = {
  "Получен кредит": 1,
  "Платёж по кредиту": -1,
  "Дал в долг": -1,
  "Возврат долга мне": 1,
};

function delta(o: Operation): number {
  return (o.type === "credit_loan" ? csign[o.category] ?? 1 : sign[o.type] ?? 0) * o.amount;
}

// Добавляет импортированные операции и подгоняет базы счетов так,
// чтобы «На руках» осталось 13 160 ₽ (Яндекс 11 937, Сбер 879, Тинькофф 344).
export function applySeed(state: AppState): AppState {
  const operations = [...state.operations, ...SEED_OPERATIONS];
  const sberDelta = operations
    .filter((o) => o.accountId === "sber")
    .reduce((s, o) => s + delta(o), 0);
  const accounts = state.accounts.map((a) => {
    if (a.id === "yandex") return { ...a, baseBalance: 11937 };
    if (a.id === "tinkoff") return { ...a, baseBalance: 344 };
    if (a.id === "sber") return { ...a, baseBalance: 879 - sberDelta };
    return a;
  });
  return {
    ...state,
    accounts,
    operations,
    goal: { ...state.goal, name: "Квартира", target: 40000, saved: 0 },
    updatedAt: Date.now(),
  };
}
