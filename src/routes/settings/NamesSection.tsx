import { PencilSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { Button } from "../../components/coss/button";
import { Card } from "../../components/coss/card";
import { useToast } from "../../components/Toast";
import { buildLedgerLabelStats } from "../../domain";
import type { LedgerTransaction } from "../../domain";

const PAGE_SIZE = 200;

// ─────── 名稱 Tab (plan 282) ───────
// Mirrors SettingsMerchants' visual shape and edit UX, but with no add/delete:
// "名稱" has no settings-backed master list (decision A) — it is purely
// derived from ledger history via buildLedgerLabelStats. Renaming here cascades
// to every active ledger row sharing the old name (renameLedgerName).
export function SettingsNames({
  ledgerRows,
  t,
  renameName,
}: {
  ledgerRows: LedgerTransaction[];
  t: TFunction;
  renameName: (oldName: string, newName: string) => Promise<number>;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // Suppresses the unmount-triggered onBlur from re-firing saveEdit after an
  // Enter/Escape already resolved the edit (otherwise every save runs twice).
  const skipBlurRef = useRef(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const all = useMemo(() => buildLedgerLabelStats(ledgerRows, "name"), [ledgerRows]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? all.filter((n) => n.value.toLowerCase().includes(q)) : all;
  }, [all, search]);

  // Searching a narrower result set then clearing the search must not dump
  // thousands of rows back onto the DOM at once — reset the window every time
  // the query changes (plan 282's rendering-cost guardrail).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const visible = filtered.slice(0, visibleCount);

  function startEdit(name: string) {
    skipBlurRef.current = false;
    setEditingName(name);
    setEditValue(name);
  }

  function cancelEdit() {
    skipBlurRef.current = true;
    setEditingName(null);
  }

  async function saveEdit(oldName: string) {
    const next = editValue.trim();
    // Close the editor first; the unmount fires onBlur, which the ref guard
    // swallows so the rename only runs once.
    skipBlurRef.current = true;
    setEditingName(null);
    if (!next || next === oldName) return;
    // Renaming onto an existing name is a deliberate merge (plan 282 decision
    // B) — there is no "already exists" guard here.
    const n = await renameName(oldName, next);
    toast.success(`已更新 ${n} 筆`);
  }

  return (
    <div className="max-w-4xl">
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <div
            className="text-xs"
            style={{ marginBottom: 4, color: "var(--ns-fg-muted)", fontWeight: 500 }}
          >
            Auto-categorisation · {all.length} names
          </div>
          <h2
            style={{
              fontFamily: "var(--ns-font-display)",
              fontSize: 24,
              margin: 0,
              fontWeight: 600,
            }}
          >
            {t("settings.names")}
          </h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            {t("settings.namesDesc")}
          </p>
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <input
          className="ns-input"
          placeholder="搜尋交易名稱..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="muted text-body p-6 text-center">無交易名稱紀錄</div>
        </Card>
      ) : (
        <>
          <div className="muted text-xs mb-2">
            共 {filtered.length} 個名稱（顯示 {visible.length}）
          </div>
          <Card style={{ padding: 0 }}>
            <div
              className="ns-settings-names-head"
              style={{
                padding: "10px 20px",
                borderBottom: "1px solid var(--ns-border)",
                display: "grid",
                gridTemplateColumns: "1fr 72px 100px 40px",
                fontSize: 10.5,
                color: "var(--ns-fg-dim)",
                fontFamily: "var(--ns-font-mono)",
                letterSpacing: 0.07,
                textTransform: "uppercase",
              }}
            >
              <span>{t("settings.nameLabel")}</span>
              <span>{t("settings.usageCount")}</span>
              <span className="ns-settings-names-lastused">{t("settings.lastUsed")}</span>
              <span />
            </div>
            {visible.map((n, i) => (
              <div
                key={n.value}
                className="ns-settings-names-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 72px 100px 40px",
                  alignItems: "center",
                  padding: "13px 20px",
                  borderTop: i ? "1px solid var(--ns-border)" : "none",
                }}
              >
                {editingName === n.value ? (
                  <input
                    autoFocus
                    className="ns-input"
                    style={{ padding: "4px 8px", fontSize: 14 }}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(n.value);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    onBlur={() => {
                      if (skipBlurRef.current) {
                        skipBlurRef.current = false;
                        return;
                      }
                      saveEdit(n.value);
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{n.value}</div>
                )}
                <span className="text-xs muted">{n.count} 筆</span>
                <span className="text-xs muted ns-settings-names-lastused">
                  {n.lastUsed.slice(0, 10)}
                </span>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {editingName !== n.value && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="編輯"
                      style={{ color: "var(--ns-fg-muted)" }}
                      onClick={() => startEdit(n.value)}
                    >
                      <PencilSimple size={14} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Card>
          {visibleCount < filtered.length ? (
            <div className="text-center" style={{ padding: "16px 0" }}>
              <Button variant="outline" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                顯示更多
              </Button>
              <div className="muted text-caption mt-1.5">每次多載 {PAGE_SIZE} 筆</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
