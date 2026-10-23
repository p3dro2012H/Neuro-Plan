import { useState } from "react";

type Theme = "light" | "dark";
export function initializeTheme() {
  let theme: Theme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  try {
    const saved = localStorage.getItem("neuroplan-theme");
    if (saved === "dark" || saved === "light") theme = saved;
  } catch {
    /* A troca também funciona sem armazenamento. */
  }
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="secondary theme-toggle"
      aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={dark ? "Ativar modo claro" : "Ativar modo escuro"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        setTheme(next);
        try {
          localStorage.setItem("neuroplan-theme", next);
        } catch {
          /* opcional */
        }
      }}
    >
      <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
      {dark ? "Modo claro" : "Modo escuro"}
    </button>
  );
}
