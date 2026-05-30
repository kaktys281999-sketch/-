"use client";

import { ReactNode } from "react";
import { formatMoney } from "@/lib/format";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// Денежная сумма: отрицательные — красным
export function Money({
  value,
  className = "",
  colorNegative = true,
  showPlus = false,
}: {
  value: number;
  className?: string;
  colorNegative?: boolean;
  showPlus?: boolean;
}) {
  const negative = value < 0;
  const text =
    showPlus && value > 0 ? `+${formatMoney(value)}` : formatMoney(value);
  return (
    <span
      className={`${
        colorNegative && negative ? "text-red-600" : ""
      } ${className}`}
    >
      {text}
    </span>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
