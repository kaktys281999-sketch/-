// Группы операций (типы)
export type OpType =
  | "income"
  | "expense_personal"
  | "expense_work"
  | "credit_loan"
  | "transfer"; // перевод между своими счетами

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
  // счёт-получатель для перевода (только при type === "transfer")
  toAccountId?: string;
  note: string;
  // id регулярного правила, если операция создана автоматически
  recurringId?: string;
  // Метаданные для слияния при синхронизации (необязательны для старых данных)
  updatedAt?: number; // время последнего изменения операции (мс)
  deleted?: boolean; // надгробие — операция удалена, но запись хранится для синхронизации
}

// Регулярная (повторяющаяся) операция.
// kind="auto" — создаётся автоматически каждый месяц;
// kind="subscription" — подписка: списывается вручную кнопкой «Оплатить».
export interface RecurringRule {
  id: string;
  title: string; // короткая подпись
  type: OpType;
  category: string;
  amount: number;
  accountId: string;
  dayOfMonth: number; // число месяца (1..31, обрезается под короткие месяцы)
  startMonth: string; // с какого месяца начинать, «YYYY-MM»
  note: string;
  kind?: "auto" | "subscription"; // по умолчанию "auto"
  active?: boolean; // включено (по умолчанию true)
  updatedAt?: number;
  deleted?: boolean; // надгробие
}

// Настройки кредита (легаси: один кредит). Сохранён для миграции старых данных.
export interface CreditConfig {
  received: number; // полученная сумма
  receivedDate: string; // дата получения (ISO)
  payment: number; // размер платежа
  count: number; // количество платежей
  paymentDates: string[]; // даты платежей (ISO)
}

// Внесённый платёж по кредиту
export interface CreditPayment {
  id: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // всегда положительный
  accountId: string; // с какого счёта списан платёж
}

// Кредит или рассрочка — отдельная сущность с историей платежей
export interface Credit {
  id: string;
  name: string; // «Альфа-Банк», «Рассрочка Ozon»
  received: number; // полученная сумма (для расчёта переплаты)
  receivedDate: string; // дата получения (ISO)
  payment: number; // размер регулярного платежа
  count: number; // всего платежей
  paymentDates: string[]; // расписание (ISO), считается из receivedDate + count
  accountId: string; // счёт по умолчанию для платежей
  payments: CreditPayment[]; // внесённые платежи
  note?: string;
  updatedAt?: number;
  deleted?: boolean; // надгробие для синхронизации
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

// Направление долга
export type DebtDirection = "owed_to_me" | "i_owe"; // мне должны / я должен

// Частичный возврат по долгу
export interface DebtPayment {
  id: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // всегда положительное
  accountId: string; // на какой/с какого счёта прошёл возврат
}

// Долг (человеку или от человека) — отдельная сущность с историей возвратов
export interface Debt {
  id: string;
  direction: DebtDirection;
  person: string; // имя
  amount: number; // изначальная сумма, всегда положительная
  date: string; // дата возникновения (ISO)
  dueDate?: string; // срок возврата (ISO), необязательно
  accountId: string; // счёт, с которого ушло / на который пришло
  note: string;
  payments: DebtPayment[]; // частичные возвраты
  // Метаданные для слияния при синхронизации
  updatedAt?: number;
  deleted?: boolean; // надгробие
}

// Всё состояние приложения
export interface AppState {
  accounts: Account[];
  operations: Operation[];
  // легаси-поле одного кредита (миграция в credits при загрузке)
  credit?: CreditConfig;
  // кредиты и рассрочки
  credits: Credit[];
  goal: Goal;
  // основной счёт — подставляется по умолчанию в формах
  primaryAccountId?: string;
  // месячные лимиты расходов по категориям (необязательно для старых данных)
  budgets?: Budgets;
  // переносить неизрасходованный остаток бюджета на следующий месяц
  budgetRollover?: boolean;
  // шаблоны частых операций
  templates?: Template[];
  // одноразовая подсадка шаблонов транспорта выполнена
  seededTransportTpl?: boolean;
  // одноразовая установка суммы автобуса по умолчанию (55 ₽)
  busDefaultApplied?: boolean;
  // регулярные операции
  recurring?: RecurringRule[];
  // долги (мне должны / я должен)
  debts?: Debt[];
  // момент последнего изменения (мс) — для разрешения конфликтов синхронизации
  updatedAt: number;
}
