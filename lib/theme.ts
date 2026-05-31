export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "finance-theme";

// Скрипт, который применяет тему ДО первой отрисовки (вставляется в <head>),
// чтобы не было мигания светлой темы.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export function getTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const t = window.localStorage.getItem(THEME_KEY);
  return t === "light" || t === "dark" ? t : "system";
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
