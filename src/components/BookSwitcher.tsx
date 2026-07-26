import { useState } from "react";
import { Buildings, CaretUpDown, Check } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useUiPreferences } from "../state/uiPreferences";
import { ALL_BOOKS } from "../domain/bookScope";
import { useFinanceData } from "../data/hooks";
import type { Book } from "../domain/types";

const NEUTRAL_DOT_COLOR = "var(--ns-fg-dim)";

function BookDot({ color, size = 9 }: { color: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color || NEUTRAL_DOT_COLOR,
        flexShrink: 0,
      }}
    />
  );
}

/**
 * 帳本 (Books) switcher — sidebar row between Global Search and Quick Add
 * triggers (docs/ledger-books-plan.md §5). Lists every real book plus a 總帳
 * (consolidated) pseudo-entry with a neutral accent; picking one sets
 * `activeBookId` in uiPreferences, which every scoped route reads via
 * `bookScope.ts`'s `bookAccountIdSet`. Collapsed sidebar mode mirrors
 * Search/QuickAdd's icon-only presentation.
 */
export function BookSwitcher({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const { books } = useFinanceData();
  const activeBookId = useUiPreferences((state) => state.activeBookId);
  const setActiveBookId = useUiPreferences((state) => state.setActiveBookId);

  const bookRows: Book[] = books.data ?? [];
  const activeBook =
    activeBookId === ALL_BOOKS ? null : (bookRows.find((b) => b.id === activeBookId) ?? null);
  // Fallback label/dot for an activeBookId that no longer resolves (e.g. data
  // not loaded yet) — treat as 總帳 visually rather than showing nothing.
  const label = activeBookId === ALL_BOOKS || !activeBook ? "總帳" : activeBook.name;
  const dotColor = activeBook ? activeBook.color : null;

  function select(id: string) {
    setActiveBookId(id);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          collapsed ? (
            <button
              type="button"
              title={`帳本：${label}`}
              className="ns-nav-link w-full"
              style={{ justifyContent: "center", padding: "9px 8px" }}
            >
              {activeBook ? <BookDot color={dotColor} size={11} /> : <Buildings size={16} />}
            </button>
          ) : (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-body text-muted-foreground bg-secondary/30 hover:bg-secondary/50 rounded-md border border-border/50 transition-colors muted"
            >
              <BookDot color={dotColor} />
              <span
                className="flex-1 text-left"
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {label}
              </span>
              <CaretUpDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            </button>
          )
        }
      />
      {/* The sidebar <aside> sits at z-index 1100 (AppShell.tsx — deliberate, so
          full-viewport scrims don't grey out the vibrancy sidebar). This popover
          portals to document.body and would default to z-50, i.e. *behind* the
          sidebar. Raise the positioner above it. */}
      <PopoverContent
        align="start"
        className="w-64 p-1"
        positionerClassName="z-[1101]"
        style={{ width: 220 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <button
            type="button"
            onClick={() => select(ALL_BOOKS)}
            className={`ns-nav-link w-full${activeBookId === ALL_BOOKS ? " active" : ""}`}
            style={{ justifyContent: "flex-start" }}
          >
            <BookDot color={null} />
            <span style={{ flex: 1, textAlign: "left" }}>總帳</span>
            {activeBookId === ALL_BOOKS ? <Check size={14} /> : null}
          </button>
          {bookRows.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => select(b.id)}
              className={`ns-nav-link w-full${activeBookId === b.id ? " active" : ""}`}
              style={{ justifyContent: "flex-start" }}
            >
              <BookDot color={b.color} />
              <span
                style={{
                  flex: 1,
                  textAlign: "left",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {b.name}
              </span>
              {activeBookId === b.id ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
