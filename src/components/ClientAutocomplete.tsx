import { useMemo, useState } from "react";
import type { Client } from "../domain/types";

/**
 * 客戶 autocomplete for the 開發票 flow (plan 191 step 2/5) — mirrors
 * `SuggestInput` (`QuickAdd.tsx`): a plain text input with a
 * lightweight filtered dropdown, free text still allowed. Selecting an
 * existing client hands back the full `Client` record so the caller can reuse
 * its 統編/收款期限 the same way merchant selection reuses a learned category
 * (`docs/ledger-books-plan.md` §"客戶主檔").
 */
export function ClientAutocomplete({
  value,
  clients,
  onChange,
}: {
  value: string;
  /** Book-scoped client list. */
  clients: Client[];
  /** Called on every keystroke (client: null) and on selection (client: the match). */
  onChange: (name: string, client: Client | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = q
      ? clients.filter((c) => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q)
      : clients;
    return pool.slice(0, 8);
  }, [value, clients]);

  const visible = open && matches.length > 0;

  function select(client: Client) {
    onChange(client.name, client);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        className="ns-input"
        value={value}
        placeholder="例：小明、ABC 公司"
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value, null);
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
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {visible ? (
        <div
          role="listbox"
          aria-label="客戶建議"
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
          {matches.map((client, i) => (
            <button
              key={client.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              className="text-xs"
              onMouseDown={(e) => {
                e.preventDefault();
                select(client);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                padding: "6px 8px",
                borderRadius: "var(--ns-r-xs)",
                border: "none",
                fontFamily: "inherit",
                background: i === highlight ? "var(--ns-bg-hover)" : "transparent",
                color: "var(--ns-fg)",
              }}
            >
              <span>{client.name}</span>
              {client.taxId ? (
                <span className="muted text-micro" style={{ fontFamily: "var(--ns-font-mono)" }}>
                  {client.taxId}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
