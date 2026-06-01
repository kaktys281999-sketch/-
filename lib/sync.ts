import { AppState, Operation } from "./types";

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

// Слияние двух состояний без потери данных.
// Операции сливаются по id (выигрывает более свежая версия, удаление = надгробие).
// Счета/кредит/цель — синглтоны, берутся из более свежего по updatedAt документа.
export function mergeStates(local: AppState, remote: AppState): AppState {
  const byId = new Map<string, Operation>();
  for (const op of local.operations) byId.set(op.id, op);
  for (const op of remote.operations) {
    const cur = byId.get(op.id);
    if (!cur) {
      byId.set(op.id, op);
    } else {
      // более позднее изменение операции побеждает (удаление учитывается через updatedAt)
      const a = cur.updatedAt ?? 0;
      const b = op.updatedAt ?? 0;
      byId.set(op.id, b >= a ? op : cur);
    }
  }
  const operations = Array.from(byId.values());

  const remoteNewer = (remote.updatedAt ?? 0) > (local.updatedAt ?? 0);
  const base = remoteNewer ? remote : local;

  return {
    accounts: base.accounts,
    credit: base.credit,
    goal: base.goal,
    operations,
    updatedAt: Math.max(local.updatedAt ?? 0, remote.updatedAt ?? 0),
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
