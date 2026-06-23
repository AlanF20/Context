/**
 * theme.js — light/dark theme for the panel UI.
 *
 * The theme only toggles the panel's tokens (data-theme on <html>); the
 * Monaco editor stays dark and the underlined web page is never themed.
 * The choice persists in localStorage.
 */
const THEME_KEY = "ch.theme";

function setIcon(toggleEl, theme) {
  toggleEl.textContent = theme === "dark" ? "☾" : "◐";
}

function apply(theme, toggleEl) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  setIcon(toggleEl, theme);
}

/** Wire the toggle button and apply the stored (or default) theme. */
export function initTheme(toggleEl) {
  apply(localStorage.getItem(THEME_KEY) || "light", toggleEl);
  toggleEl.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    apply(next, toggleEl);
  });
}
