export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "forge.theme";

export function initTheme() {
  const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
  applyTheme(stored);
  if (stored === "system") {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme("system"));
  }
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
}

function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}
