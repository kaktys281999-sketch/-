// Форматирование суммы вида «12 345 ₽». Отрицательные — со знаком минус.
export function formatMoney(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  // Разделитель тысяч — неразрывный пробел
  const grouped = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped} ₽`;
}

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// Ключ месяца «YYYY-MM»
export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

export function monthKeyFromISO(iso: string): string {
  return iso.slice(0, 7);
}

// «Май 2026» по ключу месяца
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

// «май» по ключу месяца (краткая подпись)
export function monthShortLabel(key: string): string {
  const m = Number(key.split("-")[1]);
  return MONTHS_SHORT[m - 1];
}

// «26 мая 2026» по ISO-дате
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_GENITIVE[m - 1]} ${y}`;
}

// «26 мая» (без года)
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_GENITIVE[m - 1]}`;
}

// Сколько дней от сегодня до даты (отрицательное — дата в прошлом)
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = "дней";
  if (mod10 === 1 && mod100 !== 11) word = "день";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = "дня";
  return `${n} ${word}`;
}

// «сегодня» / «завтра» / «через 5 дней» / «просрочен на 3 дня»
export function relativeDayLabel(iso: string): string {
  const d = daysUntil(iso);
  if (d < 0) return `просрочен на ${pluralDays(-d)}`;
  if (d === 0) return "сегодня";
  if (d === 1) return "завтра";
  return `через ${pluralDays(d)}`;
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return monthKey(date);
}

// Прибавить n месяцев к ISO-дате, сохранив день (с обрезкой под короткие месяцы).
export function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y, m - 1 + n, 1);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const yy = base.getFullYear();
  const mm = (base.getMonth() + 1).toString().padStart(2, "0");
  const dd = day.toString().padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Расписание платежей: count дат, ежемесячно, начиная со следующего месяца
// после даты получения (May 26 → Jun 26, Jul 26, …).
export function generatePaymentDates(receivedDate: string, count: number): string[] {
  if (!receivedDate || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => addMonthsISO(receivedDate, i + 1));
}
