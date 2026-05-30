// Группы операций (типы)
export type OpType = "income" | "expense_personal" | "expense_work" | "credit_loan";

// Счёт
export interface Account {
  id: string;
  name: string;
  // Стартовый баланс — остаток «на сейчас». Текущий баланс = base + сумма дельт операций.
  baseBalance: number;
}

// Операция
export interface Operation {
  id: string;
  date: string; // ISO yyyy-mm-dd
  type: OpType;
  category: string;
  amount: number; // всегда положительное число
  accountId: string;
  note: string;
}

// Настройки кредита
export interface CreditConfig {
  received: number; // полученная сумма
  receivedDate: string; // дата получения (ISO)
  payment: number; // размер платежа
  count: number; // количество платежей
  paymentDates: string[]; // даты платежей (ISO)
}

// Цель накоплений
export interface Goal {
  name: string;
  target: number;
  saved: number; // ручное поле
}

// Всё состояние приложения
export interface AppState {
  accounts: Account[];
  operations: Operation[];
  credit: CreditConfig;
  goal: Goal;
}
