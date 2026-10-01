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
import { restoreRecurringIds } from "./calc";

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
  settingsUpdatedAt?: AppState["settingsUpdatedAt"];
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
    settingsUpdatedAt: s.settingsUpdatedAt ?? 0,
  };
}

export function fromPayload(p: SyncPayload): AppState {
  return {
    accounts: p.accounts,
    operations: restoreRecurringIds(p.operations, p.recurring ?? []),
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
    // Документ старой версии метки не знает: датируем его настройки временем
    // самого документа (как сливалось раньше), иначе правка настроек на ещё не
    // обновлённом телефоне проигрывала бы всегда.
    settingsUpdatedAt: p.settingsUpdatedAt ?? p.updatedAt ?? 0,
  };
}

// Канонический вид состояния для сравнения «одно и то же или нет»: ключи
// объектов и записи (по id) отсортированы. Слияние оставляет свои записи
// первыми и дописывает чужие в конец, поэтому у двух устройств одинаковые
// данные лежат в разном порядке. При сравнении «как есть» каждое
// пробуждение приложения заново отправляло весь документ, и два устройства
// перезаписывали хаб друг за другом бесконечно.
export function canonicalJson(s: AppState): string {
  const byId = <T extends { id: string }>(xs: T[] | undefined) =>
    [...(xs ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const p = toPayload(s);
  const sorted = {
    ...p,
    accounts: byId(p.accounts),
    operations: byId(p.operations),
    transfers: byId(p.transfers),
    credits: byId(p.credits),
    recurring: byId(p.recurring),
    debts: byId(p.debts),
    templates: byId(p.templates),
  };
  return JSON.stringify(sorted, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, (value as Record<string, unknown>)[k]])
        )
      : value
  );
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
  // Настройки (цель, бюджеты, шаблоны, основной счёт) берём оттуда, где их
  // правили позже, по своей метке. При равенстве — из хаба (remote): новое
  // устройство без правок настроек не должно затирать ими таблицу. Документ
  // старой версии приложения датируется своим updatedAt (см. fromPayload).
  const settingsBase =
    (local.settingsUpdatedAt ?? 0) > (remote.settingsUpdatedAt ?? 0)
      ? local
      : remote;

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
  const settingsByAccountId = new Map(
    (settingsBase.accounts ?? []).map((a) => [a.id, a])
  );
  // Порядок счетов (порядок чипов в формах) — тоже настройка: берём его
  // оттуда же, откуда остальные настройки, новые счета дописываем в конец.
  const settingsOther = settingsBase === local ? remote : local;
  const orderedAccountIds = [
    ...(settingsBase.accounts ?? []).map((a) => a.id),
    ...(settingsOther.accounts ?? [])
      .filter((a) => !settingsByAccountId.has(a.id))
      .map((a) => a.id),
  ];
  const accounts: Account[] = [];
  const keptDeletedAccountIds = { ...deletedAccountIds };
  for (const id of orderedAccountIds) {
    const baseAcc = baseByAccountId.get(id);
    const otherAcc = otherByAccountId.get(id);
    if (!baseAcc && !otherAcc) continue;
    // Счёт без метки ни на одной стороне ни разу не правили (например,
    // «Наличные» из миграции): берём копию оттуда же, откуда настройки.
    const acc =
      baseAcc && otherAcc
        ? baseAcc.updatedAt !== undefined || otherAcc.updatedAt !== undefined
          ? (baseAcc.updatedAt ?? 0) >= (otherAcc.updatedAt ?? 0)
            ? baseAcc
            : otherAcc
          : settingsByAccountId.get(id) ?? baseAcc
        : baseAcc ?? otherAcc!;
    const deletedAt = keptDeletedAccountIds[id] ?? 0;
    const accountUpdatedAt = acc.updatedAt ?? 0;
    if (deletedAt && deletedAt >= accountUpdatedAt) continue;
    if (deletedAt && accountUpdatedAt > deletedAt) delete keptDeletedAccountIds[id];
    accounts.push(acc);
  }
  const primaryAccountId = accounts.some((a) => a.id === settingsBase.primaryAccountId)
    ? settingsBase.primaryAccountId
    : accounts[0]?.id;

  return {
    accounts,
    goal: settingsBase.goal,
    primaryAccountId,
    budgets: settingsBase.budgets ?? {},
    budgetRollover: settingsBase.budgetRollover ?? false,
    templates: settingsBase.templates ?? [],
    seededTransportTpl: settingsBase.seededTransportTpl ?? false,
    busDefaultApplied: settingsBase.busDefaultApplied ?? false,
    settingsUpdatedAt: Math.max(
      local.settingsUpdatedAt ?? 0,
      remote.settingsUpdatedAt ?? 0
    ),
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

// Ссылки по умолчанию нет. Раньше здесь была зашита ссылка первого хаба без
// токена; тот деплой удалён (отвечает 404), а нынешний хаб без токена любой
// запрос отклоняет. Ссылку с токеном вставляют в Настройках → Синхронизация.
export const DEFAULT_SYNC_URL = "";

// Та самая удалённая ссылка: на устройствах она могла остаться в сохранённых
// настройках. Считаем её «не настроено», чтобы не долбиться в 404.
export const LEGACY_DEAD_SYNC_URL =
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

// Человеческое сообщение об ошибке хаба. Хаб отвечает HTTP 200 даже на отказ,
// а причину пишет в {ok:false, error}.
export function hubErrorMessage(error: unknown): string {
  const e = String(error ?? "");
  if (e === "unauthorized") {
    return "Хаб не принял токен: проверьте ссылку синхронизации (…/exec?token=…)";
  }
  if (/lock/i.test(e)) return "Хаб занят другим устройством, повторим позже";
  return e ? `Хаб ответил ошибкой: ${e}` : "Хаб отклонил запрос";
}

// Запрос к хабу с ограничением по времени. Раунды синхронизации идут по
// одному, и один «повисший» запрос (iOS усыпил приложение, кривой Wi-Fi)
// иначе держал бы все следующие. 60 с — с запасом на 20 с ожидания
// блокировки в хабе и запись.
const HUB_TIMEOUT_MS = 60000;
async function hubFetch(input: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HUB_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("Хаб не ответил за минуту");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Загрузить состояние из таблицы (GET). Возвращает null, если таблица пустая.
export async function pull(url: string): Promise<SyncPayload | null> {
  const sep = url.includes("?") ? "&" : "?";
  const res = await hubFetch(`${url}${sep}action=load&t=${Date.now()}`, {
    method: "GET",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Ошибка загрузки: HTTP ${res.status}`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Хаб вернул не данные, а страницу: проверьте ссылку синхронизации");
  }
  if (data && typeof data === "object" && (data as { ok?: unknown }).ok === false) {
    throw new Error(hubErrorMessage((data as { error?: unknown }).error));
  }
  if (data && typeof data === "object" && (data as { empty?: unknown }).empty) return null;
  if (!isValidPayload(data)) throw new Error("Таблица вернула неверные данные");
  return data;
}

// Сохранить состояние в таблицу (POST text/plain — чтобы не было CORS-preflight)
export async function push(url: string, payload: SyncPayload): Promise<void> {
  const res = await hubFetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Ошибка сохранения: HTTP ${res.status}`);
  // Хаб отвечает HTTP 200 и на отказ, поэтому успех — только явный {ok:true}.
  // Раньше исключение бросалось внутри try и тут же глоталось, и отказ хаба
  // (неверный токен, занятая блокировка) показывался как «Сохранено».
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Хаб ответил не JSON: сохранение не подтверждено");
  }
  if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
    throw new Error(hubErrorMessage((data as { error?: unknown } | null)?.error));
  }
}
