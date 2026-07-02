import { Bell } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useFinanceData } from "../data/hooks";
import { todayInTimezone } from "../domain";
import { buildReminderNotifications, unacknowledgedReminders } from "../domain/reminderNotifications";
import { useUiPreferences } from "../state/uiPreferences";
import { Button } from "./coss/button";

export function NotificationCenter({ collapsed }: { collapsed: boolean }) {
  const { accounts } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const acknowledged = useUiPreferences((state) => state.acknowledgedReminders);
  const acknowledgeReminder = useUiPreferences((state) => state.acknowledgeReminder);
  const clearAcknowledgedReminders = useUiPreferences((state) => state.clearAcknowledgedReminders);

  const rows = accounts.data ?? [];
  const all = buildReminderNotifications(rows, todayInTimezone(timezone));
  const unacked = unacknowledgedReminders(all, acknowledged);
  const count = unacked.length;

  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Capture the trigger button's viewport position when opening, so the
  // panel (position: fixed) can be placed against the viewport instead of
  // the sidebar — the sidebar's overflow:hidden (needed for the width
  // transition) would otherwise clip anything wider than the rail.
  useEffect(() => {
    if (open && buttonRef.current) {
      setAnchorRect(buttonRef.current.getBoundingClientRect());
    }
  }, [open]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // A stale anchor rect would misposition the panel, so close it whenever
  // the viewport resizes or the sidebar collapses/expands.
  useEffect(() => {
    if (!open) return;
    function handleResize() {
      setOpen(false);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [collapsed]);

  function handleAcknowledgeAll() {
    for (const n of unacked) {
      acknowledgeReminder(n.id);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="通知中心"
        aria-label="通知中心"
        aria-expanded={open}
        className="ns-nav-link"
        style={{
          width: "100%",
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "9px 8px" : "9px 11px",
          gap: 8,
          position: "relative",
        }}
      >
        <Bell size={16} weight={count > 0 ? "fill" : "duotone"} style={{ color: count > 0 ? "var(--ns-accent)" : undefined, flexShrink: 0 }} />
        {!collapsed && <span style={{ flex: 1 }}>通知</span>}
        {count > 0 && (
          <span
            aria-label={`${count} 則未讀提醒`}
            style={{
              position: collapsed ? "absolute" : "static",
              top: collapsed ? 6 : undefined,
              right: collapsed ? 6 : undefined,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: "var(--ns-accent)",
              color: "var(--ns-accent-fg)",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "16px",
              textAlign: "center",
              padding: "0 4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {count}
          </span>
        )}
      </button>

      {open && anchorRect && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="通知中心面板"
          style={{
            position: "fixed",
            bottom: window.innerHeight - anchorRect.top + 8,
            left: collapsed ? anchorRect.right + 8 : anchorRect.left,
            zIndex: 1200,
            width: 320,
            background: "var(--ns-surface)",
            border: "1px solid var(--ns-border)",
            borderRadius: "var(--ns-r-md, 10px)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px 10px",
              borderBottom: "1px solid var(--ns-border)",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 13 }}>通知</span>
            {count > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => { handleAcknowledgeAll(); }}
              >
                全部標為已讀
              </Button>
            )}
          </div>

          {/* Body */}
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {count === 0 ? (
              <div
                style={{
                  padding: "24px 16px",
                  textAlign: "center",
                  color: "var(--ns-fg-muted)",
                  fontSize: 13,
                }}
              >
                沒有新的提醒
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
                {unacked.map((n) => (
                  <li
                    key={n.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 14px",
                      borderBottom: "1px solid var(--ns-border-subtle, var(--ns-border))",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 12, color: "var(--ns-fg-dim)", marginBottom: 1 }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ns-fg)", lineHeight: 1.4 }}>
                        {n.body}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ns-fg-muted)", marginTop: 2 }}>
                        {n.daysUntilDue === 0
                          ? "今天到期"
                          : n.daysUntilDue < 0
                          ? `已逾期 ${Math.abs(n.daysUntilDue)} 天`
                          : `${n.daysUntilDue} 天後到期`}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => acknowledgeReminder(n.id)}
                    >
                      標為已讀
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
