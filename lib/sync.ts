import {
  AppState,
  Operation,
  Debt,
  Credit,
  CreditConfig,
  RecurringRule,
  Transfer,
  Account,
} from "./types";

// Формат данных, которыми приложение обменивается с Google-таблицей
export interface SyncPayload {
  version: 1;
  updatedAt: number;
  accounts: AppState["accounts"];
  operations: AppState["operations"];
  transfers?: AppState["transfers"];
  credit?: CreditConfig; // легаси: один кредит (для старых данных)
  credits?: Credit[];
  goal: AppState["goal"];
  primaryAccountId?: AppState["primaryAccountId"];
  budgets?: AppState["budgets"];
  budgetRollover?: AppState["budgetRollover"];
  templates?: AppState["templates"];
  seededTransportTpl?: AppState["seededTransportTpl"];
  busDefaultApplied?: AppState["busDefaultApplied"];
  recurring?: AppState["recurring"];
  debts?: AppState["debts"];
  deletedAccountIds?: AppState["deletedAccountIds"];
}

// Преобразовать легаси-кредит (один) в новую сущность
export function legacyCreditToCredit(c: CreditConfig): Credit {
  return {
    id: "credit-main",
    name: "Кредит",
    received: c.received ?? 0,
    receivedDate: c.receivedDate ?? "",
    payment: c.payment ?? 0,
    count: c.count ?? 0,
    paymentDates: c.paymentDates ?? [],
    accountId: "",
    receivedAffectsBalance: false,
    payments: [],
    updatedAt: 0,
  };
}

// Получить список кредитов из данных любого формата (новый/легаси/пусто)
export function resolveCredits(
  credits: Credit[] | undefined,
  credit: CreditConfig | undefined
): Credit[] {
  if (Array.isArray(credits)) return credits; // новый формат — уважаем даже пустой
  if (credit) return [legacyCreditToCredit(credit)]; // легаси один кредит
  return [];
}

export function toPayload(s: AppState): SyncPayload {
  return {
    version: 1,
    updatedAt: s.updatedAt,
    accounts: s.accounts,
    operations: s.operations,
    transfers: s.transfers ?? [],
    credits: s.credits ?? [],
    goal: s.goal,
    primaryAccountId: s.primaryAccountId,
    budgets: s.budgets ?? {},
    budgetRollover: s.budgetRollover ?? false,
    templates: s.templates ?? [],
    seededTransportTpl: s.seededTransportTpl ?? false,
    busDefaultApplied: s.busDefaultApplied ?? false,
    recurring: s.recurring ?? [],
    debts: s.debts ?? [],
    deletedAccountIds: s.deletedAccountIds ?? {},
  };
}

