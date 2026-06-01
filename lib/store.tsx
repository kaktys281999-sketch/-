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
  CreditConfig,
  Goal,
  Template,
} from "./types";
import { getCategorySign, CREDIT_PAYMENT_CATEGORY } from "./categories";
import { monthKeyFromISO, todayISO, generatePaymentDates } from "./format";
import {
  SyncConfig,
  EMPTY_SYNC,
  DEFAULT_SYNC_URL,
  toPayload,
  fromPayload,
  mergeStates,
  pull,
  push,
} from "./sync";

const STORAGE_KEY = "finance-tracker-v1";
const SYNC_KEY = "finance-tracker-sync-v1";

// Начальное состояние согласно ТЗ
const INITIAL_STATE: AppState = {
  accounts: [
    { id: "yandex", name: "Яндекс банк", baseBalance: 11937 },
    { id: "sber", name: "Сбербанк", baseBalance: 879 },
    { id: "tinkoff", name: "Тинькофф", baseBalance: 344 },
  ],
  operations: [],
  credit: {
    received: 30000,
    receivedDate: "2026-05-26",
    payment: 10921,
    count: 3,
    paymentDates: ["2026-06-26", "2026-07-26", "2026-08-26"],
  },
  goal: {
    name: "Квартира",
    target: 40000,
    saved: 0,
  },
  budgets: {},
  templates: [],
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
  updateGoal: (goal: Partial<Goal>) => void;
  updateCredit: (credit: Partial<CreditConfig>) => void;
  setBudget: (category: string, limit: number) => void;
  addTemplate: (t: Omit<Template, "id">) => void;
  deleteTemplate: (id: string) => void;
  resetAll: () => void;
  // Синхронизация с Google-таблицей
  sync: SyncConfig;
  syncState: SyncState;
  setSyncConfig: (partial: Partial<SyncConfig>) => void;
  pullNow: () => Promise<void>;
  pushNow: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function loadState(): AppState {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    // Мягкое слияние, чтобы новые поля не ломали старые данные
    return {
      accounts: parsed.accounts ?? INITIAL_STATE.accounts,
      operations: parsed.operations ?? INITIAL_STATE.operations,
      credit: { ...INITIAL_STATE.credit, ...parsed.credit },
      goal: { ...INITIAL_STATE.goal, ...parsed.goal },
      budgets: parsed.budgets ?? {},
      templates: parsed.templates ?? [],
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return INITIAL_STATE;
  }
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

// Дельта операции для баланса счёта
export function operationDelta(op: Operation): number {
  if (op.type === "income") return op.amount;
  if (op.type === "expense_personal" || op.type === "expense_work")
    return -op.amount;
  // credit_loan — по знаку категории
  return getCategorySign(op.type, op.category) * op.amount;
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
    if (next.operations.length === 0) {
      // локально вообще нет операций — проверим, есть ли что-то в таблице
      try {
        const remote = await pull(url);
        const remoteLive = remote
          ? remote.operations.filter((o) => !o.deleted).length
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
        const deltaSum = s.operations
          .filter((o) => o.accountId === id && !o.deleted)
          .reduce((sum, o) => sum + operationDelta(o), 0);
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

    const updateGoal = (goal: Partial<Goal>) => {
      setState((s) => ({ ...s, ...touch({ goal: { ...s.goal, ...goal } }) }));
    };

    const updateCredit = (patch: Partial<CreditConfig>) => {
      setState((s) => {
        const credit = { ...s.credit, ...patch };
        // При изменении даты получения или количества платежей пересобираем
        // расписание, чтобы «всего к выплате» и список дат не расходились.
        if (patch.count !== undefined || patch.receivedDate !== undefined) {
          credit.paymentDates = generatePaymentDates(
            credit.receivedDate,
            credit.count
          );
        }
        return { ...s, ...touch({ credit }) };
      });
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
        return { ...INITIAL_STATE, operations: tombstones, updatedAt: now };
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
      updateGoal,
      updateCredit,
      setBudget,
      addTemplate,
      deleteTemplate,
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

// ===== Производные вычисления (селекторы) =====

export function currentBalance(state: AppState, accountId: string): number {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc) return 0;
  const deltaSum = state.operations
    .filter((o) => o.accountId === accountId && !o.deleted)
    .reduce((sum, o) => sum + operationDelta(o), 0);
  return acc.baseBalance + deltaSum;
}

// На руках = сумма балансов всех счетов
export function totalOnHand(state: AppState): number {
  return state.accounts.reduce(
    (sum, a) => sum + currentBalance(state, a.id),
    0
  );
}

export interface MonthSummary {
  income: number;
  expense: number;
  diff: number;
}

// Доход / расход за месяц (кредиты и займы НЕ входят)
export function monthSummary(state: AppState, mKey: string): MonthSummary {
  let income = 0;
  let expense = 0;
  for (const op of state.operations) {
    if (op.deleted) continue;
    if (monthKeyFromISO(op.date) !== mKey) continue;
    if (op.type === "income") income += op.amount;
    else if (op.type === "expense_personal" || op.type === "expense_work")
      expense += op.amount;
  }
  return { income, expense, diff: income - expense };
}

export interface CreditInfo {
  totalDue: number; // всего к выплате
  overpay: number; // переплата
  paid: number; // выплачено
  remaining: number; // осталось выплатить
  nextPaymentDate: string | null;
  nextPaymentAmount: number;
}

// Кредит: расчёты по ТЗ
export function creditInfo(state: AppState): CreditInfo {
  const { credit } = state;
  const totalDue = credit.payment * credit.count;
  const overpay = totalDue - credit.received;

  // Выплачено = сумма операций «Платёж по кредиту» после даты получения
  const paid = state.operations
    .filter(
      (o) =>
        !o.deleted &&
        o.type === "credit_loan" &&
        o.category === CREDIT_PAYMENT_CATEGORY &&
        o.date > credit.receivedDate
    )
    .reduce((sum, o) => sum + o.amount, 0);

  const remaining = totalDue - paid;

  // Ближайший платёж — первая будущая (>= сегодня) дата из расписания
  const today = todayISO();
  const upcoming = [...credit.paymentDates].sort().find((d) => d >= today);
  const nextPaymentDate = upcoming ?? null;

  return {
    totalDue,
    overpay,
    paid,
    remaining,
    nextPaymentDate,
    nextPaymentAmount: credit.payment,
  };
}

// Реальная позиция = на руках − остаток долга по кредиту
export function realPosition(state: AppState): number {
  return totalOnHand(state) - creditInfo(state).remaining;
}
