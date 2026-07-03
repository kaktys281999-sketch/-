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
  operationDelta,
  debtAccountDelta,
  creditAccountDelta,
  transferAccountDelta,
  dueRecurringOperations,
} from "./calc";
// Денежные селекторы живут в ./calc (без React) — реэкспортируем для потребителей
export * from "./calc";
import {
  SyncConfig,
  EMPTY_SYNC,
  DEFAULT_SYNC_URL,
  toPayload,
  fromPayload,
  mergeStates,
  legacyCreditToCredit,
  pull,
  push,
} from "./sync";

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

// Начальное состояние согласно ТЗ
const INITIAL_STATE: AppState = {
  accounts: [
    { id: "yandex", name: "Яндекс банк", baseBalance: 11937 },
    { id: "sber", name: "Сбербанк", baseBalance: 879 },
    { id: "tinkoff", name: "Тинькофф", baseBalance: 344 },
    { id: "cash", name: "Наличные", baseBalance: 0 },
  ],
  operations: [],
  transfers: [],
  credits: [
    {
      id: "credit-main",
      name: "Кредит",
      received: 30000,
      receivedDate: "2026-05-26",
      payment: 10921,
      count: 3,
      paymentDates: ["2026-06-26", "2026-07-26", "2026-08-26"],
      accountId: "yandex",
      payments: [],
      updatedAt: 0,
    },
  ],
  goal: {
    name: "Квартира",
    target: 40000,
    saved: 0,
  },
  primaryAccountId: "yandex",
  budgets: {},
  budgetRollover: false,
  templates: transportTemplates("yandex"),
  seededTransportTpl: true,
  busDefaultApplied: true,
  recurring: [],
  debts: [],
  updatedAt: 0,
};

export type SyncStatusKind = "idle" | "syncing" | "ok" | "error" | "offline";

export interface SyncState {
  status: SyncStatusKind;
  message: string;
  lastSync: number | null;
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
      makePrimary?: boolean;
    }
  ) => void;
  updateAccount: (id: string, patch: Partial<Omit<Account, "id">>) => void;
  renameAccount: (id: string, name: string) => void;
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
    opts?: { date?: string; accountId?: string; amount?: number }
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
function ensureCashAccount(accounts: Account[]): Account[] {
  const has = accounts.some(
    (a) => a.id === "cash" || a.name.trim().toLowerCase() === "наличные"
  );
  return has
    ? accounts
    : [...accounts, { id: "cash", name: "Наличные", baseBalance: 0 }];
}

