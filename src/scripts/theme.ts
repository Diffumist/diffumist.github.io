const THEME_KEY = "theme";
const LIGHT = "light";
const DARK = "dark";
const AUTO = "auto";
// Click cycles through these in order.
const ORDER = [AUTO, LIGHT, DARK];

const media = window.matchMedia("(prefers-color-scheme: dark)");

function isPref(value: string | null): value is string {
  return value === LIGHT || value === DARK || value === AUTO;
}

function getStoredPref(): string {
  const stored = localStorage.getItem(THEME_KEY);
  return isPref(stored) ? stored : AUTO;
}

/** Resolve a preference to the concrete theme applied via `data-theme`. */
function resolve(value: string): string {
  if (value === AUTO) return media.matches ? DARK : LIGHT;
  return value;
}

// Reuse the value already set by the inline FOUC-prevention script if available.
let pref: string =
  (window as unknown as { __theme?: { pref?: string } }).__theme?.pref ??
  getStoredPref();

function persist(): void {
  localStorage.setItem(THEME_KEY, pref);
  reflect();
}

function reflect(): void {
  const root = document.firstElementChild;
  root?.setAttribute("data-theme", resolve(pref));
  // Drives which icon the theme button shows (see the `pref-*` variants).
  root?.setAttribute("data-theme-pref", pref);
  document.querySelector("#theme-btn")?.setAttribute("aria-label", pref);

  // Fill <meta name="theme-color"> with the computed background colour so
  // Android's browser chrome matches the page background.
  const bg = window.getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
}

function setup(): void {
  reflect();
  document.querySelector("#theme-btn")?.addEventListener("click", () => {
    pref = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    persist();
  });
}

setup();

// Re-run after View Transitions navigation.
document.addEventListener("astro:after-swap", setup);

// Carry the theme-color value across View Transitions to prevent the
// Android navigation bar from flashing during page transitions.
document.addEventListener("astro:before-swap", event => {
  const color = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");
  if (color) {
    (event as { newDocument: Document }).newDocument
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", color);
  }
});

// Follow OS-level dark/light changes only while in "auto" mode; an explicit
// light/dark choice is left untouched.
media.addEventListener("change", () => {
  if (pref === AUTO) reflect();
});
