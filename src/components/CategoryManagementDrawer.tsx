import { useState } from "react";
import { X, Plus, Trash, PencilSimple, CaretRight, CaretDown } from "@phosphor-icons/react";
import { CategoryGroup } from "../domain";

export function CategoryManagementDrawer({
  open,
  onClose,
  categories,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryGroup[];
  onSave: (categories: CategoryGroup[]) => Promise<void>;
}) {
  const [local, setLocal] = useState<CategoryGroup[]>(categories);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!open) return null;

  function toggle(name: string) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function addMainCategory() {
    const name = prompt("主分類名稱：");
    if (!name || local.some(c => c.name === name)) return;
    setLocal([...local, { name, children: [] }]);
  }

  function addSubCategory(mainName: string) {
    const name = prompt(`新增「${mainName}」的子分類：`);
    if (!name) return;
    setLocal(local.map(c => {
      if (c.name === mainName) {
        if (c.children.includes(name)) return c;
        return { ...c, children: [...c.children, name] };
      }
      return c;
    }));
    setExpanded(prev => ({ ...prev, [mainName]: true }));
  }

  function removeSubCategory(mainName: string, subName: string) {
    setLocal(local.map(c => {
      if (c.name === mainName) {
        return { ...c, children: c.children.filter(child => child !== subName) };
      }
      return c;
    }));
  }

  function renameMainCategory(oldName: string) {
    const newName = prompt("重新命名主分類：", oldName);
    if (!newName || newName === oldName || local.some(c => c.name === newName)) return;
    setLocal(local.map(c => c.name === oldName ? { ...c, name: newName } : c));
  }

  function removeMainCategory(name: string) {
    if (confirm(`確定要刪除主分類「${name}」及其所有子分類嗎？`)) {
      setLocal(local.filter(c => c.name !== name));
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: "100%", maxWidth: 400,
          background: "var(--ns-bg)", borderLeft: "1px solid var(--ns-border)",
          display: "flex", flexDirection: "column", boxShadow: "var(--ns-shadow-xl)",
        }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>分類管理</h2>
          <button className="ns-btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button className="ns-btn primary" onClick={addMainCategory}><Plus size={14} />新增主分類</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {local.map(group => {
              const isExp = expanded[group.name] || false;
              return (
                <div key={group.name} className="ns-card" style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }} onClick={() => toggle(group.name)}>
                      {isExp ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
                      <span style={{ fontWeight: 500 }}>{group.name}</span>
                      <span style={{ fontSize: 12, color: "var(--ns-fg-muted)" }}>({group.children.length})</span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="ns-btn-icon" onClick={() => addSubCategory(group.name)}><Plus size={14} /></button>
                      <button className="ns-btn-icon" onClick={() => renameMainCategory(group.name)}><PencilSimple size={14} /></button>
                      <button className="ns-btn-icon" style={{ color: "var(--ns-danger)" }} onClick={() => removeMainCategory(group.name)}><Trash size={14} /></button>
                    </div>
                  </div>

                  {isExp && group.children.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--ns-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                      {group.children.map(child => (
                        <div key={child} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 24 }}>
                          <span style={{ fontSize: 14 }}>{child}</span>
                          <button className="ns-btn-icon" style={{ color: "var(--ns-danger)" }} onClick={() => removeSubCategory(group.name, child)}><Trash size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 12 }}>
          <button className="ns-btn" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>取消</button>
          <button className="ns-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={async () => { await onSave(local); onClose(); }}>儲存變更</button>
        </div>
      </div>
    </div>
  );
}
