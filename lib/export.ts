import { AppState } from "./types";
import { typeLabel } from "./categories";
import {
  creditCardAvailable,
  creditCardDebt,
  creditCardLimit,
  creditInfo,
  debtOutstanding,
  debtPaidTotal,
  debtsSummary,
  isDebtSettled,
  monthSummary,
  paymentCalendar,
  realPosition,
  totalOnHand,
  creditView,
} from "./calc";
import { formatMoney, monthKeyFromISO, monthLabel, shiftMonth } from "./format";

// Экранирование значения для CSV
function cell(v: string | number): string {
  const s = String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Собрать CSV из заголовка и строк (с BOM для Excel)
function toCSV(header: string[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(cell).join(";"));
  return "﻿" + lines.join("\r\n");
}

// Все операции (без надгробий) в CSV. Разделитель ; — удобно для Excel с рус. локалью.
export function operationsToCSV(state: AppState): string {
  const accName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? id;

  const header = ["Дата", "Тип", "Категория", "Сумма", "Счёт", "Заметка"];
  const rows = state.operations
    .filter((o) => !o.deleted)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((o) => [
      o.date,
      typeLabel(o.type),
      o.category,
      o.amount,
      accName(o.accountId),
      o.note ?? "",
    ]);

  return toCSV(header, rows);
}

// Долги (без надгробий) в CSV
export function debtsToCSV(state: AppState): string {
  const accName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? id;

  const header = [
    "Направление",
    "Имя",
    "Сумма",
    "Возвращено",
    "Остаток",
    "Дата",
    "Срок возврата",
    "Счёт",
    "Заметка",
    "Статус",
  ];
  const rows = (state.debts ?? [])
    .filter((d) => !d.deleted)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((d) => [
      d.direction === "owed_to_me" ? "Мне должны" : "Я должен",
      d.person || "",
      d.amount,
      debtPaidTotal(d),
      debtOutstanding(d),
      d.date,
      d.dueDate ?? "",
      accName(d.accountId),
      d.note ?? "",
      isDebtSettled(d) ? "погашен" : "активен",
    ]);

  return toCSV(header, rows);
}

// Кредиты (без надгробий) в CSV
export function creditsToCSV(state: AppState): string {
  const accName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? id;

  const header = [
    "Название",
    "Платёж",
    "Платежей всего",
    "Внесено платежей",
    "Сумма к выплате",
    "Выплачено",
    "Остаток",
    "Переплата",
    "Дата получения",
    "Счёт",
    "Заметка",
    "Статус",
  ];
  const rows = (state.credits ?? [])
    .filter((c) => !c.deleted)
    .map((c) => {
      const v = creditView(c);
      return [
        c.name,
        c.payment,
        c.count,
        v.paidCount,
        v.totalDue,
        v.paid,
        v.remaining,
        v.overpay,
        c.receivedDate,
        accName(c.accountId),
        c.note ?? "",
        v.isPaidOff ? "погашен" : "активен",
      ];
    });

  return toCSV(header, rows);
}

function mdCell(v: string | number): string {
  return String(v).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function mdTable(header: string[], rows: (string | number)[][]): string {
  if (!rows.length) return "_Нет данных._";
  return [
    `| ${header.map(mdCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdCell).join(" | ")} |`),
  ].join("\n");
}

function money(value: number): string {
  return formatMoney(value).replace(/\u00a0/g, " ");
}

function lastMonths(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(month, i - count + 1));
}

