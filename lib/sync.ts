import { AppState } from "./types";

// Формат данных, которыми приложение обменивается с Google-таблицей
export interface SyncPayload {
  version: 1;
  updatedAt: number;
  accounts: AppState["accounts"];
  operations: AppState["operations"];
  credit: AppState["credit"];
  goal: AppState["goal"];
}

export function toPayload(s: AppState): SyncPayload {
  return {
    version: 1,
    updatedAt: s.updatedAt,
    accounts: s.accounts,
    operations: s.operations,
    credit: s.credit,
    goal: s.goal,
  };
}

export function fromPayload(p: SyncPayload): AppState {
  return {
    accounts: p.accounts,
    operations: p.operations,
    credit: p.credit,
    goal: p.goal,
    updatedAt: p.updatedAt ?? 0,
  };
}

// Конфигурация синхронизации (хранится на устройстве, в таблицу НЕ уходит)
export interface SyncConfig {
  url: string;
  auto: boolean;
}

// Ссылка веб-приложения Google Apps Script по умолчанию — зашита в приложение,
// чтобы синхронизация работала без ручного ввода в настройках.
export const DEFAULT_SYNC_URL =
  "https://script.google.com/macros/s/AKfycbxEUm8i2lhjmVzhKVFtdatnH7rPrParDsTaty3yaN39JXhxRWGbq-LL0KxVm17qYvTA/exec";

export const EMPTY_SYNC: SyncConfig = { url: DEFAULT_SYNC_URL, auto: true };

function isValidPayload(d: unknown): d is SyncPayload {
  return (
    !!d &&
    typeof d === "object" &&
    Array.isArray((d as SyncPayload).accounts) &&
    Array.isArray((d as SyncPayload).operations)
  );
}

// Загрузить состояние из таблицы (GET). Возвращает null, если таблица пустая.
export async function pull(url: string): Promise<SyncPayload | null> {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}action=load&t=${Date.now()}`, {
    method: "GET",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Ошибка загрузки: HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.empty) return null;
  if (!isValidPayload(data)) throw new Error("Таблица вернула неверные данные");
  return data;
}

// Сохранить состояние в таблицу (POST text/plain — чтобы не было CORS-preflight)
export async function push(url: string, payload: SyncPayload): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Ошибка сохранения: HTTP ${res.status}`);
  // Apps Script отвечает JSON {ok:true}; проверим мягко
  try {
    const data = await res.json();
    if (data && data.ok === false) {
      throw new Error(data.error || "Таблица отклонила сохранение");
    }
  } catch {
    // тело не JSON — для POST это допустимо, считаем успехом по HTTP 200
  }
}
