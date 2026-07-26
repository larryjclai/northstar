import { useState } from "react";
import type { ReactNode } from "react";
import { PencilSimple, Plus } from "@phosphor-icons/react";
import { ModalCloseButton } from "./ModalCloseButton";
import { ModalShell } from "./ModalShell";
import { Badge } from "./coss/badge";
import { Button } from "./coss/button";
import { Card } from "./coss/card";
import type { Client } from "../domain/types";
import type { ClientDraft } from "../data/repositories";

/**
 * 客戶主檔 management modal — plan 191 step 5. Mirrors `BookManager`
 * (`AccountsRoute.tsx`): existing-list + inline edit, then a create-new
 * section below. Clients are book-scoped (`bookId` = the active company
 * book) — the caller passes in an already-scoped `clients` list and the
 * `bookId` new clients should be created under.
 */
export function ClientManager({
  bookId,
  clients,
  onCreate,
  onUpdate,
  saving,
  onClose,
}: {
  bookId: string;
  clients: Client[];
  onCreate: (draft: ClientDraft) => Promise<unknown>;
  onUpdate: (id: string, draft: ClientDraft) => Promise<unknown>;
  saving: boolean;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ClientDraft | null>(null);
  const [editError, setEditError] = useState("");

  const [newName, setNewName] = useState("");
  const [newTaxId, setNewTaxId] = useState("");
  const [newTerms, setNewTerms] = useState("");
  const [createError, setCreateError] = useState("");

  function startEdit(client: Client) {
    setEditingId(client.id);
    setEditForm({
      bookId: client.bookId,
      name: client.name,
      taxId: client.taxId,
      defaultPaymentTerms: client.defaultPaymentTerms,
    });
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
    setEditError("");
  }

  async function submitEdit() {
    if (!editingId || !editForm) return;
    setEditError("");
    if (!editForm.name.trim()) {
      setEditError("請輸入客戶名稱。");
      return;
    }
    try {
      await onUpdate(editingId, {
        ...editForm,
        name: editForm.name.trim(),
        taxId: editForm.taxId.trim(),
      });
      cancelEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "更新客戶失敗。");
    }
  }

  async function submitCreate() {
    setCreateError("");
    if (!newName.trim()) {
      setCreateError("請輸入客戶名稱。");
      return;
    }
    const terms = newTerms.trim() ? Number(newTerms) : null;
    if (terms !== null && (!Number.isFinite(terms) || terms < 0)) {
      setCreateError("收款期限請輸入天數。");
      return;
    }
    try {
      await onCreate({
        bookId,
        name: newName.trim(),
        taxId: newTaxId.trim(),
        defaultPaymentTerms: terms,
      });
      setNewName("");
      setNewTaxId("");
      setNewTerms("");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "建立客戶失敗。");
    }
  }

  return (
    <ModalShell
      variant="center"
      title="客戶管理"
      onClose={onClose}
      panelClassName="w-full"
      panelStyle={{ maxWidth: 520 }}
    >
      {(dismiss) => (
        <Card className="w-full p-0">
          <div
            className="py-4 px-5 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--ns-border)" }}
          >
            <h2 className="text-base font-semibold" style={{ margin: 0 }}>
              客戶管理
            </h2>
            <ModalCloseButton onClick={dismiss} />
          </div>
          <div
            className="py-4 px-5 flex flex-col gap-4"
            style={{ maxHeight: "70vh", overflowY: "auto" }}
          >
            {/* Existing clients */}
            <div className="flex flex-col gap-3">
              {clients.length === 0 ? (
                <div className="muted text-body">尚未建立任何客戶。</div>
              ) : (
                clients.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      border: "1px solid var(--ns-border)",
                      borderRadius: "var(--ns-r-md)",
                      padding: "12px 14px",
                    }}
                  >
                    {editingId === c.id && editForm ? (
                      <div className="flex flex-col gap-3">
                        <DrawerField label="名稱">
                          <input
                            className="ns-input"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                        </DrawerField>
                        <DrawerField label="統一編號（選填）">
                          <input
                            className="ns-input"
                            value={editForm.taxId}
                            onChange={(e) => setEditForm({ ...editForm, taxId: e.target.value })}
                            style={{ fontFamily: "var(--ns-font-mono)" }}
                          />
                        </DrawerField>
                        <DrawerField label="預設收款期限（天，選填）">
                          <input
                            className="ns-input"
                            type="number"
                            min={0}
                            value={editForm.defaultPaymentTerms ?? ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                defaultPaymentTerms:
                                  e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                        </DrawerField>
                        {editError ? (
                          <div className="text-body" style={{ color: "var(--ns-neg)" }}>
                            {editError}
                          </div>
                        ) : null}
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            取消
                          </Button>
                          <Button size="sm" onClick={submitEdit} loading={saving}>
                            儲存
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        {c.taxId ? <Badge variant="secondary">{c.taxId}</Badge> : null}
                        {c.defaultPaymentTerms !== null ? (
                          <span className="muted text-xs">收款期限 {c.defaultPaymentTerms} 天</span>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          style={{ marginLeft: "auto" }}
                          onClick={() => startEdit(c)}
                          aria-label={`編輯 ${c.name}`}
                        >
                          <PencilSimple size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Create new client */}
            <div
              style={{ borderTop: "1px solid var(--ns-border)", paddingTop: 14 }}
              className="flex flex-col gap-3"
            >
              <div className="text-xs ns-field-label">新增客戶</div>
              <DrawerField label="名稱">
                <input
                  className="ns-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例：ABC 公司"
                />
              </DrawerField>
              <DrawerField label="統一編號（選填）">
                <input
                  className="ns-input"
                  value={newTaxId}
                  onChange={(e) => setNewTaxId(e.target.value)}
                  placeholder="例：12345678"
                  style={{ fontFamily: "var(--ns-font-mono)" }}
                />
              </DrawerField>
              <DrawerField label="預設收款期限（天，選填）">
                <input
                  className="ns-input"
                  type="number"
                  min={0}
                  value={newTerms}
                  onChange={(e) => setNewTerms(e.target.value)}
                  placeholder="例：30"
                />
              </DrawerField>
              {createError ? (
                <div className="text-body" style={{ color: "var(--ns-neg)" }}>
                  {createError}
                </div>
              ) : null}
              <Button className="justify-center" onClick={submitCreate} loading={saving}>
                <Plus size={14} weight="bold" />
                建立客戶
              </Button>
            </div>
          </div>
        </Card>
      )}
    </ModalShell>
  );
}

function DrawerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs ns-field-label block">{label}</label>
      {children}
    </div>
  );
}
