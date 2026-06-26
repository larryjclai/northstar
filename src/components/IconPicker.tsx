import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { ICON_GROUPS, ICON_KEYWORDS, ICON_REGISTRY } from "../lib/icons";

/**
 * Curated Phosphor icon grid with search, used to personalize accounts and
 * categories. Emits the Phosphor component name (stored in `iconName`), which
 * the `Glyph` renderer resolves back to the matching icon.
 *
 * Drops into the existing `<PopoverContent>` slots that previously held the
 * emoji picker.
 */
export function IconPicker({
  value,
  onSelect,
}: {
  value?: string | null;
  onSelect: (name: string) => void;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_GROUPS;
    return ICON_GROUPS.map((g) => ({
      ...g,
      names: g.names.filter(
        (n) => n.toLowerCase().includes(q) || (ICON_KEYWORDS[n] ?? "").toLowerCase().includes(q)
      ),
    })).filter((g) => g.names.length > 0);
  }, [query]);

  return (
    <div style={{ width: 300, padding: 12, maxHeight: 400, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "relative" }}>
        <MagnifyingGlass size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ns-fg-dim)", pointerEvents: "none" }} />
        <input
          autoFocus
          className="ns-input text-body"
          placeholder="搜尋圖示…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%", height: 34, padding: "0 10px 0 30px", boxSizing: "border-box" }}
        />
      </div>
      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 2 }}>
        {groups.length === 0 ? (
          <div className="muted text-body" style={{ textAlign: "center", padding: "16px 0" }}>找不到圖示</div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="text-xs" style={{  marginBottom: 6 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>{g.label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
                {g.names.map((name) => {
                  const Icon = ICON_REGISTRY[name];
                  const active = value === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      title={ICON_KEYWORDS[name] || name}
                      onClick={() => onSelect(name)}
                      style={{
                        width: "100%", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: "var(--ns-r-sm)", cursor: "pointer",
                        background: active ? "var(--ns-accent)" : "var(--ns-bg-hover)",
                        color: active ? "var(--ns-bg)" : "var(--ns-fg)",
                        border: active ? "1px solid var(--ns-accent)" : "1px solid var(--ns-border)",
                      }}
                    >
                      <Icon size={18} weight={active ? "fill" : "regular"} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
