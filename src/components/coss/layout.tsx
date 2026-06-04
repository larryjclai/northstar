import type { CSSProperties, ReactNode } from "react";

/**
 * Content-driven layout primitives.
 *
 * These intentionally do NOT use viewport-width media queries. A viewport
 * breakpoint can't be trusted inside the iOS WKWebView: when any element
 * overflows horizontally the webview widens its layout viewport ("shrink to
 * fit"), so `@media (max-width: 900px)` stops matching and desktop multi-column
 * layouts leak onto a phone. Both primitives below reflow on the *available
 * width* instead (CSS `auto-fit` for AutoGrid, a container query for
 * SplitLayout), so they stay correct regardless of what the viewport reports.
 *
 * Prefer these over hand-rolled `gridTemplateColumns` so the responsive
 * behavior lives in one place and can't regress page by page.
 */

type Div = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * A responsive grid of equal cells. Columns are added/removed based on how many
 * `min`-wide cells fit the container — no breakpoints. Use for card rows, KPI
 * strips, and any "N equal things" grid.
 *
 * `min(${min}px, 100%)` keeps a single cell from overflowing when the container
 * is narrower than `min`.
 */
export function AutoGrid({
  min = 240,
  gap = 16,
  children,
  className,
  style,
}: Div & { min?: number; gap?: number }) {
  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
        gap,
        alignItems: "stretch",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A two-pane layout: a flexible main pane and a fixed-width side pane. Pass
 * exactly two children in source order; the layout stacks them in one column
 * until the *container* is wide enough (container query at 768px), then places
 * them side by side.
 *
 * `sidePosition` says which child is the fixed-width side:
 *   - `"end"` (default): the SECOND child is the side (right column on wide
 *     screens, below on a phone). Reading order keeps main first.
 *   - `"start"`: the FIRST child is the side (left column on wide screens, on
 *     top when stacked) — use it for a chart/summary that should lead.
 *
 * Refactoring is a drop-in: replace a `<div style/className grid>` wrapper with
 * `<SplitLayout sideWidth={320}>` and leave the two child panes untouched.
 */
export function SplitLayout({
  sideWidth = 320,
  sidePosition = "end",
  gap = 20,
  children,
  className,
  style,
}: Div & {
  sideWidth?: number;
  sidePosition?: "start" | "end";
  gap?: number;
}) {
  return (
    <div className={"coss-split" + (className ? ` ${className}` : "")}>
      <div
        className="coss-split-inner"
        data-side={sidePosition}
        style={
          {
            "--coss-split-side": `${sideWidth}px`,
            "--coss-split-gap": `${gap}px`,
            ...style,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
