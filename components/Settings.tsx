"use client";

import { useEffect, useState } from "react";
import { useStore, currentBalance } from "@/lib/store";
import { Theme, getTheme, setTheme, DEFAULT_THEME } from "@/lib/theme";
import {
  operationsToCSV,
  debtsToCSV,
  creditsToCSV,
  downloadFile,
} from "@/lib/export";
import { TYPES } from "@/lib/categories";
import { Card, NumberInput } from "./ui";

// Категории расходов (личные + рабочие) — для лимитов
const EXPENSE_CATEGORIES = TYPES.filter(
  (t) => t.type === "expense_personal" || t.type === "expense_work"
).flatMap((t) => t.categories.map((c) => c.name));

export function Settings() {
  const {
    state,
    setAccountBalance,
    updateGoal,
    setPrimaryAccount,
    resetAll,
  } = useStore();
  const primaryId =
    state.primaryAccountId ?? state.accounts[0]?.id ?? "";

  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";

  return (
    <div className="space-y-5">
      <ThemeCard />

      <SyncCard fieldCls={fieldCls} />

      {/* Основной счёт */}
      <div>
        <SettingsTitle>Основной счёт</SettingsTitle>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/[0.06] p-1 dark:bg-white/10">
          {state.accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setPrimaryAccount(a.id)}
              className={`rounded-lg py-2 text-[14px] font-medium ${
                primaryId === a.id
                  ? "bg-[var(--card)] text-slate-900 shadow-sm dark:text-white"
                  : "text-label-2"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
        <p className="mt-1.5 px-1 text-[13px] text-label-2">
          Подставляется по умолчанию при добавлении операций и долгов.
        </p>
      </div>

      {/* Балансы счетов */}
      <div>
        <SettingsTitle>Балансы счетов</SettingsTitle>
        <Card className="!p-0">
          {state.accounts.map((a, i) => (
            <div
              key={a.id}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                i > 0 ? "border-t border-[var(--separator)]" : ""
              }`}
            >
              <label className="text-[15px]">{a.name}</label>
              <NumberInput
                value={Math.round(currentBalance(state, a.id))}
                onCommit={(n) => setAccountBalance(a.id, n)}
                className={`${fieldCls} w-32 text-right`}
              />
            </div>
          ))}
        </Card>
        <p className="mt-1.5 px-1 text-[13px] text-label-2">
          Это остаток «на сейчас». Операции дальше меняют его автоматически.
        </p>
      </div>

      {/* Цель */}
      <div>
        <SettingsTitle>Цель накоплений</SettingsTitle>
        <Card>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">Название</label>
            <input
              type="text"
              value={state.goal.name}
              onChange={(e) => updateGoal({ name: e.target.value })}
              className={fieldCls}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Цель, ₽
              </label>
              <NumberInput
                value={state.goal.target}
                onCommit={(n) => updateGoal({ target: n })}
                className={fieldCls}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Накоплено, ₽
              </label>
              <NumberInput
                value={state.goal.saved}
                onCommit={(n) => updateGoal({ saved: n })}
                className={fieldCls}
              />
            </div>
          </div>
        </div>
        </Card>
      </div>

      <BudgetsCard fieldCls={fieldCls} />

      {/* Экспорт */}
      <div>
        <SettingsTitle>Данные</SettingsTitle>
        <Card className="!p-0">
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              downloadFile(
                `финансы-операции-${today}.csv`,
                operationsToCSV(state),
                "text/csv;charset=utf-8"
              );
            }}
            className="w-full py-3.5 text-center text-[17px] font-medium text-brand"
          >
            Скачать операции (CSV)
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              downloadFile(
                `финансы-долги-${today}.csv`,
                debtsToCSV(state),
                "text/csv;charset=utf-8"
              );
            }}
            className="w-full border-t border-[var(--separator)] py-3.5 text-center text-[17px] font-medium text-brand"
          >
            Скачать долги (CSV)
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              downloadFile(
                `финансы-кредиты-${today}.csv`,
                creditsToCSV(state),
                "text/csv;charset=utf-8"
              );
            }}
            className="w-full border-t border-[var(--separator)] py-3.5 text-center text-[17px] font-medium text-brand"
          >
            Скачать кредиты (CSV)
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Сбросить все данные и вернуть стартовые значения? Операции будут удалены."
                )
              ) {
                resetAll();
              }
            }}
            className="w-full border-t border-[var(--separator)] py-3.5 text-center text-[17px] font-medium text-red-600 dark:text-red-400"
          >
            Сбросить все данные
          </button>
        </Card>
        <p className="mt-1.5 px-1 text-[13px] text-label-2">
          CSV открывается в Excel и Google Таблицах — удобно как резервная копия.
        </p>
      </div>
    </div>
  );
}

