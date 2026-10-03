import { Account, Operation, OpType } from "./types";
import { getTypeDef } from "./categories";
import { LastUsed } from "./lastUsed";

// Черновик формы операции: сумма хранится строкой, как её видит поле ввода.
export interface OperationDraft {
  date: string;
  type: OpType;
  category: string;
  amount: string;
  accountId: string;
  toAccountId: string;
  note: string;
}

// Дефолт новой операции: расход «Продукты» — самое частое действие
const DEFAULT_TYPE: OpType = "expense_personal";

export function rememberedDate(date: string | undefined, today: string): string {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
}

// Дата прошлой записи подставляется, пока идёт пакетный ввод задним числом,
// но не дольше 2 часов. Раньше она помнилась вечно, и сегодняшняя трата легко
// записывалась вчерашним или прошлонедельным числом — а у сверенного счёта
// такая запись ещё и не меняет остаток.
export const DATE_MEMORY_MS = 2 * 60 * 60 * 1000;

export function rememberedDateFor(
  last: LastUsed | null,
  today: string,
  now: number
): string {
  if (!last?.date || !last.savedAt || now - last.savedAt > DATE_MEMORY_MS) return today;
  return rememberedDate(last.date, today);
}

export function emptyDraft(
  defaultAccount: string,
  today: string,
  date?: string
): OperationDraft {
  const def = getTypeDef(DEFAULT_TYPE);
  return {
    date: rememberedDate(date, today),
    type: def.type,
    category: def.categories[0]?.name ?? "", // «Продукты / еда / вода»
    amount: "",
    accountId: defaultAccount,
    toAccountId: "",
    note: "",
  };
}

// Получатель перевода: предпочтительный, если он ещё существует и не совпадает
// с источником, иначе первый другой счёт. Пустая строка, если счёт всего один.
export function pickToAccount(
  accounts: Account[],
  fromId: string,
  preferred?: string
): string {
  if (
    preferred &&
    preferred !== fromId &&
    accounts.some((a) => a.id === preferred)
  ) {
    return preferred;
  }
  return accounts.find((a) => a.id !== fromId)?.id ?? "";
}

// Свежий черновик: подставляем последний использованный набор, иначе дефолт
// «Расход / Продукты». Счёт берём из памяти, если он ещё существует.
export function freshDraft(
  last: LastUsed | null,
  accounts: Account[],
  defaultAccount: string,
  today: string,
  now: number
): OperationDraft {
  const date = rememberedDateFor(last, today, now);
  // скрытый из формы тип (кредиты/займы) не подставляем
  if (!last || last.type === "credit_loan") {
    return emptyDraft(defaultAccount, today, date);
  }
  const accountId = accounts.some((a) => a.id === last.accountId)
    ? last.accountId
    : defaultAccount;
  if (last.type === "transfer") {
    // У перевода нет категорий. Раньше здесь читалось categories[0].name, и
    // после первого же перевода форма падала. Память формы хранится на
    // устройстве, поэтому падала и каждая следующая попытка открыть
    // «Добавить»: перевод записывался, а экран ввода становился недоступен.
    const toAccountId = pickToAccount(accounts, accountId, last.toAccountId);
    if (!toAccountId) return emptyDraft(defaultAccount, today, date);
    return {
      date,
      type: "transfer",
      category: "",
      amount: "",
      accountId,
      toAccountId,
      note: "",
    };
  }
  const def = getTypeDef(last.type);
  const category = def.categories.some((c) => c.name === last.category)
    ? last.category
    : def.categories[0]?.name ?? "";
  return {
    date,
    type: last.type,
    category,
    amount: "",
    accountId,
    toAccountId: "",
    note: "",
  };
}

// Такая же операция, добавленная только что (в пределах windowMs). Двойной
// ввод уже случался: форма падала после перевода, и повторное «Добавить»
// записывало копию. Теперь форма переспрашивает, а не молча пишет дубль.
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export function findRecentDuplicate(
  operations: Operation[],
  op: Omit<Operation, "id">,
  now: number,
  windowMs: number = DUPLICATE_WINDOW_MS
): Operation | undefined {
  return operations.find(
    (o) =>
      !o.deleted &&
      (o.updatedAt ?? 0) >= now - windowMs &&
      o.type === op.type &&
      o.amount === op.amount &&
      o.accountId === op.accountId &&
      (o.toAccountId ?? "") === (op.toAccountId ?? "") &&
      o.date === op.date &&
      o.category === op.category &&
      (o.note ?? "").trim() === (op.note ?? "").trim()
  );
}
