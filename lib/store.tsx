"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import {
  AppState,
  Operation,
  Account,
  AccountKind,
  Goal,
  Template,
  Debt,
  DebtPayment,
  Credit,
  CreditPayment,
  RecurringRule,
  Transfer,
} from "./types";
import { todayISO, generatePaymentDates, monthKey } from "./format";
import {
  dueRecurringOperations,
  restoreRecurringIds,
  reconcileAccount,
  accountWithoutReconciliation,
} from "./calc";
// Денежные селекторы живут в ./calc (без React) — реэкспортируем для потребителей
export * from "./calc";
import {
  SyncConfig,
  EMPTY_SYNC,
  DEFAULT_SYNC_URL,
  LEGACY_DEAD_SYNC_URL,
  toPayload,
  fromPayload,
  mergeStates,
  canonicalJson,
  legacyCreditToCredit,
  pull,
  push,
} from "./sync";
import { ensureAlfaAccounts } from "./accounts";

const STORAGE_KEY = "finance-tracker-v1";
const SYNC_KEY = "finance-tracker-sync-v1";

// Быстрые шаблоны видов транспорта: одна категория «Проезд / транспорт»,
// вид — в заметке, сумма спрашивается при добавлении. Детерминированные id.
function transportTemplates(accountId: string): Template[] {
  return [
    { id: "tpl-taxi", title: "Такси", type: "expense_personal", category: "Проезд / транспорт", amount: 0, accountId, note: "Такси" },
    { id: "tpl-scooter", title: "Самокат", type: "expense_personal", category: "Проезд / транспорт", amount: 0, accountId, note: "Самокат" },
    { id: "tpl-bus", title: "Автобус", type: "expense_personal", category: "Проезд / транспорт", amount: 55, accountId, note: "Автобус" },
  ];
}

// Начальное состояние нового устройства. Намеренно пустое: раньше здесь были
// балансы и кредит из ТЗ, и новое устройство без синхронизации показывало их как
// настоящие, а кнопка «Сохранить» могла залить их в таблицу. Настоящие счета
// приходят из хаба при первой синхронизации.
const INITIAL_STATE: AppState = {
  accounts: [{ id: "cash", name: "Наличные", baseBalance: 0 }],
  operations: [],
  transfers: [],
  credits: [],
  goal: { name: "", target: 0, saved: 0 },
  primaryAccountId: "cash",
  budgets: {},
  budgetRollover: false,
  templates: transportTemplates("cash"),
  seededTransportTpl: true,
  busDefaultApplied: true,
  recurring: [],
  debts: [],
  updatedAt: 0,
  // явный 0: настройки нового устройства — «не правились никогда»
  settingsUpdatedAt: 0,
};

export type SyncStatusKind = "idle" | "syncing" | "ok" | "error" | "offline";

export interface SyncState {
  status: SyncStatusKind;
  message: string;
  lastSync: number | null;
  // Сколько раундов подряд не удалось. Google-хаб время от времени «зависает»
  // на минуту и отвечает 404; одиночный сбой проходит сам при повторе, и
  // пугать им незачем — плашка на «Сводке» показывается со второго подряд.
  failures?: number;
}

