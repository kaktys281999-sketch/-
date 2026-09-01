export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "finance-theme";

// Тема по умолчанию, пока пользователь не выбрал явно
export const DEFAULT_THEME: Theme = "dark";

// Скрипт, который применяет тему ДО первой отрисовки (вставляется в <head>),
// чтобы не было мигания. По умолчанию — тёмная.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}')||'${DEFAULT_THEME}';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.add('dark');}})();`;

export function getTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const t = window.localStorage.getItem(THEME_KEY);
  return t === "light" || t === "dark" || t === "system" ? t : DEFAULT_THEME;
}

export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}
