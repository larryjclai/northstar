import { useState } from "react";
import { X, Plus, Trash, PencilSimple, CaretRight, CaretDown, Tag, Check } from "@phosphor-icons/react";
import EmojiPicker from "emoji-picker-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
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
  // Inline editing state (prompt() is unsupported in the Tauri webview).
  const [addingMain, setAddingMain] = useState(false);
  const [draftMain, setDraftMain] = useState("");
  const [renamingMain, setRenamingMain] = useState<string | null>(null);
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [draftSub, setDraftSub] = useState("");
  const [renamingSub, setRenamingSub] = useState<{ main: string; sub: string } | null>(null);
  const [draftRename, setDraftRename] = useState("");

  if (!open) return null;

  function toggle(name: string) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function commitAddMain(raw: string) {
    const name = raw.trim();
    setAddingMain(false);
    setDraftMain("");
    if (!name || local.some(c => c.name === name)) return;
    setLocal([...local, { name, children: [] }]);
  }

  function commitAddSub(mainName: string, raw: string) {
    const name = raw.trim();
    setAddingSubFor(null);
    setDraftSub("");
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

  function commitRenameMain(oldName: string, raw: string) {
    const newName = raw.trim();
    setRenamingMain(null);
    if (!newName || newName === oldName || local.some(c => c.name === newName)) return;
    setLocal(local.map(c => c.name === oldName ? { ...c, name: newName } : c));
  }

  function commitRenameSub(mainName: string, oldSubName: string, raw: string) {
    const newName = raw.trim();
    setRenamingSub(null);
    if (!newName || newName === oldSubName) return;
    setLocal(local.map(c => {
      if (c.name === mainName) {
        if (c.children.includes(newName)) return c;
        return { ...c, children: c.children.map(child => child === oldSubName ? newName : child) };
      }
      return c;
    }));
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
            {addingMain ? (
              <input
                autoFocus
                className="ns-input"
                style={{ flex: 1, fontSize: 13 }}
                placeholder="主分類名稱…"
                value={draftMain}
                onChange={(e) => setDraftMain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitAddMain(draftMain);
                  if (e.key === "Escape") { setAddingMain(false); setDraftMain(""); }
                }}
                onBlur={() => commitAddMain(draftMain)}
              />
            ) : (
              <button className="ns-btn primary" onClick={() => { setAddingMain(true); setDraftMain(""); }}><Plus size={14} />新增主分類</button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {local.map(group => {
              const isExp = expanded[group.name] || false;
              const isRenamingMain = renamingMain === group.name;
              return (
                <div key={group.name} className="ns-card" style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                      <div style={{ cursor: "pointer", display: "flex", alignItems: "center" }} onClick={() => toggle(group.name)}>
                        {isExp ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
                      </div>
                      <Popover>
                        <PopoverTrigger className="ns-btn-icon" style={{ fontSize: 16 }}>
                          {group.iconName || <Tag size={16} />}
                        </PopoverTrigger>
                        <PopoverContent className="z-[150] shadow-xl rounded-xl w-auto p-0">
                          <EmojiPicker
                            onEmojiClick={(emojiData) => {
                              setLocal(local.map(c => c.name === group.name ? { ...c, iconName: emojiData.emoji } : c));
                            }}
                            width={300}
                            height={400}
                          />
                        </PopoverContent>
                      </Popover>
                      {isRenamingMain ? (
                        <input
                          autoFocus
                          className="ns-input"
                          style={{ flex: 1, fontSize: 14, padding: "4px 8px" }}
                          value={draftRename}
                          onChange={(e) => setDraftRename(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRenameMain(group.name, draftRename);
                            if (e.key === "Escape") setRenamingMain(null);
                          }}
                          onBlur={() => commitRenameMain(group.name, draftRename)}
                        />
                      ) : (
                        <>
                          <span style={{ fontWeight: 500, cursor: "pointer" }} onClick={() => toggle(group.name)}>{group.name}</span>
                          <span style={{ fontSize: 12, color: "var(--ns-fg-muted)" }}>({group.children.length})</span>
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="ns-btn-icon" onClick={() => { setAddingSubFor(group.name); setDraftSub(""); setExpanded(prev => ({ ...prev, [group.name]: true })); }}><Plus size={14} /></button>
                      <button className="ns-btn-icon" onClick={() => { setRenamingMain(group.name); setDraftRename(group.name); }}><PencilSimple size={14} /></button>
                      <button className="ns-btn-icon" style={{ color: "var(--ns-danger)" }} onClick={() => removeMainCategory(group.name)}><Trash size={14} /></button>
                    </div>
                  </div>

                  {isExp && (group.children.length > 0 || addingSubFor === group.name) && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--ns-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                      {group.children.map(child => {
                        const isRenamingThis = renamingSub?.main === group.name && renamingSub?.sub === child;
                        return (
                          <div key={child} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 24 }}>
                            {isRenamingThis ? (
                              <input
                                autoFocus
                                className="ns-input"
                                style={{ flex: 1, fontSize: 14, padding: "4px 8px" }}
                                value={draftRename}
                                onChange={(e) => setDraftRename(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRenameSub(group.name, child, draftRename);
                                  if (e.key === "Escape") setRenamingSub(null);
                                }}
                                onBlur={() => commitRenameSub(group.name, child, draftRename)}
                              />
                            ) : (
                              <span style={{ fontSize: 14 }}>{child}</span>
                            )}
                            <div style={{ display: "flex", gap: 4 }}>
                              {!isRenamingThis && (
                                <button className="ns-btn-icon" onClick={() => { setRenamingSub({ main: group.name, sub: child }); setDraftRename(child); }}><PencilSimple size={12} /></button>
                              )}
                              <button className="ns-btn-icon" style={{ color: "var(--ns-danger)" }} onClick={() => removeSubCategory(group.name, child)}><Trash size={12} /></button>
                            </div>
                          </div>
                        );
                      })}
                      {addingSubFor === group.name && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 24 }}>
                          <input
                            autoFocus
                            className="ns-input"
                            style={{ flex: 1, fontSize: 14, padding: "4px 8px" }}
                            placeholder="子分類名稱…"
                            value={draftSub}
                            onChange={(e) => setDraftSub(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitAddSub(group.name, draftSub);
                              if (e.key === "Escape") { setAddingSubFor(null); setDraftSub(""); }
                            }}
                            onBlur={() => commitAddSub(group.name, draftSub)}
                          />
                          <button className="ns-btn-icon" onClick={() => commitAddSub(group.name, draftSub)}><Check size={14} /></button>
                        </div>
                      )}
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