interface StoreContextValue {
  state: AppState;
  addOperation: (op: Omit<Operation, "id">) => void;
  updateOperation: (id: string, op: Omit<Operation, "id">) => void;
  deleteOperation: (id: string) => void;
  restoreOperation: (id: string) => void;
  setAccountBalance: (id: string, currentBalance: number) => void;
  addAccount: (
    name: string,
    opts?: {
      baseBalance?: number;
      kind?: AccountKind;
      creditPaymentDay?: number;
      creditLimit?: number;
      makePrimary?: boolean;
    }
  ) => void;
  updateAccount: (id: string, patch: Partial<Omit<Account, "id">>) => void;
  renameAccount: (id: string, name: string) => void;
  deleteAccount: (id: string) => void;
  addTransfer: (t: Omit<Transfer, "id" | "updatedAt">) => void;
  deleteTransfer: (id: string) => void;
  updateGoal: (goal: Partial<Goal>) => void;
  // Кредиты
  addCredit: (
    c: Omit<Credit, "id" | "payments" | "paymentDates" | "updatedAt">
  ) => void;
  updateCredit: (id: string, patch: Partial<Omit<Credit, "id">>) => void;
  deleteCredit: (id: string) => void;
  addCreditPayment: (creditId: string, payment: Omit<CreditPayment, "id">) => void;
  deleteCreditPayment: (creditId: string, paymentId: string) => void;
  setPrimaryAccount: (id: string) => void;
  setBudget: (category: string, limit: number) => void;
  setBudgetRollover: (on: boolean) => void;
  addTemplate: (t: Omit<Template, "id">) => void;
  deleteTemplate: (id: string) => void;
  // Регулярные операции
  addRecurring: (r: Omit<RecurringRule, "id" | "updatedAt">) => void;
  updateRecurring: (id: string, patch: Partial<Omit<RecurringRule, "id">>) => void;
  deleteRecurring: (id: string) => void;
  paySubscription: (
    ruleId: string,
    opts?: { date?: string; accountId?: string; amount?: number; month?: string }
  ) => void;
  unpaySubscription: (ruleId: string, month: string) => void;
  // Долги
  addDebt: (d: Omit<Debt, "id" | "payments">) => void;
  updateDebt: (id: string, patch: Partial<Omit<Debt, "id">>) => void;
  deleteDebt: (id: string) => void;
  addDebtPayment: (debtId: string, payment: Omit<DebtPayment, "id">) => void;
  deleteDebtPayment: (debtId: string, paymentId: string) => void;
  settleDebt: (debtId: string, accountId: string) => void;
  resetAll: () => void;
  // Синхронизация с Google-таблицей
  sync: SyncConfig;
  syncState: SyncState;
  setSyncConfig: (partial: Partial<SyncConfig>) => void;
  pullNow: () => Promise<void>;
  pushNow: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

// Гарантируем наличие счёта «Наличные» (миграция старых данных без него).
// Не дублируем, если он уже есть по id или по названию.
function ensureCashAccount(
  accounts: Account[],
  deletedAccountIds: Record<string, number> = {}
): Account[] {
  const has = accounts.some(
    (a) =>
      !deletedAccountIds[a.id] &&
      (a.id === "cash" || a.name.trim().toLowerCase() === "наличные")
  );
  const hasAnyAccount = accounts.some((a) => !deletedAccountIds[a.id]);
  if (!hasAnyAccount) {
    return [{ id: "cash", name: "Наличные", baseBalance: 0 }];
  }
  if (has || deletedAccountIds.cash) return accounts;
  return [...accounts, { id: "cash", name: "Наличные", baseBalance: 0 }];
}

function loadState(): AppState {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    return parseStoredState(raw);
  } catch {
    return INITIAL_STATE;
  }
}

// Разбор сохранённого состояния с аддитивными миграциями. Используется и при
// запуске, и когда соседняя вкладка записала свои данные. Бросает исключение
// на битом JSON.
function parseStoredState(raw: string): AppState {
  const parsed = JSON.parse(raw) as Partial<AppState>;
  // Разовая подсадка шаблонов транспорта (только если ещё не делали —
  // удалённые пользователем шаблоны не возвращаем).
  const primary =
    parsed.primaryAccountId ?? INITIAL_STATE.primaryAccountId ?? "yandex";
  let templates = parsed.templates ?? [];
  let seededTransportTpl = parsed.seededTransportTpl ?? false;
  if (!seededTransportTpl) {
    const ids = new Set(templates.map((t) => t.id));
    templates = [
      ...templates,
      ...transportTemplates(primary).filter((t) => !ids.has(t.id)),
    ];
    seededTransportTpl = true;
  }
  // Разовая установка суммы автобуса по умолчанию (55 ₽), если ещё «спросить»
  let busDefaultApplied = parsed.busDefaultApplied ?? false;
  if (!busDefaultApplied) {
    templates = templates.map((t) =>
      t.id === "tpl-bus" && t.amount === 0 ? { ...t, amount: 55 } : t
    );
    busDefaultApplied = true;
  }
  const deletedAccountIds = parsed.deletedAccountIds ?? {};
  const accounts = ensureCashAccount(
    parsed.accounts ?? INITIAL_STATE.accounts,
    deletedAccountIds
  );
  const primaryAccountId = accounts.some((a) => a.id === parsed.primaryAccountId)
    ? parsed.primaryAccountId
    : accounts[0]?.id ?? INITIAL_STATE.primaryAccountId;
  // Мягкое слияние, чтобы новые поля не ломали старые данные
  return {
    accounts,
    operations: restoreRecurringIds(
      parsed.operations ?? INITIAL_STATE.operations,
      parsed.recurring ?? []
    ),
    transfers: parsed.transfers ?? [],
    credits: migrateCredits(parsed),
    goal: { ...INITIAL_STATE.goal, ...parsed.goal },
    primaryAccountId,
    budgets: parsed.budgets ?? {},
    budgetRollover: parsed.budgetRollover ?? false,
    templates,
    seededTransportTpl,
    busDefaultApplied,
    recurring: parsed.recurring ?? [],
    debts: parsed.debts ?? [],
    deletedAccountIds,
    updatedAt: parsed.updatedAt ?? 0,
    // сохранено старой версией — датируем настройки временем документа
    settingsUpdatedAt: parsed.settingsUpdatedAt ?? parsed.updatedAt ?? 0,
  };
}

// Кредиты из сохранённых данных с миграцией легаси-формата (один кредит).
function migrateCredits(p: Partial<AppState>): Credit[] {
  if (Array.isArray(p.credits)) return p.credits; // новый формат (даже пустой)
  if (p.credit) {
    return [
      {
        ...legacyCreditToCredit(p.credit),
        accountId: p.primaryAccountId ?? "yandex",
      },
    ];
  }
  return INITIAL_STATE.credits; // нет данных вовсе — стартовый набор
}

