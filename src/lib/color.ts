// Contrast helper for arbitrary background colors (category chips, etc.).
// Picks a readable near-black / white foreground via WCAG relative luminance so
// a colored background never swallows its label (B14). Handles hex, rgb()/rgba(),
// and theme-aware var(--x) (resolved against :root at call time).

const LIGHT_FG = "#1a1a1a";
const DARK_FG = "#ffffff";
// Perceptual midpoint: backgrounds brighter than this read better with dark text.
// Catches light category colors (yellow/orange/light-green) that white text drowns in.
const LUMINANCE_THRESHOLD = 0.5;

// Cache only stable inputs (hex/rgb). var(...) results depend on the active
// theme, so they are recomputed each call.
const cache = new Map<string, string>();

function resolveVar(color: string): string {
  if (!color.startsWith("var(")) return color;
  const name = color.slice(4, color.lastIndexOf(")")).split(",")[0].trim();
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function toRgb(input: string): [number, number, number] | null {
  const color = resolveVar(input.trim());
  if (!color) return null;

  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    if (hex.length !== 6) return null;
    const n = Number.parseInt(hex, 16);
    if (Number.isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const match = color.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1]
      .split(/[\s,/]+/)
      .map(Number)
      .filter((v) => !Number.isNaN(v));
    if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  }
  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Readable foreground (near-black or white) for an arbitrary background color.
 * Falls back to white for colors that can't be resolved (e.g. unknown formats),
 * matching the previous hardcoded behavior.
 */
export function readableTextColor(background: string): string {
  const isVar = background.startsWith("var(");
  if (!isVar && cache.has(background)) return cache.get(background)!;
  const rgb = toRgb(background);
  const fg = rgb && relativeLuminance(rgb) > LUMINANCE_THRESHOLD ? LIGHT_FG : DARK_FG;
  if (!isVar) cache.set(background, fg);
  return fg;
}
