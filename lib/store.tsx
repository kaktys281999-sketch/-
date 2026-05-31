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
import { AppState, Operation, Account, CreditConfig, Goal } from "./types";
import { getCategorySign, CREDIT_PAYMENT_CATEGORY } from "./categories";
import { monthKeyFromISO, todayISO } from "./format";
import {
  SyncConfig,
  EMPTY_SYNC,
  DEFAULT_SYNC_URL,
  toPayload,
  fromPayload,
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
  setAccountBalance: (id: string, currentBalance: number) => void;
  updateGoal: (goal: Partial<Goal>) => void;
  updateCredit: (credit: Partial<CreditConfig>) => void;
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
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Загрузить из таблицы (с разрешением конфликта по updatedAt)
  const pullNow = async () => {
    const url = syncRef.current.url.trim();
    if (!url) return;
    setSyncState((p) => ({ ...p, status: "syncing", message: "Загрузка…" }));
    try {
      const remote = await pull(url);
      if (remote && remote.updatedAt >= stateRef.current.updatedAt) {
        applyRemote(fromPayload(remote));
      } else if (!remote || remote.updatedAt < stateRef.current.updatedAt) {
        // В таблице пусто или данные старее — зальём своё
        await push(url, toPayload(stateRef.current));
      }
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
      await push(url, toPayload(stateRef.current));
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
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void pushNow();
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
      setState((s) => ({
        ...s,
        ...touch({ operations: [...s.operations, { ...op, id: uid() }] }),
      }));
    };

    const updateOperation = (id: string, op: Omit<Operation, "id">) => {
      setState((s) => ({
        ...s,
        ...touch({
          operations: s.operations.map((o) => (o.id === id ? { ...op, id } : o)),
        }),
      }));
    };

    const deleteOperation = (id: string) => {
      setState((s) => ({
        ...s,
        ...touch({ operations: s.operations.filter((o) => o.id !== id) }),
      }));
    };

    // Ручное редактирование баланса: текущий = base + сумма дельт.
    // Подбираем base так, чтобы текущий стал равен введённому значению.
    const setAccountBalance = (id: string, currentBalance: number) => {
      setState((s) => {
        const deltaSum = s.operations
          .filter((o) => o.accountId === id)
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

    const updateCredit = (credit: Partial<CreditConfig>) => {
      setState((s) => ({
        ...s,
        ...touch({ credit: { ...s.credit, ...credit } }),
      }));
    };

    const resetAll = () => {
      setState({ ...INITIAL_STATE, updatedAt: Date.now() });
    };

    const setSyncConfig = (partial: Partial<SyncConfig>) => {
      setSync((c) => ({ ...c, ...partial }));
    };

    return {
      state,
      addOperation,
      updateOperation,
      deleteOperation,
      setAccountBalance,
      updateGoal,
      updateCredit,
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
    .filter((o) => o.accountId === accountId)
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