function loadSyncConfig(): SyncConfig {
  if (typeof window === "undefined") return EMPTY_SYNC;
  try {
    const raw = window.localStorage.getItem(SYNC_KEY);
    if (!raw) return EMPTY_SYNC;
    const parsed = JSON.parse(raw);
    // если ссылка не задана — подставляем зашитую по умолчанию (пустую);
    // удалённую ссылку первого хаба считаем «не настроено»
    const stored = parsed.url ? String(parsed.url).trim() : "";
    const url = stored && stored !== LEGACY_DEAD_SYNC_URL ? stored : DEFAULT_SYNC_URL;
    return { ...EMPTY_SYNC, ...parsed, url };
  } catch {
    return EMPTY_SYNC;
  }
}

// Разовое заведение счетов Альфа-Банка на этом устройстве (флаг локальный).
const ALFA_SEEDED_KEY = "finance-alfa-seeded-v1";
function alfaSeeded(): boolean {
  try {
    return window.localStorage.getItem(ALFA_SEEDED_KEY) === "1";
  } catch {
    return true; // хранилище недоступно — лучше не заводить, чем заводить на каждом запуске
  }
}
function markAlfaSeeded(): void {
  try {
    window.localStorage.setItem(ALFA_SEEDED_KEY, "1");
  } catch {
    // игнорируем
  }
}
function withAlfa(s: AppState, on: boolean): AppState {
  if (!on) return s;
  const accounts = ensureAlfaAccounts(s.accounts, s.deletedAccountIds ?? {});
  return accounts === s.accounts ? s : { ...s, accounts };
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [sync, setSync] = useState<SyncConfig>(EMPTY_SYNC);
  const [syncState, setSyncState] = useState<SyncState>({
    status: "idle",
    message: "",
    lastSync: null,
  });

  // Ссылки на актуальные значения для эффектов/обработчиков
  const stateRef = useRef(state);
  stateRef.current = state;
  const syncRef = useRef(sync);
  syncRef.current = sync;
  // Снимок (JSON формата хаба), о котором устройство и хаб уже договорились.
  // Состояние, совпадающее с ним, отправлять незачем.
  const lastSyncedJson = useRef<string | null>(null);
  // Раунды синхронизации идут строго по одному; лишние просьбы склеиваются.
  const syncChain = useRef<Promise<void>>(Promise.resolve());
  const roundQueued = useRef(false);
  const lastRoundAt = useRef(0);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresInRow = useRef(0);
  // Первый раунд после запуска закончился (успешно или нет). До него не
  // догенерируем регулярные операции: правило могли удалить на другом устройстве.
  const [firstSyncDone, setFirstSyncDone] = useState(false);

  // Один раунд: забрать хаб → слить с локальным → применить → отправить итог.
  // Раньше устройство отправляло своё состояние целиком, не заглядывая в хаб,
  // и устаревшая вкладка или второй телефон молча затирали чужие операции.
  const runRound = async (): Promise<void> => {
    const url = syncRef.current.url.trim();
    if (!url) return;
    lastRoundAt.current = Date.now();
    setSyncState((p) => ({ ...p, status: "syncing", message: "Синхронизация…" }));
    try {
      const remote = await pull(url);
      const local = stateRef.current;
      // Счета Альфы заводим на уже слитом состоянии: так видны удаления и
      // имена, пришедшие из таблицы.
      const seedAlfa = !alfaSeeded();
      let merged = withAlfa(local, seedAlfa);
      let remoteJson: string | null = null;
      if (remote) {
        const remoteState = fromPayload(remote);
        remoteJson = canonicalJson(remoteState);
        merged = withAlfa(mergeStates(local, remoteState), seedAlfa);
        if (canonicalJson(merged) !== canonicalJson(local)) {
          // Функциональное обновление: правки, сделанные, пока шёл запрос,
          // не затираются, а сливаются с пришедшим из хаба.
          setState((cur) => withAlfa(mergeStates(cur, remoteState), seedAlfa));
        }
      } else if (merged !== local) {
        setState((cur) => withAlfa(cur, seedAlfa));
      }
      const json = canonicalJson(merged);
      // Хаб уже содержит то же самое (порядок записей не важен) — не пишем зря.
      if (json !== remoteJson) await push(url, toPayload(merged));
      if (seedAlfa) markAlfaSeeded();
      lastSyncedJson.current = json;
      failuresInRow.current = 0;
      setSyncState({ status: "ok", message: "Синхронизировано", lastSync: Date.now(), failures: 0 });
    } catch (e) {
      failuresInRow.current += 1;
      setSyncState({
        status: "error",
        message: e instanceof Error ? e.message : "Ошибка синхронизации",
        lastSync: null,
        failures: failuresInRow.current,
      });
      // Повторим сами, с нарастающей паузой: 15 с, 30 с, минута… до 5 минут.
      // Раньше неудачная отправка не повторялась вовсе, а частые повторы при
      // долгой поломке (неверный токен) зря расходовали бы квоту Google.
      if (syncRef.current.auto && !retryTimer.current) {
        const delay = Math.min(300000, 15000 * 2 ** (failuresInRow.current - 1));
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          void requestRound();
        }, delay);
      }
    }
  };

  const requestRound = (): Promise<void> => {
    if (roundQueued.current) return syncChain.current;
    roundQueued.current = true;
    syncChain.current = syncChain.current.then(async () => {
      roundQueued.current = false;
      await runRound();
    });
    return syncChain.current;
  };

  // Загрузка локальных данных и конфигурации синхронизации
  useEffect(() => {
    setState(loadState());
    setSync(loadSyncConfig());
    setHydrated(true);
  }, []);

  // Сохранение в localStorage. Пишем, только если содержимое изменилось: иначе
  // две открытые вкладки перекидывали бы друг другу одно и то же бесконечно.
  useEffect(() => {
    if (!hydrated) return;
    const json = JSON.stringify(state);
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== json) {
        window.localStorage.setItem(STORAGE_KEY, json);
      }
    } catch {
      // переполнение или приватный режим — данные остаются в памяти и в хабе
    }
  }, [state, hydrated]);

  // Другая вкладка этого же браузера сохранила свои данные — сливаем их с
  // нашими. Раньше вкладка со старым состоянием затирала операции, добавленные
  // в соседней, и в localStorage, и в хабе.
  useEffect(() => {
    if (!hydrated) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      let other: AppState;
      try {
        other = parseStoredState(e.newValue);
      } catch {
        return;
      }
      setState((cur) => {
        // Соседняя вкладка — «удалённая» сторона, но при равных метках
        // оставляем свои настройки: иначе две вкладки могли бы бесконечно
        // меняться ими. К таблице обе вкладки и так сойдутся своими раундами.
        const merged = mergeStates(other, cur);
        return canonicalJson(merged) === canonicalJson(cur) ? cur : merged;
      });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrated]);

  // Догенерировать операции по регулярным правилам (после первой синхронизации
  // и при смене правил). Метку времени документа не трогаем: эти операции
  // одинаковы на всех устройствах, а свежая метка заставила бы устаревшие
  // настройки этого устройства победить при слиянии.
  useEffect(() => {
    if (!hydrated || !firstSyncDone) return;
    setState((s) => {
      const due = dueRecurringOperations(
        s.recurring ?? [],
        new Set(s.operations.map((o) => o.id)),
        monthKey(new Date()),
        todayISO()
      );
      if (!due.length) return s;
      return { ...s, operations: [...s.operations, ...due] };
    });
  }, [hydrated, firstSyncDone, state.recurring]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
  }, [sync, hydrated]);

  // Ручная синхронизация (кнопка в шапке и в настройках). Всегда через слияние:
  // «просто отправить своё» больше не бывает.
  const pullNow = (): Promise<void> => requestRound();
  const pushNow = (): Promise<void> => requestRound();

  // При запуске: если настроена авто-синхронизация — сразу раунд
  useEffect(() => {
    if (!hydrated) return;
    if (sync.url.trim() && sync.auto) {
      void requestRound().finally(() => setFirstSyncDone(true));
    } else {
      // Синхронизации нет — заводим счета Альфы сразу, по локальным данным.
      if (!alfaSeeded()) {
        setState((cur) => withAlfa(cur, true));
        markAlfaSeeded();
      }
      setFirstSyncDone(true);
    }
    // запускаем один раз после гидрации
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Вернулись в приложение или появилась сеть — подтянуть чужие изменения.
  // PWA на телефоне живёт днями, и без этого видела бы только свои правки.
  useEffect(() => {
    if (!hydrated) return;
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      if (!syncRef.current.url.trim() || !syncRef.current.auto) return;
      if (Date.now() - lastRoundAt.current < 20000) return;
      void requestRound();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Авто-синхронизация изменений (с задержкой). Состояние, о котором хаб уже
  // знает (в том числе только что пришедшее из него), повторно не отправляем.
  useEffect(() => {
    if (!hydrated) return;
    if (!sync.url.trim() || !sync.auto) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      if (canonicalJson(stateRef.current) === lastSyncedJson.current) return;
      void requestRound();
    }, 1500);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated, sync.auto]);

  const value = useMemo<StoreContextValue>(() => {
    const touch = <T extends Partial<AppState>>(patch: T) => ({
      ...patch,
      updatedAt: Date.now(),
    });
    // Правка настроек: отдельная метка, по ней настройки побеждают при слиянии.
    const touchSettings = <T extends Partial<AppState>>(patch: T) => {
      const now = Date.now();
      return { ...patch, updatedAt: now, settingsUpdatedAt: now };
    };

    // Перевод без получателя или «сам себе» деньги не двигает, а в списке
    // выглядит как настоящий. Такие не записываем ни из какой формы.
    const isBrokenTransfer = (op: Omit<Operation, "id">) =>
      op.type === "transfer" &&
      (!op.toAccountId || op.toAccountId === op.accountId);

    const addOperation = (op: Omit<Operation, "id">) => {
      if (isBrokenTransfer(op)) return;
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          operations: [...s.operations, { ...op, id: uid(), updatedAt: now }],
        }),
      }));
    };

    const updateOperation = (id: string, op: Omit<Operation, "id">) => {
      if (isBrokenTransfer(op)) return;
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          operations: s.operations.map((o) =>
            o.id === id
              ? {
                  ...op,
                  // Форма не знает о связи с подпиской. Без этого любое
                  // редактирование оплаты подписки выкидывало её из истории
                  // и из «потрачено на подписки».
                  recurringId: op.recurringId ?? o.recurringId,
                  id,
                  updatedAt: now,
                }
              : o
          ),
        }),
      }));
    };

    // Удаление — надгробие (tombstone), чтобы синхронизация не «воскрешала» запись
    const deleteOperation = (id: string) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          operations: s.operations.map((o) =>
            o.id === id ? { ...o, deleted: true, updatedAt: now } : o
          ),
        }),
      }));
    };

    // Отмена удаления — снимаем надгробие
    const restoreOperation = (id: string) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          operations: s.operations.map((o) =>
            o.id === id ? { ...o, deleted: false, updatedAt: now } : o
          ),
        }),
      }));
    };

    // Ручное редактирование баланса: текущий = base + сумма дельт.
    // Подбираем base так, чтобы текущий стал равен введённому значению.
    // Ввод остатка = сверка с банком на сегодня (см. reconcileAccount): правка
    // старых записей задним числом остаток после неё не сдвигает.
    const setAccountBalance = (id: string, value: number) => {
      setState((s) => {
        const now = Date.now();
        const fields = reconcileAccount(s, id, value, todayISO(), now);
        return {
          ...s,
          ...touch({
            accounts: s.accounts.map((a) =>
              a.id === id ? { ...a, ...fields, updatedAt: now } : a
            ),
          }),
        };
      });
    };

    const clampPaymentDay = (day?: number) =>
      Math.min(31, Math.max(1, Math.round(day || 1)));

    // Добавить новый счёт. Для кредитки baseBalance обычно отрицательный:
    // текущий долг 5000 ₽ хранится как -5000 ₽.
    const addAccount = (
      name: string,
      opts?: {
        baseBalance?: number;
        kind?: AccountKind;
        creditPaymentDay?: number;
        creditLimit?: number;
        makePrimary?: boolean;
      }
    ) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setState((s) => {
        const now = Date.now();
        const kind = opts?.kind === "credit_card" ? "credit_card" : undefined;
        const id = uid();
        const account: Account = {
          id,
          name: trimmed,
          baseBalance: opts?.baseBalance ?? 0,
          kind,
          creditPaymentDay:
            kind === "credit_card"
              ? clampPaymentDay(opts?.creditPaymentDay)
              : undefined,
          creditLimit:
            kind === "credit_card" ? Math.max(0, opts?.creditLimit ?? 0) : undefined,
          updatedAt: now,
        };
        return {
          ...s,
          ...(opts?.makePrimary ? touchSettings : touch)({
            accounts: [...s.accounts, account],
            primaryAccountId: opts?.makePrimary ? id : s.primaryAccountId,
          }),
        };
      });
    };

    const updateAccount = (id: string, patch: Partial<Omit<Account, "id">>) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          accounts: s.accounts.map((a) => {
            if (a.id !== id) return a;
            const next: Account = { ...a, ...patch, updatedAt: now };
            if (patch.name !== undefined) {
              next.name = patch.name.trim() || a.name;
            }
            if (next.kind === "credit_card") {
              next.creditPaymentDay = clampPaymentDay(next.creditPaymentDay);
              next.creditLimit = Math.max(0, next.creditLimit ?? 0);
            } else {
              // Лимит и день оплаты оставляем: у обычного счёта они ни на что
              // не влияют, а при случайном двойном нажатии «Кредитка»
              // вернутся как были, а не сбросятся на 25-е число и 0 ₽.
              next.kind = undefined;
            }
            return next;
          }),
        }),
      }));
    };

    // Переименовать счёт (id не меняется — операции не осиротеют)
    const renameAccount = (id: string, name: string) => {
      if (!name.trim()) return;
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          accounts: s.accounts.map((a) =>
            a.id === id ? { ...a, name: name.trim(), updatedAt: now } : a
          ),
        }),
      }));
    };

    const deleteAccount = (id: string) => {
      const now = Date.now();
      setState((prev) => {
        // Записи удаляемого счёта переезжают на другой со своими датами, поэтому
        // сверку у обоих снимаем, сохранив текущие остатки (иначе переехавшие
        // старые записи оказались бы «учтены» чужой сверкой).
        const s = {
          ...prev,
          accounts: prev.accounts.map((a) => accountWithoutReconciliation(prev, a)),
        };
        const account = s.accounts.find((a) => a.id === id);
        if (!account || s.accounts.length <= 1) return prev;
        const replacementId =
          (s.primaryAccountId &&
          s.primaryAccountId !== id &&
          s.accounts.some((a) => a.id === s.primaryAccountId)
            ? s.primaryAccountId
            : undefined) ??
          s.accounts.find((a) => a.id !== id && a.kind !== "credit_card")?.id ??
          s.accounts.find((a) => a.id !== id)?.id;
        if (!replacementId) return prev;

        const remap = (accountId: string) =>
          accountId === id ? replacementId : accountId;

        const operations = s.operations.map((o) => {
          const touches = o.accountId === id || o.toAccountId === id;
          if (!touches) return o;
          const accountId = remap(o.accountId);
          const toAccountId = o.toAccountId ? remap(o.toAccountId) : o.toAccountId;
          const becomesSelfTransfer =
            o.type === "transfer" &&
            toAccountId !== undefined &&
            accountId === toAccountId;
          return {
            ...o,
            accountId,
            toAccountId,
            deleted: becomesSelfTransfer ? true : o.deleted,
            updatedAt: now,
          };
        });

        const transfers = (s.transfers ?? []).map((t) => {
          const touches = t.fromAccountId === id || t.toAccountId === id;
          if (!touches) return t;
          const fromAccountId = remap(t.fromAccountId);
          const toAccountId = remap(t.toAccountId);
          return {
            ...t,
            fromAccountId,
            toAccountId,
            deleted: fromAccountId === toAccountId ? true : t.deleted,
            updatedAt: now,
          };
        });

        const credits = (s.credits ?? []).map((c) => {
          const payments = c.payments.map((p) =>
            p.accountId === id ? { ...p, accountId: replacementId } : p
          );
          const touches =
            c.accountId === id ||
            c.receivedAccountId === id ||
            c.payments.some((p) => p.accountId === id);
          return touches
            ? {
                ...c,
                accountId: remap(c.accountId),
                receivedAccountId: c.receivedAccountId
                  ? remap(c.receivedAccountId)
                  : c.receivedAccountId,
                payments,
                updatedAt: now,
              }
            : c;
        });

        const debts = (s.debts ?? []).map((d) => {
          const payments = d.payments.map((p) =>
            p.accountId === id ? { ...p, accountId: replacementId } : p
          );
          const touches =
            d.accountId === id || d.payments.some((p) => p.accountId === id);
          return touches
            ? { ...d, accountId: remap(d.accountId), payments, updatedAt: now }
            : d;
        });

        const recurring = (s.recurring ?? []).map((r) =>
          r.accountId === id
            ? { ...r, accountId: replacementId, updatedAt: now }
            : r
        );

        // Шаблон-перевод, у которого оба конца сошлись на одном счёте,
        // бессмыслен: форма такой перевод всё равно не примет.
        const templates = (s.templates ?? [])
          .map((t) =>
            t.accountId === id || t.toAccountId === id
              ? {
                  ...t,
                  accountId: remap(t.accountId),
                  toAccountId: t.toAccountId ? remap(t.toAccountId) : t.toAccountId,
                }
              : t
          )
          .filter((t) => !(t.type === "transfer" && t.toAccountId === t.accountId));

        const accounts = s.accounts
          .filter((a) => a.id !== id)
          .map((a) =>
            a.id === replacementId
              ? {
                  ...a,
                  baseBalance: a.baseBalance + account.baseBalance,
                  updatedAt: now,
                }
              : a
          );

        return {
          ...s,
          ...touchSettings({
            accounts,
            primaryAccountId:
              s.primaryAccountId === id ? replacementId : s.primaryAccountId,
            operations,
            transfers,
            credits,
            debts,
            recurring,
            templates,
            deletedAccountIds: {
              ...(s.deletedAccountIds ?? {}),
              [id]: now,
            },
          }),
        };
      });
    };

    const addTransfer = (t: Omit<Transfer, "id" | "updatedAt">) => {
      const amount = Math.abs(t.amount);
      if (!amount || t.fromAccountId === t.toAccountId) return;
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          transfers: [
            ...(s.transfers ?? []),
            { ...t, amount, id: uid(), updatedAt: now },
          ],
        }),
      }));
    };

    const deleteTransfer = (id: string) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          transfers: (s.transfers ?? []).map((t) =>
            t.id === id ? { ...t, deleted: true, updatedAt: now } : t
          ),
        }),
      }));
    };

    const updateGoal = (goal: Partial<Goal>) => {
      setState((s) => ({ ...s, ...touchSettings({ goal: { ...s.goal, ...goal } }) }));
    };

    // ===== Кредиты =====
    const addCredit = (
      c: Omit<Credit, "id" | "payments" | "paymentDates" | "updatedAt">
    ) => {
      setState((s) => {
        const credit: Credit = {
          ...c,
          id: uid(),
          payments: [],
          paymentDates: generatePaymentDates(c.receivedDate, c.count),
          updatedAt: Date.now(),
        };
        return { ...s, ...touch({ credits: [...(s.credits ?? []), credit] }) };
      });
    };

    const updateCredit = (id: string, patch: Partial<Omit<Credit, "id">>) => {
      setState((s) => ({
        ...s,
        ...touch({
          credits: (s.credits ?? []).map((c) => {
            if (c.id !== id) return c;
            const next = { ...c, ...patch, updatedAt: Date.now() };
            // Пересобираем расписание при изменении даты/количества
            if (patch.count !== undefined || patch.receivedDate !== undefined) {
              next.paymentDates = generatePaymentDates(
                next.receivedDate,
                next.count
              );
            }
            return next;
          }),
        }),
      }));
    };

    const deleteCredit = (id: string) => {
      setState((s) => ({
        ...s,
        ...touch({
          credits: (s.credits ?? []).map((c) =>
            c.id === id ? { ...c, deleted: true, updatedAt: Date.now() } : c
          ),
        }),
      }));
    };

    const addCreditPayment = (
      creditId: string,
      payment: Omit<CreditPayment, "id">
    ) => {
      setState((s) => ({
        ...s,
        ...touch({
          credits: (s.credits ?? []).map((c) =>
            c.id === creditId
              ? {
                  ...c,
                  payments: [...c.payments, { ...payment, id: uid() }],
                  updatedAt: Date.now(),
                }
              : c
          ),
        }),
      }));
    };

    const deleteCreditPayment = (creditId: string, paymentId: string) => {
      setState((s) => ({
        ...s,
        ...touch({
          credits: (s.credits ?? []).map((c) =>
            c.id === creditId
              ? {
                  ...c,
                  payments: c.payments.filter((p) => p.id !== paymentId),
                  updatedAt: Date.now(),
                }
              : c
          ),
        }),
      }));
    };

    const setPrimaryAccount = (id: string) => {
      setState((s) => ({ ...s, ...touchSettings({ primaryAccountId: id }) }));
    };

    const setBudgetRollover = (on: boolean) => {
      setState((s) => ({ ...s, ...touchSettings({ budgetRollover: on }) }));
    };

    // Установить/убрать месячный лимит по категории (0 — убрать)
    const setBudget = (category: string, limit: number) => {
      setState((s) => {
        const budgets = { ...(s.budgets ?? {}) };
        if (limit > 0) budgets[category] = limit;
        else delete budgets[category];
        return { ...s, ...touchSettings({ budgets }) };
      });
    };

    const addTemplate = (t: Omit<Template, "id">) => {
      setState((s) => ({
        ...s,
        ...touchSettings({ templates: [...(s.templates ?? []), { ...t, id: uid() }] }),
      }));
    };

    const deleteTemplate = (id: string) => {
      setState((s) => ({
        ...s,
        ...touchSettings({
          templates: (s.templates ?? []).filter((t) => t.id !== id),
        }),
      }));
    };

    // ===== Регулярные операции =====
    const addRecurring = (r: Omit<RecurringRule, "id" | "updatedAt">) => {
      setState((s) => ({
        ...s,
        ...touch({
          recurring: [
            ...(s.recurring ?? []),
            { ...r, id: uid(), updatedAt: Date.now() },
          ],
        }),
      }));
    };

    const updateRecurring = (
      id: string,
      patch: Partial<Omit<RecurringRule, "id">>
    ) => {
      setState((s) => ({
        ...s,
        ...touch({
          recurring: (s.recurring ?? []).map((r) =>
            r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r
          ),
        }),
      }));
    };

    const deleteRecurring = (id: string) => {
      setState((s) => ({
        ...s,
        ...touch({
          recurring: (s.recurring ?? []).map((r) =>
            r.id === id ? { ...r, deleted: true, updatedAt: Date.now() } : r
          ),
        }),
      }));
    };

    // Оплатить подписку: создаёт/обновляет операцию с детерминированным id
    // (rec-<rule>-<month>) — оплата за конкретный месяц, без дублей.
    // Месяц экземпляра передаётся отдельно от даты платежа. Раньше он брался из
    // даты, и октябрьская аренда, оплаченная 29 сентября, затирала сентябрьскую
    // оплату, а октябрь так и оставался неоплаченным.
    const paySubscription = (
      ruleId: string,
      opts?: { date?: string; accountId?: string; amount?: number; month?: string }
    ) => {
      setState((s) => {
        const rule = (s.recurring ?? []).find((r) => r.id === ruleId);
        if (!rule) return s;
        const date = opts?.date ?? todayISO();
        const month = /^\d{4}-\d{2}$/.test(opts?.month ?? "")
          ? (opts!.month as string)
          : date.slice(0, 7);
        const id = `rec-${ruleId}-${month}`;
        const op: Operation = {
          id,
          date,
          type: rule.type,
          category: rule.category,
          amount: opts?.amount ?? rule.amount,
          accountId: opts?.accountId ?? rule.accountId,
          note: rule.title || rule.note || "",
          recurringId: ruleId,
          updatedAt: Date.now(),
        };
        const exists = s.operations.some((o) => o.id === id);
        const operations = exists
          ? s.operations.map((o) => (o.id === id ? op : o))
          : [...s.operations, op];
        return { ...s, ...touch({ operations }) };
      });
    };

    // Отменить оплату подписки за месяц (надгробие операции)
    const unpaySubscription = (ruleId: string, month: string) => {
      const id = `rec-${ruleId}-${month}`;
      setState((s) => ({
        ...s,
        ...touch({
          operations: s.operations.map((o) =>
            o.id === id ? { ...o, deleted: true, updatedAt: Date.now() } : o
          ),
        }),
      }));
    };

    // ===== Долги =====
    const addDebt = (d: Omit<Debt, "id" | "payments">) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          debts: [
            ...(s.debts ?? []),
            { ...d, id: uid(), payments: [], updatedAt: now },
          ],
        }),
      }));
    };

    const updateDebt = (id: string, patch: Partial<Omit<Debt, "id">>) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          debts: (s.debts ?? []).map((d) =>
            d.id === id ? { ...d, ...patch, updatedAt: now } : d
          ),
        }),
      }));
    };

    // Удаление долга — надгробие, чтобы не воскресал при синхронизации
    const deleteDebt = (id: string) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          debts: (s.debts ?? []).map((d) =>
            d.id === id ? { ...d, deleted: true, updatedAt: now } : d
          ),
        }),
      }));
    };

    const addDebtPayment = (
      debtId: string,
      payment: Omit<DebtPayment, "id">
    ) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          debts: (s.debts ?? []).map((d) =>
            d.id === debtId
              ? {
                  ...d,
                  payments: [...d.payments, { ...payment, id: uid() }],
                  updatedAt: now,
                }
              : d
          ),
        }),
      }));
    };

    const deleteDebtPayment = (debtId: string, paymentId: string) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          debts: (s.debts ?? []).map((d) =>
            d.id === debtId
              ? {
                  ...d,
                  payments: d.payments.filter((p) => p.id !== paymentId),
                  updatedAt: now,
                }
              : d
          ),
        }),
      }));
    };

    // Погасить полностью — добавляем возврат на остаток сегодняшней датой
    const settleDebt = (debtId: string, accountId: string) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          debts: (s.debts ?? []).map((d) => {
            if (d.id !== debtId) return d;
            const paid = d.payments.reduce((sum, p) => sum + p.amount, 0);
            const rest = d.amount - paid;
            if (rest <= 0) return d;
            return {
              ...d,
              payments: [
                ...d.payments,
                { id: uid(), date: todayISO(), amount: rest, accountId },
              ],
              updatedAt: now,
            };
          }),
        }),
      }));
    };

    const resetAll = () => {
      setState((s) => {
        const now = Date.now();
        // Полный сброс: ВСЕ синхронизируемые сущности гасим надгробиями
        // (иначе при следующей синхронизации они «воскреснут» из таблицы),
        // балансы счетов обнуляем (имена счетов и шаблоны оставляем).
        return {
          ...s,
          accounts: s.accounts.map((a) => ({ ...a, baseBalance: 0, reconciled: undefined })),
          operations: s.operations.map((o) => ({ ...o, deleted: true, updatedAt: now })),
          transfers: (s.transfers ?? []).map((t) => ({ ...t, deleted: true, updatedAt: now })),
          debts: (s.debts ?? []).map((d) => ({ ...d, deleted: true, updatedAt: now })),
          credits: (s.credits ?? []).map((c) => ({ ...c, deleted: true, updatedAt: now })),
          recurring: (s.recurring ?? []).map((r) => ({ ...r, deleted: true, updatedAt: now })),
          goal: { name: "", target: 0, saved: 0 },
          budgets: {},
          updatedAt: now,
          settingsUpdatedAt: now,
        };
      });
    };

    const setSyncConfig = (partial: Partial<SyncConfig>) => {
      setSync((c) => ({ ...c, ...partial }));
    };

    return {
      state,
      addOperation,
      updateOperation,
      deleteOperation,
      restoreOperation,
      setAccountBalance,
      addAccount,
      updateAccount,
      renameAccount,
      deleteAccount,
      addTransfer,
      deleteTransfer,
      updateGoal,
      addCredit,
      updateCredit,
      deleteCredit,
      addCreditPayment,
      deleteCreditPayment,
      setPrimaryAccount,
      setBudget,
      setBudgetRollover,
      addTemplate,
      deleteTemplate,
      addRecurring,
      updateRecurring,
      deleteRecurring,
      paySubscription,
      unpaySubscription,
      addDebt,
      updateDebt,
      deleteDebt,
      addDebtPayment,
      deleteDebtPayment,
      settleDebt,
      resetAll,
      sync,
      syncState,
      setSyncConfig,
      pullNow,
      pushNow,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sync, syncState]);

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
