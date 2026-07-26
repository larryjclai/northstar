import "@testing-library/jest-dom/vitest";

// jsdom in this repo's Node/vitest setup does not expose `window.localStorage`
// — empirically verified under plan 275: `typeof window.localStorage` is
// `"undefined"` even though `document.URL` is a real origin
// (`http://localhost:3000/`), which is the condition jsdom normally requires.
// Node's own experimental global `localStorage` (unavailable without
// `--localstorage-file`) appears to shadow jsdom's implementation instead of
// letting it install. Module-scope code that reads localStorage eagerly on
// import (e.g. state/uiPreferences's `loadPersisted()`) would throw before a
// test ever runs. Install a minimal Map-backed fallback here, guarded to skip
// if something already provided one, so the test files that stub their own
// via `vi.stubGlobal("localStorage", ...)` for isolation/inspection still
// take precedence — their stub runs after this setupFiles hook and simply
// overwrites the global.
if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
  const store = new Map<string, string>();
  const memoryLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(window, "localStorage", {
    value: memoryLocalStorage,
    writable: true,
    configurable: true,
  });
}
