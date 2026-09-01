"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

// Числовое поле с локальным буфером ввода: позволяет очищать/вводить
// промежуточные значения, не схлопывая значение в 0, и фиксирует
// только корректные числа.
export function NumberInput({
  value,
  onCommit,
  className = "",
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [text, setText] = useState<string>(() => String(value));
  // последнее значение, которое мы сами зафиксировали — чтобы отличать
  // внешние изменения (сброс, операции) от собственных
  const lastValue = useRef<number>(value);

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setText(String(value));
    }
  }, [value]);

  return (
    <input
      type="number"
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t === "" || t === "-") return;
        const n = Number(t);
        if (!Number.isNaN(n)) {
          lastValue.current = n;
          onCommit(n);
        }
      }}
      onBlur={() => {
        if (text === "" || Number.isNaN(Number(text))) {
          setText(String(value));
        }
      }}
      onWheel={(e) => e.currentTarget.blur()}
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
