import { AppState } from "./types";
import { typeLabel } from "./categories";

// Экранирование значения для CSV
function cell(v: string | number): string {
  const s = String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

  const lines = [header, ...rows].map((r) => r.map(cell).join(";"));
  // BOM, чтобы Excel корректно открыл кириллицу в UTF-8
  return "﻿" + lines.join("\r\n");
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
