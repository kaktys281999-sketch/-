import { OpType } from "./types";

export interface CategoryDef {
  name: string;
  // знак для влияния на баланс (актуально для группы «Кредиты и займы»)
  sign: 1 | -1;
}

export interface TypeDef {
  type: OpType;
  label: string;
  categories: CategoryDef[];
}

export const TYPES: TypeDef[] = [
  {
    type: "income",
    label: "Доход",
    categories: [
      { name: "Проектные выплаты", sign: 1 },
      { name: "Разовые сделки", sign: 1 },
      { name: "Прочий доход", sign: 1 },
    ],
  },
  {
    type: "expense_personal",
    label: "Расход — личное",
    categories: [
      { name: "Продукты / еда / вода", sign: -1 },
      { name: "Проезд / транспорт", sign: -1 },
      { name: "Мобильный / подписки", sign: -1 },
      { name: "Остальное / разное", sign: -1 },
    ],
  },
  {
    type: "expense_work",
    label: "Расход — рабочее",
    categories: [
      { name: "Claude / GPT / нейросети", sign: -1 },
      { name: "Profi", sign: -1 },
      { name: "Selectel / хостинг", sign: -1 },
    ],
  },
  {
    type: "credit_loan",
    label: "Кредиты и займы",
    categories: [
      { name: "Получен кредит", sign: 1 },
      { name: "Платёж по кредиту", sign: -1 },
      { name: "Дал в долг", sign: -1 },
      { name: "Возврат долга мне", sign: 1 },
    ],
  },
];

export function getTypeDef(type: OpType): TypeDef {
  return TYPES.find((t) => t.type === type) ?? TYPES[0];
}

export function getCategorySign(type: OpType, category: string): 1 | -1 {
  const def = getTypeDef(type);
  const cat = def.categories.find((c) => c.name === category);
  return cat?.sign ?? (type === "income" ? 1 : -1);
}

export function typeLabel(type: OpType): string {
  return getTypeDef(type).label;
}

export const CREDIT_PAYMENT_CATEGORY = "Платёж по кредиту";
