"use client";

import { useEffect, useState, ComponentType } from "react";
import { monthKey } from "@/lib/format";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Summary } from "@/components/Summary";
import { AddOperation } from "@/components/AddOperation";
import { Operations } from "@/components/Operations";
import { Settings } from "@/components/Settings";
import { Logo } from "@/components/Logo";
import {
  IconSummary,
  IconAdd,
  IconList,
  IconSettings,
} from "@/components/icons";

type Tab = "summary" | "add" | "operations" | "settings";

const TABS: {
  id: Tab;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "summary", label: "Сводка", Icon: IconSummary },
  { id: "add", label: "Добавить", Icon: IconAdd },
  { id: "operations", label: "Операции", Icon: IconList },
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

  // Брендовый экран загрузки
  if (!month) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-brand to-brand-deep text-white">
        <Logo className="h-16 w-16 animate-pulse" />
        <div className="text-xl font-extrabold tracking-tight">Финансы</div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* Шапка с логотипом */}
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-brand-tint/90 px-4 py-3 backdrop-blur">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
          <Logo className="h-5 w-5" />
        </span>
        <span className="text-lg font-extrabold tracking-tight text-slate-900">
          Финансы
        </span>
      </header>

      <div className="flex-1 space-y-3 px-3 pb-28 pt-1">
        {showMonthSwitcher && (
          <MonthSwitcher value={month} onChange={setMonth} />
        )}

        {tab === "summary" && <Summary month={month} />}
        {tab === "add" && <AddOperation onAdded={() => setTab("operations")} />}
        {tab === "operations" && <Operations month={month} />}
        {tab === "settings" && <Settings />}
      </div>

      {/* Нижняя навигация */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md px-2 pb-[env(safe-area-inset-bottom)]">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="flex flex-1 flex-col items-center gap-1 py-2"
              >
                <span
                  className={`flex h-9 w-14 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-brand/10 text-brand" : "text-slate-400"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span
                  className={`text-[11px] font-semibold ${
                    active ? "text-brand" : "text-slate-400"
                  }`}
                >
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
