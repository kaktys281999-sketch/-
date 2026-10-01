import { Account, OpType } from "./types";
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
  today: string
): OperationDraft {
  // скрытый из формы тип (кредиты/займы) не подставляем
  if (!last || last.type === "credit_loan") {
    return emptyDraft(defaultAccount, today, last?.date);
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
    if (!toAccountId) return emptyDraft(defaultAccount, today, last.date);
    return {
      date: rememberedDate(last.date, today),
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
    date: rememberedDate(last.date, today),
    type: last.type,
    category,
    amount: "",
    accountId,
    toAccountId: "",
    note: "",
  };
}