function sanitizeLabel(
  value: string | undefined,
  fallback: string,
  accountNames: string[]
): string {
  let text = (value || "").trim();
  for (const name of accountNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    text = text.replace(new RegExp(escapeRegExp(trimmed), "gi"), "").trim();
  }
  const hasBankName =
    /(банк|сбер|тинькофф|т-банк|альфа|втб|райффайзен|газпромбанк)/i.test(text);
  if (!text || hasBankName) return fallback;
  return text.replace(/[«»"]/g, "").replace(/\s+/g, " ").trim() || fallback;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function operationPeriod(state: AppState): string {
  const dates = state.operations
    .filter((o) => !o.deleted)
    .map((o) => o.date)
    .sort();
  if (!dates.length) return "операций нет";
  return `${dates[0]} — ${dates[dates.length - 1]}`;
}

function categoryRows(
  state: AppState,
  months: string[],
  types: "income" | "expense"
): (string | number)[][] {
  const rows = new Map<string, { total: number; byMonth: Map<string, number> }>();
  for (const op of state.operations) {
    if (op.deleted) continue;
    const isIncome = op.type === "income";
    const isExpense = op.type === "expense_personal" || op.type === "expense_work";
    if ((types === "income" && !isIncome) || (types === "expense" && !isExpense)) {
      continue;
    }
    const row = rows.get(op.category) ?? { total: 0, byMonth: new Map() };
    const month = monthKeyFromISO(op.date);
    row.total += op.amount;
    row.byMonth.set(month, (row.byMonth.get(month) ?? 0) + op.amount);
    rows.set(op.category, row);
  }
  return Array.from(rows.entries())
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], "ru"))
    .map(([category, row]) => [
      category || "Без категории",
      money(row.total),
      ...months.map((m) => (row.byMonth.get(m) ? money(row.byMonth.get(m) ?? 0) : "0 ₽")),
    ]);
}

function paymentTitle(
  item: ReturnType<typeof paymentCalendar>[number],
  accountNames: string[]
): string {
  if (item.kind === "credit") return "Платёж по кредиту";
  if (item.kind === "debt") return "Возврат долга";
  if (item.kind === "credit_card") return "Оплата кредитки";
  return sanitizeLabel(item.title, "Плановая оплата", accountNames);
}

