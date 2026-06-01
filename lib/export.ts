import { AppState } from "./types";
import { typeLabel } from "./categories";
import {
  debtOutstanding,
  debtPaidTotal,
  isDebtSettled,
  creditView,
} from "./calc";

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
