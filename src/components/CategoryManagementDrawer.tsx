import { useState } from "react";
import { Button } from "./coss/button";
import { Card } from "./coss/card";
import { X, Plus, Trash, PencilSimple, CaretRight, CaretDown, Tag, Check } from "@phosphor-icons/react";
import { IconPicker } from "./IconPicker";
import { Glyph } from "../lib/icons";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { ModalShell } from "./ModalShell";
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
  // Two-click delete confirm — window.confirm is a no-op in the Tauri webview.
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
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
    setLocal(local.filter(c => c.name !== name));
    setConfirmRemove(null);
  }

  return (
    // disableEscape: the inline main/sub name editors bind Escape to cancel-edit.
    // The shell's panel-scoped keydown listener fires before those React handlers
    // (and, being isolated from the body-portalled IconPicker popover, can't be
    // cooperatively cancelled), so a shell Escape-to-close would also discard the
    // whole drawer's unsaved edits. The drawer stays keyboard-dismissable via its
    // 取消 / X buttons and scrim click.
    <ModalShell
      variant="drawer"
      title="分類管理"
      onClose={onClose}
      disableEscape
      style={{ zIndex: 100 }}
      panelClassName="animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
      panelStyle={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: "100%", maxWidth: 400,
        background: "var(--ns-bg)", borderLeft: "1px solid var(--ns-border)",
        display: "flex", flexDirection: "column", boxShadow: "var(--ns-shadow-xl)",
      }}
    >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="text-base" style={{ fontWeight: 600 }}>分類管理</h2>
          <Button variant="ghost" size="icon-sm" aria-label="關閉" onClick={onClose}><X size={18} /></Button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            {addingMain ? (
              <input
                autoFocus
                className="ns-input text-body"
                style={{ flex: 1 }}
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
              <Button onClick={() => { setAddingMain(true); setDraftMain(""); }}><Plus size={14} />新增主分類</Button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {local.map(group => {
              const isExp = expanded[group.name] || false;
              const isRenamingMain = renamingMain === group.name;
              return (
                <Card key={group.name} style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                      <div style={{ cursor: "pointer", display: "flex", alignItems: "center" }} onClick={() => toggle(group.name)}>
                        {isExp ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
                      </div>
                      <Popover>
                        <PopoverTrigger className="ns-btn-icon text-base">
                          {group.iconName ? <Glyph name={group.iconName} size={16} /> : <Tag size={16} />}
                        </PopoverTrigger>
                        <PopoverContent className="z-[150] shadow-xl rounded-xl w-auto p-0">
                          <IconPicker
                            value={group.iconName}
                            onSelect={(name) => {
                              setLocal(local.map(c => c.name === group.name ? { ...c, iconName: name } : c));
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      {isRenamingMain ? (
                        <input
                          autoFocus
                          className="ns-input text-sm"
                          style={{ flex: 1, padding: "4px 8px" }}
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
                          <span className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>({group.children.length})</span>
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {confirmRemove === group.name ? (
                        <>
                          <Button variant="ghost" size="sm" className="text-xs" style={{ color: "var(--ns-danger)" }} onClick={() => removeMainCategory(group.name)}>確定刪除</Button>
                          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setConfirmRemove(null)}>取消</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon-sm" aria-label="新增子分類" onClick={() => { setAddingSubFor(group.name); setDraftSub(""); setExpanded(prev => ({ ...prev, [group.name]: true })); }}><Plus size={14} /></Button>
                          <Button variant="ghost" size="icon-sm" aria-label="重新命名" onClick={() => { setRenamingMain(group.name); setDraftRename(group.name); }}><PencilSimple size={14} /></Button>
                          <Button variant="ghost" size="icon-sm" aria-label="刪除" style={{ color: "var(--ns-danger)" }} onClick={() => setConfirmRemove(group.name)}><Trash size={14} /></Button>
                        </>
                      )}
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
                                className="ns-input text-sm"
                                style={{ flex: 1, padding: "4px 8px" }}
                                value={draftRename}
                                onChange={(e) => setDraftRename(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRenameSub(group.name, child, draftRename);
                                  if (e.key === "Escape") setRenamingSub(null);
                                }}
                                onBlur={() => commitRenameSub(group.name, child, draftRename)}
                              />
                            ) : (
                              <span className="text-sm">{child}</span>
                            )}
                            <div style={{ display: "flex", gap: 4 }}>
                              {!isRenamingThis && (
                                <Button variant="ghost" size="icon-sm" aria-label="重新命名" onClick={() => { setRenamingSub({ main: group.name, sub: child }); setDraftRename(child); }}><PencilSimple size={12} /></Button>
                              )}
                              <Button variant="ghost" size="icon-sm" aria-label="刪除" style={{ color: "var(--ns-danger)" }} onClick={() => removeSubCategory(group.name, child)}><Trash size={12} /></Button>
                            </div>
                          </div>
                        );
                      })}
                      {addingSubFor === group.name && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 24 }}>
                          <input
                            autoFocus
                            className="ns-input text-sm"
                            style={{ flex: 1, padding: "4px 8px" }}
                            placeholder="子分類名稱…"
                            value={draftSub}
                            onChange={(e) => setDraftSub(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitAddSub(group.name, draftSub);
                              if (e.key === "Escape") { setAddingSubFor(null); setDraftSub(""); }
                            }}
                            onBlur={() => commitAddSub(group.name, draftSub)}
                          />
                          <Button variant="ghost" size="icon-sm" aria-label="確認新增" onClick={() => commitAddSub(group.name, draftSub)}><Check size={14} /></Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 12 }}>
          <Button variant="outline" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>取消</Button>
          <Button style={{ flex: 1, justifyContent: "center" }} onClick={async () => { await onSave(local); onClose(); }}>儲存變更</Button>
        </div>
    </ModalShell>
  );
}
