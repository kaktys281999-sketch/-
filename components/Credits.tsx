"use client";

import { useMemo, useState } from "react";
import { useStore, creditInfo, creditView } from "@/lib/store";
import { Credit } from "@/lib/types";
import {
  formatMoney,
  formatDateShort,
  formatDateLong,
  todayISO,
  daysUntil,
  relativeDayLabel,
} from "@/lib/format";
import { Card, Money, ProgressBar, NumberInput, SearchField } from "./ui";

export function Credits() {
  const { state } = useStore();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const credits = useMemo(
    () => (state.credits ?? []).filter((c) => !c.deleted),
    [state.credits]
  );
  const agg = creditInfo(state);
  const open = openId ? credits.find((c) => c.id === openId) ?? null : null;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return credits;
    const qNum = q.replace(/\s/g, "");
    return credits.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.note ?? "").toLowerCase().includes(q) ||
        String(c.payment).includes(qNum)
    );
  }, [credits, q]);

  const views = useMemo(() => filtered.map(creditView), [filtered]);
  const active = views
    .filter((v) => !v.isPaidOff)
    .sort((a, b) => b.remaining - a.remaining);
  const paidOff = views.filter((v) => v.isPaidOff);

  if (adding) return <CreditForm onClose={() => setAdding(false)} />;
  if (open) return <CreditDetail credit={open} onClose={() => setOpenId(null)} />;

  const accountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      {/* Итоги */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-[13px] text-label-2">Осталось выплатить</div>
          <div className="mt-0.5 text-[22px] font-bold">
            {formatMoney(agg.remaining)}
          </div>
        </Card>
        <Card>
          <div className="text-[13px] text-label-2">Ближайший платёж</div>
          <div className="mt-0.5 text-[17px] font-semibold">
            {agg.nextPaymentDate
              ? `${formatMoney(agg.nextPaymentAmount)}`
              : "—"}
          </div>
          {agg.nextPaymentDate && (
            <div className="text-[13px] text-label-2">
              {formatDateShort(agg.nextPaymentDate)}
            </div>
          )}
        </Card>
      </div>

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="w-full rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-white"
      >
        Добавить кредит
      </button>

      {credits.length > 2 && (
        <SearchField value={query} onChange={setQuery} placeholder="Поиск: название, заметка…" />
      )}

      {credits.length === 0 && (
        <Card>
          <p className="py-8 text-center text-[15px] text-label-3">
            Кредитов пока нет
          </p>
        </Card>
      )}

      {q && active.length + paidOff.length === 0 && (
        <Card>
          <p className="py-8 text-center text-[15px] text-label-3">
            Ничего не найдено
          </p>
        </Card>
      )}

      {/* Активные карточки */}
      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
        {active.map((v) => (
          <CreditCard
            key={v.credit.id}
            view={v}
            accountName={accountName}
            onOpen={() => setOpenId(v.credit.id)}
            onQuickPay={() => setOpenId(v.credit.id)}
          />
        ))}
      </div>

      {paidOff.length > 0 && (
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
            Погашенные
          </div>
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {paidOff.map((v) => (
              <CreditCard
                key={v.credit.id}
                view={v}
                accountName={accountName}
                onOpen={() => setOpenId(v.credit.id)}
                muted
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Счёт для платежа: счёт кредита, иначе основной
function payAccountFor(c: Credit, primary?: string): string {
  return c.accountId || primary || "";
}

function CreditCard({
  view,
  accountName,
  onOpen,
  onQuickPay,
  muted = false,
}: {
  view: ReturnType<typeof creditView>;
  accountName: (id: string) => string;
  onOpen: () => void;
  onQuickPay?: () => void;
  muted?: boolean;
}) {
  const { credit: c, remaining, paidCount, totalDue, paid, nextPaymentDate, isPaidOff } =
    view;
  const percent = totalDue > 0 ? (paid / totalDue) * 100 : 0;

  return (
    <Card className={`!p-0 ${muted ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full px-4 pb-2 pt-3 text-left active:bg-black/[0.03] dark:active:bg-white/5"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[15px] font-medium">{c.name}</span>
          <span className="shrink-0 text-[15px] font-semibold">
            {isPaidOff ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                погашен
              </span>
            ) : (
              formatMoney(remaining)
            )}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-label-2">
          <span>
            платёж {formatMoney(c.payment)} · {paidCount} из {c.count}
            {nextPaymentDate ? ` · ${formatDateShort(nextPaymentDate)}` : ""}
          </span>
          {nextPaymentDate &&
            daysUntil(nextPaymentDate) <= 7 &&
            (() => {
              const urgent = daysUntil(nextPaymentDate) <= 0;
              return (
                <span
                  className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${
                    urgent
                      ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                  }`}
                >
                  {relativeDayLabel(nextPaymentDate)}
                </span>
              );
            })()}
        </div>
        <div className="mt-2">
          <ProgressBar percent={percent} />
        </div>
      </button>
      {!isPaidOff && onQuickPay && (
        <div className="border-t border-[var(--separator)] px-3 py-2">
          <button
            type="button"
            onClick={onQuickPay}
            className="w-full rounded-xl bg-brand/10 py-2 text-[14px] font-semibold text-brand active:bg-brand/20"
          >
            Внести платёж… {formatMoney(c.payment)} ({accountName(
              payAccountFor(c)
            )})
          </button>
        </div>
      )}
    </Card>
  );
}

// ===== Форма добавления кредита =====

function CreditForm({ onClose }: { onClose: () => void }) {
  const { state, addCredit } = useStore();
  const defaultAccount =
    (state.primaryAccountId &&
    state.accounts.some((a) => a.id === state.primaryAccountId)
      ? state.primaryAccountId
      : state.accounts[0]?.id) ?? "";

  const [name, setName] = useState("");
  const [received, setReceived] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [payment, setPayment] = useState("");
  const [count, setCount] = useState("");
  const [accountId, setAccountId] = useState(defaultAccount);
  const [receivedAffectsBalance, setReceivedAffectsBalance] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const labelCls =
    "block text-[13px] font-medium uppercase tracking-wide text-label-2 mb-2";
  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-3 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";
  const num = (s: string) => Math.abs(Number(s.replace(/\s/g, "").replace(",", ".")));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const pay = num(payment);
    const cnt = Math.round(num(count));
    const receivedAmount = num(received) || 0;
    if (!name.trim()) return setError("Укажите название");
    if (!pay) return setError("Введите размер платежа");
    if (!cnt) return setError("Введите количество платежей");
    addCredit({
      name: name.trim(),
      received: receivedAmount,
      receivedDate,
      payment: pay,
      count: cnt,
      accountId,
      receivedAccountId: accountId,
      receivedAffectsBalance: receivedAffectsBalance && receivedAmount > 0,
      note: note.trim(),
    });
    onClose();
  }

  return (
    <div className="space-y-3">
      <h2 className="px-1 text-xl font-bold tracking-tight">Новый кредит</h2>
      <Card>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className={labelCls}>Название</label>
            <input
              type="text"
              value={name}
              autoFocus
              onChange={(e) => {
                if (error) setError("");
                setName(e.target.value);
              }}
              placeholder="Альфа-Банк, рассрочка Ozon…"
              className={fieldCls}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Платёж, ₽</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={payment}
                onChange={(e) => {
                  if (error) setError("");
                  setPayment(e.target.value);
                }}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="0"
                className={fieldCls}
              />
            </div>
            <div className="flex-1">
              <label className={labelCls}>Платежей</label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={count}
                onChange={(e) => {
                  if (error) setError("");
                  setCount(e.target.value);
                }}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="0"
                className={fieldCls}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Получено, ₽</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="для переплаты"
                className={fieldCls}
              />
            </div>
            <div className="flex-1">
              <label className={labelCls}>Дата получения</label>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className={fieldCls}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-xl bg-black/[0.04] px-3.5 py-3 text-[14px] text-label-2 dark:bg-white/[0.06]">
            <input
              type="checkbox"
              checked={receivedAffectsBalance}
              onChange={(e) => setReceivedAffectsBalance(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span>
              Зачислить полученную сумму на выбранный счёт. Для рассрочки без
              получения денег выключи этот пункт.
            </span>
          </label>

          <div>
            <label className={labelCls}>Счёт получения и платежей</label>
            <div className="flex flex-wrap gap-2">
              {state.accounts.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setAccountId(a.id)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                    accountId === a.id
                      ? "bg-brand text-white"
                      : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Заметка</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Необязательно"
              className={fieldCls}
            />
          </div>

          {error && (
            <p className="text-center text-[13px] font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl bg-black/[0.06] py-3.5 text-[17px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-[2] rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-white"
            >
              Сохранить
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ===== Детали кредита + платежи =====

function CreditDetail({ credit, onClose }: { credit: Credit; onClose: () => void }) {
  const { state, addCreditPayment, deleteCreditPayment, updateCredit, deleteCredit } =
    useStore();
  const v = creditView(credit);
  const [payAmount, setPayAmount] = useState(String(credit.payment || ""));
  const [payAccount, setPayAccount] = useState(
    payAccountFor(credit, state.primaryAccountId)
  );
  const [payError, setPayError] = useState(false);
  const [editing, setEditing] = useState(false);

  const accountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "—";
  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";

  function addPayment() {
    const sum = Math.abs(Number(payAmount.replace(/\s/g, "").replace(",", ".")));
    if (!sum || Number.isNaN(sum)) {
      setPayError(true);
      return;
    }
    addCreditPayment(credit.id, {
      date: todayISO(),
      amount: sum,
      accountId: payAccount,
    });
    setPayAmount(String(credit.payment || ""));
    setPayError(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={onClose}
          className="text-[15px] font-medium text-brand"
        >
          ‹ Назад
        </button>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="text-[15px] font-medium text-brand"
        >
          {editing ? "Готово" : "Изменить"}
        </button>
      </div>

      {/* Шапка */}
      <Card>
        <div className="text-[15px] font-semibold">{credit.name}</div>
        <div className="mt-1 text-[34px] font-bold leading-none tracking-tight">
          {v.isPaidOff ? (
            <span className="text-emerald-600 dark:text-emerald-400">Погашен</span>
          ) : (
            formatMoney(v.remaining)
          )}
        </div>
        <div className="mt-2 text-[13px] text-label-2">
          {v.isPaidOff
            ? `Выплачено ${formatMoney(v.paid)}`
            : `Осталось из ${formatMoney(v.totalDue)} · платёж ${formatMoney(
                credit.payment
              )} · ${v.paidCount} из ${credit.count}`}
        </div>
        {v.paid > 0 && (
          <div className="mt-2">
            <ProgressBar percent={(v.paid / v.totalDue) * 100} />
          </div>
        )}
        {v.overpay !== 0 && credit.received > 0 && (
          <div className="mt-2 text-[13px] text-label-2">
            Переплата {formatMoney(v.overpay)}
          </div>
        )}
        {credit.receivedAffectsBalance && credit.received > 0 && (
          <div className="mt-2 text-[13px] text-label-2">
            Получено на {accountName(credit.receivedAccountId || credit.accountId)}
          </div>
        )}
        {credit.note && (
          <div className="mt-2 text-[13px] text-label-2">{credit.note}</div>
        )}
      </Card>

      {/* Внести платёж */}
      {!v.isPaidOff && !editing && (
        <Card>
          <div className="mb-2 text-[13px] font-medium uppercase tracking-wide text-label-2">
            Внести платёж
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={payAmount}
              onChange={(e) => {
                if (payError) setPayError(false);
                setPayAmount(e.target.value);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder={formatMoney(credit.payment)}
              className={`${fieldCls} flex-1`}
            />
            <button
              type="button"
              onClick={addPayment}
              className="shrink-0 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white"
            >
              Внести
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.accounts.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => setPayAccount(a.id)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                  payAccount === a.id
                    ? "bg-brand text-white"
                    : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
          {payError && (
            <p className="mt-2 text-[13px] font-medium text-red-600 dark:text-red-400">
              Введите сумму платежа
            </p>
          )}
        </Card>
      )}

      {/* Редактирование параметров кредита */}
      {editing && (
        <Card>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Название
              </label>
              <input
                type="text"
                value={credit.name}
                onChange={(e) => updateCredit(credit.id, { name: e.target.value })}
                className={fieldCls}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                  Платёж, ₽
                </label>
                <NumberInput
                  value={credit.payment}
                  onCommit={(n) => updateCredit(credit.id, { payment: n })}
                  className={fieldCls}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                  Платежей
                </label>
                <NumberInput
                  value={credit.count}
                  onCommit={(n) => updateCredit(credit.id, { count: n })}
                  className={fieldCls}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                  Получено, ₽
                </label>
                <NumberInput
                  value={credit.received}
                  onCommit={(n) => updateCredit(credit.id, { received: n })}
                  className={fieldCls}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                  Дата получения
                </label>
                <input
                  type="date"
                  value={credit.receivedDate}
                  onChange={(e) =>
                    updateCredit(credit.id, { receivedDate: e.target.value })
                  }
                  className={fieldCls}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                Счёт для платежей
              </label>
              <div className="flex flex-wrap gap-2">
                {state.accounts.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => updateCredit(credit.id, { accountId: a.id })}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                      credit.accountId === a.id
                        ? "bg-brand text-white"
                        : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-2 text-[15px] text-label-2">
              <input
                type="checkbox"
                checked={!!credit.receivedAffectsBalance}
                onChange={(e) =>
                  updateCredit(credit.id, {
                    receivedAffectsBalance: e.target.checked,
                    receivedAccountId: credit.receivedAccountId || credit.accountId,
                  })
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span>Зачислять полученную сумму на баланс счёта</span>
            </label>
            {credit.receivedAffectsBalance && (
              <div>
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
                  Счёт получения
                </label>
                <div className="flex flex-wrap gap-2">
                  {state.accounts.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() =>
                        updateCredit(credit.id, { receivedAccountId: a.id })
                      }
                      className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                        (credit.receivedAccountId || credit.accountId) === a.id
                          ? "bg-brand text-white"
                          : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                      }`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Расписание */}
      {credit.paymentDates.length > 0 && !editing && (
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
            Расписание
          </div>
          <Card className="!p-0">
            {credit.paymentDates.map((d, i) => {
              const done = i < v.paidCount;
              return (
                <div
                  key={d}
                  className={`flex items-center justify-between px-4 py-2.5 text-[15px] ${
                    i > 0 ? "border-t border-[var(--separator)]" : ""
                  }`}
                >
                  <span className={done ? "text-label-3 line-through" : ""}>
                    {formatDateLong(d)}
                  </span>
                  <span
                    className={
                      done
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-label-2"
                    }
                  >
                    {done ? "оплачено" : formatMoney(credit.payment)}
                  </span>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* История платежей */}
      {credit.payments.length > 0 && (
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
            Платежи
          </div>
          <Card className="!p-0">
            {[...credit.payments]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-4 py-3 text-[15px] ${
                    i > 0 ? "border-t border-[var(--separator)]" : ""
                  }`}
                >
                  <span className="text-label-2">
                    {formatDateShort(p.date)} · {accountName(p.accountId)}
                  </span>
                  <span className="flex items-center gap-3">
                    <Money value={-p.amount} />
                    <button
                      type="button"
                      onClick={() => deleteCreditPayment(credit.id, p.id)}
                      aria-label="Удалить платёж"
                      className="text-label-3"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
          </Card>
        </div>
      )}

      {/* Удалить кредит */}
      <Card className="!p-0">
        <button
          type="button"
          onClick={() => {
            if (confirm("Удалить кредит и историю платежей?")) {
              deleteCredit(credit.id);
              onClose();
            }
          }}
          className="w-full py-3.5 text-center text-[17px] font-medium text-red-600 dark:text-red-400"
        >
          Удалить кредит
        </button>
      </Card>
    </div>
  );
}
