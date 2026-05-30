"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { AppState, Operation, Account, CreditConfig, Goal } from "./types";
import { getCategorySign, CREDIT_PAYMENT_CATEGORY } from "./categories";
import { monthKeyFromISO, todayISO } from "./format";

const STORAGE_KEY = "finance-tracker-v1";

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
};

interface StoreContextValue {
  state: AppState;
  addOperation: (op: Omit<Operation, "id">) => void;
  updateOperation: (id: string, op: Omit<Operation, "id">) => void;
  deleteOperation: (id: string) => void;
  setAccountBalance: (id: string, currentBalance: number) => void;
  updateGoal: (goal: Partial<Goal>) => void;
  updateCredit: (credit: Partial<CreditConfig>) => void;
  resetAll: () => void;
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
    };
  } catch {
    return INITIAL_STATE;
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

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const value = useMemo<StoreContextValue>(() => {
    const addOperation = (op: Omit<Operation, "id">) => {
      setState((s) => ({
        ...s,
        operations: [...s.operations, { ...op, id: uid() }],
      }));
    };

    const updateOperation = (id: string, op: Omit<Operation, "id">) => {
      setState((s) => ({
        ...s,
        operations: s.operations.map((o) =>
          o.id === id ? { ...op, id } : o
        ),
      }));
    };

    const deleteOperation = (id: string) => {
      setState((s) => ({
        ...s,
        operations: s.operations.filter((o) => o.id !== id),
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
          accounts: s.accounts.map((a) =>
            a.id === id ? { ...a, baseBalance: currentBalance - deltaSum } : a
          ),
        };
      });
    };

    const updateGoal = (goal: Partial<Goal>) => {
      setState((s) => ({ ...s, goal: { ...s.goal, ...goal } }));
    };

    const updateCredit = (credit: Partial<CreditConfig>) => {
      setState((s) => ({ ...s, credit: { ...s.credit, ...credit } }));
    };

    const resetAll = () => {
      setState(INITIAL_STATE);
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
    };
  }, [state]);

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
