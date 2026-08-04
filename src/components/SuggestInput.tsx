import { useMemo, useState } from "react";

// ── Free-text autocomplete (plan 180, generalized in plan 282) ─────────────
// Free-text input with a lightweight filtered dropdown of known suggestions
// (merchants, transaction names, …). Deliberately not the Popover+Command
// combobox (AccountFilter): that pattern wraps a button trigger, but this
// field must stay a plain text input.

export function SuggestInput({
  value,
  options,
  onChange,
  placeholder = "選填",
  ariaLabel = "建議",
}: {
  value: string;
  /** Known suggestion values, ranked by history frequency (unfiltered — the component filters). */
  options: string[];
  /** Called for both typing and selecting an entry. */
  onChange: (v: string) => void;
  placeholder?: string;
  /** aria-label for the suggestion dropdown's listbox. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    // Substring filter (case-insensitive; CJK needs no tokenization). Hide the
    // exact current value — the dropdown would only repeat what's typed.
    const pool = q
      ? options.filter((m) => m.toLowerCase().includes(q) && m.toLowerCase() !== q)
      : options;
    return pool.slice(0, 8);
  }, [value, options]);

  const visible = open && matches.length > 0;

  function select(option: string) {
    onChange(option);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative", minWidth: "min(240px, 90vw)" }}>
      <input
        className="ns-input"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!visible) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            select(matches[Math.min(highlight, matches.length - 1)]);
          } else if (e.key === "Escape") {
            // Close only the dropdown, not the host overlay. `preventDefault()`
            // is the contract both kinds of host honor: a window-listener
            // overlay (QuickAdd) never sees this Escape because
            // `stopPropagation()` keeps it from reaching `window`; a
            // ModalShell host (plan 305) defers its own Escape-close check by
            // one microtask specifically so it can read `defaultPrevented`
            // and back off when a nested field — like this one — already
            // consumed the key.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {visible ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 90,
            maxHeight: 224,
            overflowY: "auto",
            padding: 4,
            background: "var(--ns-bg-elev)",
            border: "1px solid var(--ns-border)",
            borderRadius: "var(--ns-r-sm)",
            boxShadow: "var(--ns-shadow-strong)",
          }}
        >
          {matches.map((option, i) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={i === highlight}
              className="text-xs ns-suggest-option"
              // onMouseDown (not onClick) so the input's blur doesn't close the
              // dropdown before the selection lands.
              onMouseDown={(e) => {
                e.preventDefault();
                select(option);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                borderRadius: "var(--ns-r-xs)",
                border: "none",
                fontFamily: "inherit",
                background: i === highlight ? "var(--ns-bg-hover)" : "transparent",
                color: "var(--ns-fg)",
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
