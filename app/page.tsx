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
    <main className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* iOS large title */}
      <header className="sticky top-0 z-10 bg-[var(--bg)]/80 px-4 pb-1 pt-3 backdrop-blur-xl">
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

      <div className="flex-1 space-y-4 px-4 pb-28 pt-1">
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
            <AddOperation
              onShowMonth={(m) => {
                setMonth(m);
                setTab("operations");
              }}
            />
          )}
          {tab === "operations" && <Operations month={month} />}
          {tab === "debts" && <Debts />}
          {tab === "settings" && <Settings />}
        </div>
      </div>

      {/* iOS tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--separator)] bg-[var(--card)]/80 backdrop-blur-xl">
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
