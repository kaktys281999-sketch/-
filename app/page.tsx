"use client";

import { useEffect, useState, ComponentType } from "react";
import { monthKey } from "@/lib/format";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Summary } from "@/components/Summary";
import { AddOperation } from "@/components/AddOperation";
import { Operations } from "@/components/Operations";
import { Debts } from "@/components/Debts";
import { Settings } from "@/components/Settings";
import { SyncBadge } from "@/components/SyncBadge";
import { SaveButton } from "@/components/SaveButton";
import {
  IconSummary,
  IconAdd,
  IconList,
  IconDebts,
  IconSettings,
} from "@/components/icons";

type Tab = "summary" | "add" | "operations" | "debts" | "settings";

const TABS: {
  id: Tab;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "summary", label: "Сводка", Icon: IconSummary },
  { id: "add", label: "Добавить", Icon: IconAdd },
  { id: "operations", label: "Операции", Icon: IconList },
  { id: "debts", label: "Долги", Icon: IconDebts },
  { id: "settings", label: "Настройки", Icon: IconSettings },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("summary");
  const [month, setMonth] = useState<string>("");

  // Текущий месяц и работа с localStorage — только на клиенте, чтобы
  // статически отрендеренный HTML не расходился с гидрацией.
  useEffect(() => {
    setMonth(monthKey(new Date()));
  }, []);

  const showMonthSwitcher = tab === "summary" || tab === "operations";

  // Спокойный экран загрузки
  if (!month) {
    return (
      <main className="flex min-h-screen items-center justify-center text-[15px] text-label-3">
        Загрузка…
      </main>
    );
  }

  const title = TABS.find((t) => t.id === tab)?.label ?? "Финансы";

  return (
    <main className="flex min-h-screen flex-col">
      {/* ===== Десктоп: верхняя панель вкладок ===== */}
      <header className="sticky top-0 z-20 hidden border-b border-[var(--separator)] bg-[var(--bg)]/80 backdrop-blur-xl md:block">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
          <span className="text-[19px] font-bold tracking-tight">Финансы</span>
          <nav className="flex items-center gap-1">
            {TABS.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition ${
                    active
                      ? "bg-brand text-white shadow-sm"
                      : "text-label-2 hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {label}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SaveButton />
            <SyncBadge />
          </div>
        </div>
      </header>

      {/* ===== Телефон: крупный заголовок iOS ===== */}
      <header className="sticky top-0 z-10 bg-[var(--bg)]/80 px-4 pb-1 pt-3 backdrop-blur-xl md:hidden">
        <div className="flex items-end justify-between">
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">
            {title}
          </h1>
          <div className="flex items-center gap-2 pb-1.5">
            <SaveButton />
            <SyncBadge />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-28 pt-1 md:max-w-5xl md:px-6 md:pb-12 md:pt-6">
        {/* Десктоп: заголовок раздела */}
        <h1 className="hidden text-[28px] font-bold leading-tight tracking-tight md:block">
          {title}
        </h1>

        {showMonthSwitcher && (
          <MonthSwitcher value={month} onChange={setMonth} />
        )}

        <div key={tab} className="animate-fadein space-y-4">
          {tab === "summary" && (
            <Summary
              month={month}
              onSelectMonth={setMonth}
              onOpenDebts={() => setTab("debts")}
            />
          )}
          {tab === "add" && (
            <div className="md:mx-auto md:max-w-xl">
              <AddOperation
                onShowMonth={(m) => {
                  setMonth(m);
                  setTab("operations");
                }}
              />
            </div>
          )}
          {tab === "operations" && (
            <div className="md:mx-auto md:max-w-2xl">
              <Operations month={month} />
            </div>
          )}
          {tab === "debts" && (
            <div className="md:mx-auto md:max-w-2xl">
              <Debts />
            </div>
          )}
          {tab === "settings" && (
            <div className="md:mx-auto md:max-w-2xl">
              <Settings />
            </div>
          )}
        </div>
      </div>

      {/* ===== Телефон: нижняя панель вкладок ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--separator)] bg-[var(--card)]/80 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md px-1 pb-[env(safe-area-inset-bottom)]">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${
                  active
                    ? "text-brand"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                <Icon className="h-[26px] w-[26px]" />
                <span className="text-[10px] font-medium tracking-tight">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