function loadState(): AppState {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
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
    // Мягкое слияние, чтобы новые поля не ломали старые данные
    return {
      accounts: ensureCashAccount(parsed.accounts ?? INITIAL_STATE.accounts),
      operations: parsed.operations ?? INITIAL_STATE.operations,
      transfers: parsed.transfers ?? [],
      credits: migrateCredits(parsed),
      goal: { ...INITIAL_STATE.goal, ...parsed.goal },
      primaryAccountId: parsed.primaryAccountId ?? INITIAL_STATE.primaryAccountId,
      budgets: parsed.budgets ?? {},
      budgetRollover: parsed.budgetRollover ?? false,
      templates,
      seededTransportTpl,
      busDefaultApplied,
      recurring: parsed.recurring ?? [],
      debts: parsed.debts ?? [],
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return INITIAL_STATE;
  }
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
    // если ссылка не задана — подставляем зашитую по умолчанию
    const url =
      parsed.url && String(parsed.url).trim() ? parsed.url : DEFAULT_SYNC_URL;
    return { ...EMPTY_SYNC, ...parsed, url };
  } catch {
    return EMPTY_SYNC;
  }
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
  // Флаг: применяем данные из таблицы — не отправлять их обратно
  const applyingRemote = useRef(false);
  // Стартовый pull завершён — до него авто-отправка запрещена (защита от обнуления)
  const initialPullDone = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Безопасная отправка: не затирать непустую таблицу пустыми операциями.
  // Возвращает true, если запись выполнена.
  const safePush = async (url: string, next: AppState): Promise<boolean> => {
    // Опасен только случай «совсем нет записей» (новое/чистое устройство).
    // Если есть надгробия (осознанное удаление/сброс) — массив непустой,
    // их нужно отправить, чтобы изменения дошли до других устройств.
    const hasLocalRecords =
      next.operations.length > 0 ||
      (next.transfers ?? []).length > 0 ||
      (next.debts ?? []).length > 0 ||
      (next.credits ?? []).length > 0 ||
      (next.recurring ?? []).length > 0;

    if (!hasLocalRecords) {
      // локально вообще нет операций — проверим, есть ли что-то в таблице
      try {
        const remote = await pull(url);
        const remoteLive = remote
          ? remote.operations.filter((o) => !o.deleted).length +
            (remote.transfers ?? []).filter((t) => !t.deleted).length +
            (remote.debts ?? []).filter((d) => !d.deleted).length +
            (remote.credits ?? []).filter((c) => !c.deleted).length +
            (remote.recurring ?? []).filter((r) => !r.deleted).length
          : 0;
        if (remoteLive > 0) {
          // в таблице есть данные, а у нас пусто — НЕ затираем
          return false;
        }
      } catch {
        // не смогли проверить — на всякий случай не пишем пустое
        return false;
      }
    }
    await push(url, toPayload(next));
    return true;
  };

  // Загрузка локальных данных и конфигурации синхронизации
  useEffect(() => {
    setState(loadState());
    setSync(loadSyncConfig());
    setHydrated(true);
  }, []);

  // Сохранение в localStorage
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  // Догенерировать операции по регулярным правилам (при запуске и смене правил)
  useEffect(() => {
    if (!hydrated) return;
    setState((s) => {
      const due = dueRecurringOperations(
        s.recurring ?? [],
        new Set(s.operations.map((o) => o.id)),
        monthKey(new Date()),
        todayISO()
      );
      if (!due.length) return s;
      return {
        ...s,
        operations: [...s.operations, ...due],
        updatedAt: Date.now(),
      };
    });
  }, [hydrated, state.recurring]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
  }, [sync, hydrated]);

  // Применить данные из таблицы локально (без обратной отправки)
  const applyRemote = (s: AppState) => {
    applyingRemote.current = true;
    setState(s);
  };

  // Загрузить из таблицы и слить без потери данных
  const pullNow = async () => {
    const url = syncRef.current.url.trim();
    if (!url) return;
    setSyncState((p) => ({ ...p, status: "syncing", message: "Загрузка…" }));
    try {
      const remote = await pull(url);
      if (remote) {
        // Слияние локального и удалённого по операциям (без потери правок)
        const merged = mergeStates(stateRef.current, fromPayload(remote));
        applyRemote(merged);
        // Отдадим результат слияния обратно
        await push(url, toPayload(merged));
      } else {
        // В таблице пусто — зальём своё
        await push(url, toPayload(stateRef.current));
      }
      initialPullDone.current = true;
      setSyncState({
        status: "ok",
        message: "Синхронизировано",
        lastSync: Date.now(),
      });
    } catch (e) {
      setSyncState({
        status: "error",
        message: e instanceof Error ? e.message : "Ошибка синхронизации",
        lastSync: null,
      });
    }
  };

  // Сохранить в таблицу
  const pushNow = async () => {
    const url = syncRef.current.url.trim();
    if (!url) return;
    setSyncState((p) => ({ ...p, status: "syncing", message: "Сохранение…" }));
    try {
      const wrote = await safePush(url, stateRef.current);
      if (!wrote) {
        setSyncState({
          status: "error",
          message: "В таблице есть данные — пустое не сохранено",
          lastSync: null,
        });
        return;
      }
      setSyncState({
        status: "ok",
        message: "Сохранено в таблицу",
        lastSync: Date.now(),
      });
    } catch (e) {
      setSyncState({
        status: "error",
        message: e instanceof Error ? e.message : "Ошибка сохранения",
        lastSync: null,
      });
    }
  };

  // При запуске: если настроена авто-синхронизация — подтянуть из таблицы
  useEffect(() => {
    if (!hydrated) return;
    if (sync.url.trim() && sync.auto) {
      void pullNow();
    }
    // запускаем один раз после гидрации
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Авто-отправка изменений в таблицу (с задержкой), кроме применённых из таблицы
  useEffect(() => {
    if (!hydrated) return;
    if (applyingRemote.current) {
      applyingRemote.current = false;
      return;
    }
    if (!sync.url.trim() || !sync.auto) return;
    // До завершения стартового pull не отправляем — иначе пустое состояние
    // нового устройства может затереть таблицу
    if (!initialPullDone.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void safePush(syncRef.current.url.trim(), stateRef.current).then((ok) => {
        if (ok)
          setSyncState({
            status: "ok",
            message: "Сохранено в таблицу",
            lastSync: Date.now(),
          });
      });
    }, 1500);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated]);

  const value = useMemo<StoreContextValue>(() => {
    const touch = <T extends Partial<AppState>>(patch: T) => ({
      ...patch,
      updatedAt: Date.now(),
    });

    const addOperation = (op: Omit<Operation, "id">) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          operations: [...s.operations, { ...op, id: uid(), updatedAt: now }],
        }),
      }));
    };

    const updateOperation = (id: string, op: Omit<Operation, "id">) => {
      const now = Date.now();
      setState((s) => ({
        ...s,
        ...touch({
          operations: s.operations.map((o) =>
            o.id === id ? { ...op, id, updatedAt: now } : o
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
    const setAccountBalance = (id: string, currentBalance: number) => {
      setState((s) => {
        const opDelta = s.operations
          .filter((o) => o.accountId === id && !o.deleted)
          .reduce((sum, o) => sum + operationDelta(o), 0);
        const debtDelta = (s.debts ?? [])
          .filter((d) => !d.deleted)
          .reduce((sum, d) => sum + debtAccountDelta(d, id), 0);
        const creditDelta = (s.credits ?? [])
          .filter((c) => !c.deleted)
          .reduce((sum, c) => sum + creditAccountDelta(c, id), 0);
        const transferDelta = (s.transfers ?? [])
          .filter((t) => !t.deleted)
          .reduce((sum, t) => sum + transferAccountDelta(t, id), 0);
        const deltaSum = opDelta + debtDelta + creditDelta + transferDelta;
        return {
          ...s,
          ...touch({
            accounts: s.accounts.map((a) =>
              a.id === id ? { ...a, baseBalance: currentBalance - deltaSum } : a
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
        makePrimary?: boolean;
      }
    ) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setState((s) => {
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
        };
        return {
          ...s,
          ...touch({
            accounts: [...s.accounts, account],
            primaryAccountId: opts?.makePrimary ? id : s.primaryAccountId,
          }),
        };
      });
    };

    const updateAccount = (id: string, patch: Partial<Omit<Account, "id">>) => {
      setState((s) => ({
        ...s,
        ...touch({
          accounts: s.accounts.map((a) => {
            if (a.id !== id) return a;
            const next: Account = { ...a, ...patch };
            if (patch.name !== undefined) {
              next.name = patch.name.trim() || a.name;
            }
            if (next.kind === "credit_card") {
              next.creditPaymentDay = clampPaymentDay(next.creditPaymentDay);
            } else {
              next.kind = undefined;
              next.creditPaymentDay = undefined;
            }
            return next;
          }),
        }),
      }));
    };

    // Переименовать счёт (id не меняется — операции не осиротеют)
    const renameAccount = (id: string, name: string) => {
      setState((s) => ({
        ...s,
        ...touch({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, name } : a)),
        }),
      }));
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
      setState((s) => ({ ...s, ...touch({ goal: { ...s.goal, ...goal } }) }));
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
      setState((s) => ({ ...s, ...touch({ primaryAccountId: id }) }));
    };

    const setBudgetRollover = (on: boolean) => {
      setState((s) => ({ ...s, ...touch({ budgetRollover: on }) }));
    };

    // Установить/убрать месячный лимит по категории (0 — убрать)
    const setBudget = (category: string, limit: number) => {
      setState((s) => {
        const budgets = { ...(s.budgets ?? {}) };
        if (limit > 0) budgets[category] = limit;
        else delete budgets[category];
        return { ...s, ...touch({ budgets }) };
      });
    };

    const addTemplate = (t: Omit<Template, "id">) => {
      setState((s) => ({
        ...s,
        ...touch({ templates: [...(s.templates ?? []), { ...t, id: uid() }] }),
      }));
    };

    const deleteTemplate = (id: string) => {
      setState((s) => ({
        ...s,
        ...touch({
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
    const paySubscription = (
      ruleId: string,
      opts?: { date?: string; accountId?: string; amount?: number }
    ) => {
      setState((s) => {
        const rule = (s.recurring ?? []).find((r) => r.id === ruleId);
        if (!rule) return s;
        const date = opts?.date ?? todayISO();
        const id = `rec-${ruleId}-${date.slice(0, 7)}`;
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
        // Существующие операции превращаем в надгробия, а не выкидываем —
        // иначе при следующей синхронизации они «воскреснут» из таблицы.
        const tombstones = s.operations.map((o) => ({
          ...o,
          deleted: true,
          updatedAt: now,
        }));
        const debtTombstones = (s.debts ?? []).map((d) => ({
          ...d,
          deleted: true,
          updatedAt: now,
        }));
        const transferTombstones = (s.transfers ?? []).map((t) => ({
          ...t,
          deleted: true,
          updatedAt: now,
        }));
        return {
          ...INITIAL_STATE,
          operations: tombstones,
          transfers: transferTombstones,
          debts: debtTombstones,
          updatedAt: now,
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
