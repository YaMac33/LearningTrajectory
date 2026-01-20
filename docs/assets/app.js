// docs/assets/app.js
// Common JS (Dark mode toggle)

(function () {
  function applyTheme(theme) {
    const root = document.documentElement;
    const sunIcon = document.getElementById("sun-icon");
    const moonIcon = document.getElementById("moon-icon");

    if (theme === "dark") {
      root.classList.add("dark");
      if (sunIcon) sunIcon.classList.remove("hidden");
      if (moonIcon) moonIcon.classList.add("hidden");
    } else {
      root.classList.remove("dark");
      if (sunIcon) sunIcon.classList.add("hidden");
      if (moonIcon) moonIcon.classList.remove("hidden");
    }
  }

  function getInitialTheme() {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;

    // default: system preference
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  // 1) Apply ASAP
  applyTheme(getInitialTheme());

  // 2) Bind toggle when DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const isDark = document.documentElement.classList.contains("dark");
      const next = isDark ? "light" : "dark";
      localStorage.setItem("theme", next);
      applyTheme(next);
    });
  });
})();