export function fromPayload(p: SyncPayload): AppState {
  return {
    accounts: p.accounts,
    operations: p.operations,
    transfers: p.transfers ?? [],
    credits: resolveCredits(p.credits, p.credit),
    goal: p.goal,
    primaryAccountId: p.primaryAccountId,
    budgets: p.budgets ?? {},
    budgetRollover: p.budgetRollover ?? false,
    templates: p.templates ?? [],
    seededTransportTpl: p.seededTransportTpl ?? false,
    busDefaultApplied: p.busDefaultApplied ?? false,
    recurring: p.recurring ?? [],
    debts: p.debts ?? [],
    deletedAccountIds: p.deletedAccountIds ?? {},
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

  // Переводы сливаем по id: побеждает более свежая версия.
  const transferById = new Map<string, Transfer>();
  for (const t of local.transfers ?? []) transferById.set(t.id, t);
  for (const t of remote.transfers ?? []) {
    const cur = transferById.get(t.id);
    if (!cur) transferById.set(t.id, t);
    else transferById.set(t.id, (t.updatedAt ?? 0) >= (cur.updatedAt ?? 0) ? t : cur);
  }
  const transfers = Array.from(transferById.values());

  // Долги сливаем так же по id: побеждает более свежая версия (по updatedAt)
  const debtById = new Map<string, Debt>();
  for (const d of local.debts ?? []) debtById.set(d.id, d);
  for (const d of remote.debts ?? []) {
    const cur = debtById.get(d.id);
    if (!cur) debtById.set(d.id, d);
    else debtById.set(d.id, (d.updatedAt ?? 0) >= (cur.updatedAt ?? 0) ? d : cur);
  }
  const debts = Array.from(debtById.values());

  // Кредиты сливаем по id: побеждает более свежая версия (по updatedAt)
  const creditById = new Map<string, Credit>();
  for (const c of local.credits ?? []) creditById.set(c.id, c);
  for (const c of remote.credits ?? []) {
    const cur = creditById.get(c.id);
    if (!cur) creditById.set(c.id, c);
    else creditById.set(c.id, (c.updatedAt ?? 0) >= (cur.updatedAt ?? 0) ? c : cur);
  }
  const credits = Array.from(creditById.values());

  // Регулярные правила сливаем по id (побеждает более свежая версия)
  const recById = new Map<string, RecurringRule>();
  for (const r of local.recurring ?? []) recById.set(r.id, r);
  for (const r of remote.recurring ?? []) {
    const cur = recById.get(r.id);
    if (!cur) recById.set(r.id, r);
    else recById.set(r.id, (r.updatedAt ?? 0) >= (cur.updatedAt ?? 0) ? r : cur);
  }
  const recurring = Array.from(recById.values());

  const remoteNewer = (remote.updatedAt ?? 0) > (local.updatedAt ?? 0);
  const base = remoteNewer ? remote : local;
  const other = remoteNewer ? local : remote;

  const deletedAccountIds = {
    ...(local.deletedAccountIds ?? {}),
    ...(remote.deletedAccountIds ?? {}),
  };
  for (const [id, ts] of Object.entries(local.deletedAccountIds ?? {})) {
    deletedAccountIds[id] = Math.max(ts, deletedAccountIds[id] ?? 0);
  }
  for (const [id, ts] of Object.entries(remote.deletedAccountIds ?? {})) {
    deletedAccountIds[id] = Math.max(ts, deletedAccountIds[id] ?? 0);
  }

  // Счета объединяем по id. Для старых данных без updatedAt сохраняем прежнюю
  // логику: побеждает версия из более свежего документа. Для новых данных
  // account.updatedAt позволяет tombstone удаления не воскресать при sync.
  const baseByAccountId = new Map(base.accounts.map((a) => [a.id, a]));
  const otherByAccountId = new Map((other.accounts ?? []).map((a) => [a.id, a]));
  const orderedAccountIds = [
    ...base.accounts.map((a) => a.id),
    ...(other.accounts ?? [])
      .filter((a) => !baseByAccountId.has(a.id))
      .map((a) => a.id),
  ];
  const accounts: Account[] = [];
  const keptDeletedAccountIds = { ...deletedAccountIds };
  for (const id of orderedAccountIds) {
    const baseAcc = baseByAccountId.get(id);
    const otherAcc = otherByAccountId.get(id);
    if (!baseAcc && !otherAcc) continue;
    const acc =
      baseAcc && otherAcc
        ? baseAcc.updatedAt !== undefined || otherAcc.updatedAt !== undefined
          ? (baseAcc.updatedAt ?? 0) >= (otherAcc.updatedAt ?? 0)
            ? baseAcc
            : otherAcc
          : baseAcc
        : baseAcc ?? otherAcc!;
    const deletedAt = keptDeletedAccountIds[id] ?? 0;
    const accountUpdatedAt = acc.updatedAt ?? 0;
    if (deletedAt && deletedAt >= accountUpdatedAt) continue;
    if (deletedAt && accountUpdatedAt > deletedAt) delete keptDeletedAccountIds[id];
    accounts.push(acc);
  }
  const primaryAccountId = accounts.some((a) => a.id === base.primaryAccountId)
    ? base.primaryAccountId
    : accounts[0]?.id;

  return {
    accounts,
    goal: base.goal,
    primaryAccountId,
    budgets: base.budgets ?? {},
    budgetRollover: base.budgetRollover ?? false,
    templates: base.templates ?? [],
    seededTransportTpl: base.seededTransportTpl ?? false,
    busDefaultApplied: base.busDefaultApplied ?? false,
    recurring,
    operations,
    transfers,
    debts,
    credits,
    deletedAccountIds: keptDeletedAccountIds,
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
