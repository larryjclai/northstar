import { useMemo, useState } from "react";

// ── 商家 autocomplete (plan 180) ─────────────────────────────────────────────
// Free-text input with a lightweight filtered dropdown of known merchants.
// Deliberately not the Popover+Command combobox (AccountFilter): that pattern
// wraps a button trigger, but this field must stay a plain text input.

export function MerchantAutocomplete({ value, merchants, onChange, placeholder = "選填" }: {
  value: string;
  /** Known merchant names, ranked by history frequency (unfiltered — the component filters). */
  merchants: string[];
  /** Called for both typing and selecting an entry. */
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    // Substring filter (case-insensitive; CJK needs no tokenization). Hide the
    // exact current value — the dropdown would only repeat what's typed.
    const pool = q ? merchants.filter((m) => m.toLowerCase().includes(q) && m.toLowerCase() !== q) : merchants;
    return pool.slice(0, 8);
  }, [value, merchants]);

  const visible = open && matches.length > 0;

  function select(merchant: string) {
    onChange(merchant);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        className="ns-input"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(0); }}
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
            // Close only the dropdown — QuickAdd's overlay listens for Escape
            // on window, so keep the event from reaching it.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {visible ? (
        <div
          role="listbox"
          aria-label="商家建議"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 90,
            maxHeight: 224, overflowY: "auto", padding: 4,
            background: "var(--ns-bg-elev)", border: "1px solid var(--ns-border)",
            borderRadius: "var(--ns-r-sm)", boxShadow: "var(--ns-shadow-strong)",
          }}
        >
          {matches.map((merchant, i) => (
            <button
              key={merchant}
              type="button"
              role="option"
              aria-selected={i === highlight}
              className="text-xs"
              // onMouseDown (not onClick) so the input's blur doesn't close the
              // dropdown before the selection lands.
              onMouseDown={(e) => { e.preventDefault(); select(merchant); }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                padding: "6px 8px", borderRadius: "var(--ns-r-xs)", border: "none", fontFamily: "inherit",
                background: i === highlight ? "var(--ns-bg-hover)" : "transparent",
                color: "var(--ns-fg)",
              }}
            >
              {merchant}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