function BudgetsCard({ fieldCls }: { fieldCls: string }) {
  const { state, setBudget, setBudgetRollover } = useStore();
  return (
    <div>
      <SettingsTitle>Бюджеты по категориям</SettingsTitle>
      <Card className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px]">Переносить остаток</div>
          <div className="text-[13px] text-label-2">
            Неизрасходованное за прошлый месяц добавится к лимиту
          </div>
        </div>
        <input
          type="checkbox"
          checked={!!state.budgetRollover}
          onChange={(e) => setBudgetRollover(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-brand"
        />
      </Card>
      <Card className="!p-0">
        {EXPENSE_CATEGORIES.map((cat, i) => (
          <div
            key={cat}
            className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
              i > 0 ? "border-t border-[var(--separator)]" : ""
            }`}
          >
            <label className="text-[15px] text-label-2">{cat}</label>
            <NumberInput
              value={state.budgets?.[cat] ?? 0}
              onCommit={(n) => setBudget(cat, n)}
              className={`${fieldCls} w-24 text-right`}
            />
          </div>
        ))}
      </Card>
      <p className="mt-1.5 px-1 text-[13px] text-label-2">
        Месячный лимит расходов. 0 — без лимита. Прогресс виден на «Сводке».
      </p>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  error: "text-red-600 dark:text-red-400",
  syncing: "text-slate-500 dark:text-slate-400",
  idle: "text-slate-400 dark:text-slate-500",
  offline: "text-amber-600 dark:text-amber-400",
};

const THEME_OPTIONS: { id: Theme; label: string }[] = [
  { id: "system", label: "Система" },
  { id: "light", label: "Светлая" },
  { id: "dark", label: "Тёмная" },
];

function ThemeCard() {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  function choose(t: Theme) {
    setThemeState(t);
    setTheme(t);
  }

  return (
    <div>
      <SettingsTitle>Оформление</SettingsTitle>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/[0.06] p-1 dark:bg-white/10">
        {THEME_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => choose(o.id)}
            className={`rounded-lg py-2 text-[14px] font-medium ${
              theme === o.id
                ? "bg-[var(--card)] text-slate-900 shadow-sm dark:text-white"
                : "text-label-2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
      {children}
    </div>
  );
}

function SyncCard({ fieldCls }: { fieldCls: string }) {
  const { sync, syncState, setSyncConfig, pullNow, pushNow } = useStore();
  const busy = syncState.status === "syncing";

  return (
    <div>
      <SettingsTitle>Синхронизация</SettingsTitle>
      <Card>
        <p className="mb-3 text-[13px] text-label-2">
          Данные хранятся в Google-таблице — приложение работает одинаково на
          телефоне и на компьютере.
        </p>

        <input
          type="url"
          inputMode="url"
          placeholder="https://script.google.com/macros/s/.../exec"
          value={sync.url}
          onChange={(e) => setSyncConfig({ url: e.target.value })}
          className={`${fieldCls} text-[13px]`}
        />

        <label className="mt-3 flex items-center justify-between text-[15px]">
          <span>Синхронизировать автоматически</span>
          <input
            type="checkbox"
            checked={sync.auto}
            onChange={(e) => setSyncConfig({ auto: e.target.checked })}
            className="h-5 w-5 accent-brand"
          />
        </label>

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            disabled={busy || !sync.url.trim()}
            onClick={() => void pullNow()}
            className="flex-1 rounded-2xl bg-black/[0.06] py-3 text-[15px] font-semibold text-slate-700 disabled:opacity-40 dark:bg-white/10 dark:text-slate-200"
          >
            Загрузить
          </button>
          <button
            type="button"
            disabled={busy || !sync.url.trim()}
            onClick={() => void pushNow()}
            className="flex-1 rounded-2xl bg-brand py-3 text-[15px] font-semibold text-white disabled:opacity-40"
          >
            Сохранить
          </button>
        </div>

        {syncState.message && (
          <div
            className={`mt-2.5 text-[13px] ${
              STATUS_STYLE[syncState.status] ?? "text-label-2"
            }`}
          >
            {syncState.message}
            {syncState.lastSync
              ? ` · ${new Date(syncState.lastSync).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
          </div>
        )}
      </Card>
    </div>
  );
}