// Обезличенный Markdown-контекст для передачи нейросети.
// Не включает названия счетов/банков, номера счетов и имена людей в долгах.
export function aiContextMarkdown(state: AppState, today: string): string {
  const currentMonth = monthKeyFromISO(today);
  const months = lastMonths(currentMonth, 6);
  const accountNames = state.accounts.map((a) => a.name);
  const liveOperations = state.operations.filter((o) => !o.deleted);
  const regularAccounts = state.accounts.filter((a) => a.kind !== "credit_card");
  const creditCards = state.accounts.filter((a) => a.kind === "credit_card");
  const credits = (state.credits ?? []).filter((c) => !c.deleted);
  const debts = (state.debts ?? []).filter((d) => !d.deleted);
  const debtTotals = debtsSummary(state);
  const creditTotals = creditInfo(state);
  const planMonths = Array.from({ length: 4 }, (_, i) => shiftMonth(currentMonth, i));
  const planned = planMonths
    .flatMap((month) => paymentCalendar(state, month, today))
    .filter((item) => !item.paid)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const monthlyRows = months.map((month) => {
    const s = monthSummary(state, month);
    return [monthLabel(month), money(s.income), money(s.expense), money(s.diff)];
  });

  const recurringRows = (state.recurring ?? [])
    .filter((r) => !r.deleted && r.active !== false)
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.category.localeCompare(b.category, "ru"))
    .map((r) => [
      r.kind === "subscription" ? "Подписка" : "Регулярная операция",
      sanitizeLabel(r.title || r.category, r.category || "Плановая оплата", accountNames),
      typeLabel(r.type),
      r.category || "Без категории",
      money(r.amount),
      `${r.dayOfMonth} число`,
      r.startMonth,
    ]);

  const creditRows = credits.map((credit, index) => {
    const view = creditView(credit);
    return [
      `Кредит ${index + 1}`,
      money(credit.received),
      money(credit.payment),
      `${view.paidCount} из ${credit.count}`,
      money(view.paid),
      money(view.remaining),
      money(view.overpay),
      credit.receivedDate || "не указано",
      view.nextPaymentDate ?? "нет",
      view.nextPaymentDate ? money(view.nextPaymentAmount) : "0 ₽",
    ];
  });

  const creditCardRows = creditCards.map((account, index) => [
    `Кредитка ${index + 1}`,
    money(creditCardDebt(state, account.id)),
    money(creditCardLimit(account)),
    money(creditCardAvailable(state, account.id)),
    account.creditPaymentDay ? `${account.creditPaymentDay} число` : "не указано",
  ]);

  const debtRows = debts
    .filter((debt) => !isDebtSettled(debt))
    .map((debt, index) => [
      `Долг ${index + 1}`,
      debt.direction === "owed_to_me" ? "Мне должны" : "Я должен",
      money(debt.amount),
      money(debtPaidTotal(debt)),
      money(debtOutstanding(debt)),
      debt.date,
      debt.dueDate ?? "без срока",
    ]);

  const plannedRows = planned.map((item) => [
    item.date,
    item.kind === "subscription"
      ? "Подписка"
      : item.kind === "credit"
        ? "Кредит"
        : item.kind === "debt"
          ? "Долг"
          : item.kind === "credit_card"
            ? "Кредитка"
            : "Регулярная",
    paymentTitle(item, accountNames),
    item.manualAmount ? "сумма вручную" : money(item.amount),
  ]);

  const budgetRows = Object.entries(state.budgets ?? {})
    .filter(([, limit]) => limit > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, limit]) => [category, money(limit)]);

  return [
    "# Финансовый контекст",
    "",
    `Дата выгрузки: ${today}.`,
    "Файл обезличен: названия счетов и банков не включены; кредиты, кредитки и долги подписаны без имен.",
    "Переводы между своими счетами не считаются доходом или расходом.",
    "",
    "## Общая картина",
    "",
    mdTable(
      ["Показатель", "Значение"],
      [
        ["Период операций", operationPeriod(state)],
        ["Операций", liveOperations.length],
        ["Обычных счетов", regularAccounts.length],
        ["Кредиток", creditCards.length],
        ["Собственные деньги на обычных счетах", money(totalOnHand(state))],
        ["Долг по кредитам/рассрочкам", money(creditTotals.remaining)],
        [
          "Долг по кредиткам",
          money(creditCards.reduce((sum, a) => sum + creditCardDebt(state, a.id), 0)),
        ],
        ["Мне должны", money(debtTotals.owedToMe)],
        ["Я должен", money(debtTotals.iOwe)],
        ["Реальная позиция", money(realPosition(state))],
      ]
    ),
    "",
    "## Последние 6 месяцев",
    "",
    mdTable(["Месяц", "Доходы", "Расходы", "Разница"], monthlyRows),
    "",
    "## Доходы по категориям",
    "",
    mdTable(["Категория", "Всего", ...months.map(monthLabel)], categoryRows(state, months, "income")),
    "",
    "## Расходы по категориям",
    "",
    mdTable(["Категория", "Всего", ...months.map(monthLabel)], categoryRows(state, months, "expense")),
    "",
    "## Бюджеты по категориям",
    "",
    mdTable(["Категория", "Лимит в месяц"], budgetRows),
    "",
    "## Регулярные и подписки",
    "",
    mdTable(
      ["Тип", "За что", "Операция", "Категория", "Сумма", "День", "С месяца"],
      recurringRows
    ),
    "",
    "## Кредиты и рассрочки",
    "",
    mdTable(
      [
        "Объект",
        "Получено",
        "Платёж",
        "Платежей внесено",
        "Выплачено",
        "Остаток",
        "Переплата",
        "Дата получения",
        "Следующий платёж",
        "Сумма следующего",
      ],
      creditRows
    ),
    "",
    "## Кредитные карты",
    "",
    mdTable(["Объект", "Долг", "Лимит", "Доступно", "День оплаты"], creditCardRows),
    "",
    "## Долги",
    "",
    mdTable(["Объект", "Направление", "Сумма", "Возвращено", "Остаток", "Дата", "Срок"], debtRows),
    "",
    "## Плановые оплаты",
    "",
    mdTable(["Дата", "Тип", "За что", "Сумма"], plannedRows),
    "",
  ].join("\n");
}

// Скачать текст файлом
export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
