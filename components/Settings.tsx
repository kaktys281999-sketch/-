"use client";

import { useEffect, useState } from "react";
import { useStore, currentBalance, creditInfo } from "@/lib/store";
import { formatMoney, formatDateLong } from "@/lib/format";
import { Theme, getTheme, setTheme } from "@/lib/theme";
import { Card, NumberInput } from "./ui";

export function Settings() {
  const { state, setAccountBalance, updateGoal, updateCredit, resetAll } =
    useStore();
  const credit = creditInfo(state);

  const fieldCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

  return (
    <div className="space-y-3">
      <h1 className="px-1 text-lg font-bold">Настройки</h1>

      <ThemeCard />

      <SyncCard fieldCls={fieldCls} />

      {/* Балансы счетов */}
      <Card>
        <div className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
          Балансы счетов
        </div>
        <div className="space-y-3">
          {state.accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3">
              <label className="text-sm">{a.name}</label>
              <NumberInput
                value={Math.round(currentBalance(state, a.id))}
                onCommit={(n) => setAccountBalance(a.id, n)}
                className={`${fieldCls} w-36 text-right`}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Это остаток «на сейчас». Операции дальше меняют его автоматически.
        </p>
      </Card>

      {/* Цель */}
      <Card>
        <div className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
          Цель накоплений
        </div>
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

      {/* Кредит */}
      <Card>
        <div className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">Кредит</div>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Получено, ₽
              </label>
              <NumberInput
                value={state.credit.received}
                onCommit={(n) => updateCredit({ received: n })}
                className={fieldCls}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Дата получения
              </label>
              <input
                type="date"
                value={state.credit.receivedDate}
                onChange={(e) =>
                  updateCredit({ receivedDate: e.target.value })
                }
                className={fieldCls}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Платёж, ₽
              </label>
              <NumberInput
                value={state.credit.payment}
                onCommit={(n) => updateCredit({ payment: n })}
                className={fieldCls}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Кол-во платежей
              </label>
              <NumberInput
                value={state.credit.count}
                onCommit={(n) => updateCredit({ count: n })}
                className={fieldCls}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
          <Row label="Всего к выплате" value={formatMoney(credit.totalDue)} />
          <Row label="Переплата" value={formatMoney(credit.overpay)} />
          <Row label="Выплачено" value={formatMoney(credit.paid)} />
          <Row label="Осталось выплатить" value={formatMoney(credit.remaining)} />
          <div className="pt-1 text-xs text-slate-400 dark:text-slate-500">
            Платежи:{" "}
            {state.credit.paymentDates.map((d) => formatDateLong(d)).join(", ")}
          </div>
        </div>
      </Card>

      <Card>
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
          className="w-full rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-600 active:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:active:bg-red-950/60"
        >
          Сбросить все данные
        </button>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="font-medium">{value}</span>
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
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  function choose(t: Theme) {
    setThemeState(t);
    setTheme(t);
  }

  return (
    <Card>
      <div className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
        Оформление
      </div>
      <div className="grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => choose(o.id)}
            className={`rounded-xl py-2.5 text-sm font-medium transition ${
              theme === o.id
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function SyncCard({ fieldCls }: { fieldCls: string }) {
  const { sync, syncState, setSyncConfig, pullNow, pushNow } = useStore();
  const busy = syncState.status === "syncing";

  return (
    <Card>
      <div className="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">
        Синхронизация с Google-таблицей
      </div>
      <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
        Данные хранятся в Google-таблице, и приложение работает одинаково на
        телефоне и на компьютере. Инструкция по настройке — в README проекта.
      </p>

      <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
        Ссылка веб-приложения (Apps Script)
      </label>
      <input
        type="url"
        inputMode="url"
        placeholder="https://script.google.com/macros/s/.../exec"
        value={sync.url}
        onChange={(e) => setSyncConfig({ url: e.target.value })}
        className={`${fieldCls} text-xs`}
      />

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={sync.auto}
          onChange={(e) => setSyncConfig({ auto: e.target.checked })}
          className="h-4 w-4 accent-brand"
        />
        Синхронизировать автоматически
      </label>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || !sync.url.trim()}
          onClick={() => void pullNow()}
          className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-700 active:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200 dark:active:bg-slate-700"
        >
          Загрузить из таблицы
        </button>
        <button
          type="button"
          disabled={busy || !sync.url.trim()}
          onClick={() => void pushNow()}
          className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white active:bg-brand-dark disabled:opacity-40"
        >
          Сохранить в таблицу
        </button>
      </div>

      {syncState.message && (
        <div
          className={`mt-2 text-xs ${
            STATUS_STYLE[syncState.status] ?? "text-slate-400"
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
  );
}
