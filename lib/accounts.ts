// Цвет-метка счёта по id. Фирменные цвета банков, нейтральный для остальных.
const ACCOUNT_COLORS: Record<string, string> = {
  yandex: "#FC3F1D",
  sber: "#21A038",
  tinkoff: "#FFDD2D",
  cash: "#34C759",
};

export function accountColor(id: string): string {
  return ACCOUNT_COLORS[id] ?? "#94a3b8";
}
