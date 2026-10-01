"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

// Числовое поле с локальным буфером ввода: позволяет очищать/вводить
// промежуточные значения и фиксирует число при выходе из поля или по Enter.
// Раньше оно фиксировало каждое нажатие, а округлённое значение тут же
// возвращалось в поле: при вводе 1234,56 получалось 12356. Запятая и точка
// принимаются одинаково. Сохраняем ТОЛЬКО если пользователь правил текст:
// иначе значение, изменившееся за время фокуса (пришла синхронизация),
// перезаписалось бы устаревшим.
export function NumberInput({
  value,
  onCommit,
  className = "",
  integer = false,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  // целое число (день месяца, количество платежей): цифровая клавиатура и округление
  integer?: boolean;
}) {
  const [text, setText] = useState<string>(() => String(value));
  // пока поле в фокусе, внешнее значение не перетирает набираемый текст
  const focused = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!focused.current || !dirty.current) setText(String(value));
  }, [value]);

  function commit() {
    if (!dirty.current) {
      setText(String(value));
      return;
    }
    dirty.current = false;
    const t = text.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(t);
    if (t === "" || t === "-" || Number.isNaN(parsed)) {
      setText(String(value));
      return;
    }
    const n = integer ? Math.round(parsed) : parsed;
    if (n !== value) onCommit(n);
    else setText(String(value));
  }

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={text}
      onFocus={() => {
        focused.current = true;
        dirty.current = false;
      }}
      onChange={(e) => {
        dirty.current = true;
        setText(e.target.value.replace(/[^\d.,\-\s]/g, ""));
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={className}
    />
  );
}

// Поле поиска в стиле iOS с иконкой и кнопкой очистки
export function SearchField({
  value,
  onChange,
  placeholder = "Поиск…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-label-3"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl bg-black/[0.04] py-2.5 pl-9 pr-9 text-[15px] outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Очистить"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-label-3 active:bg-black/10 dark:active:bg-white/10"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Мини-столбчатый график (спарклайн): + зелёным вверх, − красным вниз,
// относительно максимума по модулю. Тянется на всю ширину контейнера.
export function Sparkline({
  values,
  className = "",
}: {
  values: number[];
  className?: string;
}) {
  const n = values.length || 1;
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const W = 100;
  const H = 24;
  const mid = H / 2;
  const gap = 2;
  const barW = (W - (n - 1) * gap) / n;
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
    >
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="currentColor" strokeOpacity="0.12" />
      {values.map((v, i) => {
        const bh = (Math.abs(v) / max) * (mid - 2);
        const h = v === 0 ? 0 : Math.max(1, bh);
        const x = i * (barW + gap);
        const y = v >= 0 ? mid - h : mid;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            fill={v >= 0 ? "#10b981" : "#f43f5e"}
          />
        );
      })}
    </svg>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ios-card p-4 ${className}`}>{children}</div>
  );
}

// iOS-цвета акцентов (системный фиолетовый/зелёный/красный)
export function ProgressBarThin({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// Денежная сумма: отрицательные — красным, опц. положительные — зелёным
export function Money({
  value,
  className = "",
  colorNegative = true,
  colorPositive = false,
  showPlus = false,
}: {
  value: number;
  className?: string;
  colorNegative?: boolean;
  colorPositive?: boolean;
  showPlus?: boolean;
}) {
  const negative = value < 0;
  const positive = value > 0;
  const text =
    showPlus && value > 0 ? `+${formatMoney(value)}` : formatMoney(value);
  let color = "";
  if (colorNegative && negative) color = "text-red-600 dark:text-red-400";
  else if (colorPositive && positive)
    color = "text-emerald-600 dark:text-emerald-400";
  return <span className={`${color} ${className}`}>{text}</span>;
}

export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
