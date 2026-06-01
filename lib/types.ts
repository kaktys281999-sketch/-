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
  // Метаданные для слияния при синхронизации (необязательны для старых данных)
  updatedAt?: number; // время последнего изменения операции (мс)
  deleted?: boolean; // надгробие — операция удалена, но запись хранится для синхронизации
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

// Месячные лимиты по категориям расходов: { "Продукты / еда / вода": 15000 }
export type Budgets = Record<string, number>;

// Шаблон частой операции (без даты — подставляется сегодня при использовании)
export interface Template {
  id: string;
  title: string; // короткое название кнопки
  type: OpType;
  category: string;
  amount: number; // 0 — спросить при добавлении
  accountId: string;
  note: string;
}

// Всё состояние приложения
export interface AppState {
  accounts: Account[];
  operations: Operation[];
  credit: CreditConfig;
  goal: Goal;
  // месячные лимиты расходов по категориям (необязательно для старых данных)
  budgets?: Budgets;
  // шаблоны частых операций
  templates?: Template[];
  // момент последнего изменения (мс) — для разрешения конфликтов синхронизации
  updatedAt: number;
}
