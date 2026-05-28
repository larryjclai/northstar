import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { DatePicker } from "../components/ui/date-picker";
import { Field, TextInput } from "../components/Field";
import { HoldingForm, makeEmptyHoldingDraft } from "../components/HoldingForm";
import { StatusText } from "../components/StatusText";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { PortfolioAssetDraft, ManualPriceSnapshotDraft } from "../data/repositories";
import { formatPrice, type Account, type PortfolioAsset, type AssetType } from "../domain";

export function HoldingEditModal({
  editingAsset,
  onClose,
  accounts,
}: {
  editingAsset: PortfolioAsset | null;
  onClose: () => void;
  accounts: Account[];
}) {
  const { manualPriceSnapshots } = useFinanceData();
  const snapshotRows = manualPriceSnapshots.data ?? [];
  const [editForm, setEditForm] = useState<PortfolioAssetDraft | null>(null);
  const [message, setMessage] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [snapshotPrice, setSnapshotPrice] = useState(0);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [snapshotMessage, setSnapshotMessage] = useState("");

  const updateHolding = useRepositoryMutation(
    (repository, input: PortfolioAssetDraft & { id: string }) => repository.updateManualHolding(input.id, input),
    ["assets"],
  );
  const updateClassification = useRepositoryMutation(
    (repository, input: { id: string; assetType: AssetType | null; sector: string | null; industry: string | null }) =>
      repository.updateAssetClassification(input.id, { assetType: input.assetType, sector: input.sector, industry: input.industry }),
    ["assets"],
  );
  const createSnapshot = useRepositoryMutation(
    (repository, input: ManualPriceSnapshotDraft) => repository.createManualPriceSnapshot(input),
    ["assets", "manualPriceSnapshots", "investments", "dailyPrices"],
  );
  const deleteSnapshot = useRepositoryMutation(
    (repository, id: string) => repository.deleteManualPriceSnapshot(id),
    ["assets", "manualPriceSnapshots", "investments", "dailyPrices"],
  );

  useEffect(() => {
    if (editingAsset) {
      setEditForm({
        accountId: editingAsset.accountId,
        ticker: editingAsset.ticker,
        name: editingAsset.name,
        currency: editingAsset.currency,
        totalQuantity: editingAsset.totalQuantity,
        averageCost: editingAsset.averageCost,
        acquisitionDate: editingAsset.acquisitionDate,
        assetType: editingAsset.assetType,
        sector: editingAsset.sector,
        industry: editingAsset.industry,
      });
      setMessage("");
      setSnapshotDate(new Date().toISOString().slice(0, 10));
      setSnapshotPrice(0);
      setSnapshotNote("");
      setSnapshotMessage("");
    } else {
      setEditForm(null);
    }
  }, [editingAsset]);

  if (!editingAsset || !editForm) return null;

  async function submitEdit() {
    if (!editForm || !editingAsset) return;
    setMessage("");
    try {
      if (editingAsset.holdingSource === "manual") {
        await updateHolding.mutateAsync({ ...editForm, id: editingAsset.id });
      } else {
        await updateClassification.mutateAsync({
          id: editingAsset.id,
          assetType: editForm.assetType ?? null,
          sector: editForm.sector ?? null,
          industry: editForm.industry ?? null,
        });
      }
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗。");
    }
  }

  async function submitSnapshot() {
    if (!editingAsset) return;
    setSnapshotMessage("");
    try {
      await createSnapshot.mutateAsync({
        assetId: editingAsset.id,
        date: snapshotDate,
        price: snapshotPrice,
        note: snapshotNote,
      });
      setSnapshotPrice(0);
      setSnapshotNote("");
    } catch (error) {
      setSnapshotMessage(error instanceof Error ? error.message : "新增快照失敗。");
    }
  }

  const snapshots = snapshotRows
    .filter((s) => s.assetId === editingAsset.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-lg border shadow-xl"
        style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--ns-border)" }}>
          <h2 className="text-lg font-semibold">編輯持倉</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md outline-none transition hover:opacity-70"
            aria-label="關閉"
          >
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 pb-5 pt-4">
          <HoldingForm
            value={editForm}
            onChange={setEditForm}
            onSubmit={submitEdit}
            submitLabel={updateHolding.isPending || updateClassification.isPending ? "儲存中…" : editingAsset.holdingSource === "manual" ? "儲存持倉" : "儲存分類"}
            accounts={accounts}
            classificationOnly={editingAsset.holdingSource !== "manual"}
          />
          {message ? <div className="mt-3"><StatusText>{message}</StatusText></div> : null}

          {editingAsset.holdingSource === "manual" ? (
            <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--ns-border)" }}>
              <h3 className="mb-3 text-sm font-semibold">價格快照紀錄</h3>
              {snapshots.length === 0 ? (
                <p className="mb-3 text-xs" style={{ color: "var(--ns-muted)" }}>尚無快照，新增第一筆後就能在績效圖中看到趨勢。</p>
              ) : (
                <div className="mb-4 space-y-1.5">
                  {snapshots.map((snap) => (
                    <div key={snap.id} className="flex items-center justify-between rounded-md px-3 py-2 text-sm" style={{ background: "var(--ns-surface-strong)" }}>
                      <div>
                        <span className="tabular font-semibold">{snap.date}</span>
                        <span className="ml-3 tabular">{formatPrice(snap.price)}</span>
                        {snap.note ? <span className="ml-2 text-xs" style={{ color: "var(--ns-muted)" }}>{snap.note}</span> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteSnapshot.mutateAsync(snap.id)}
                        disabled={deleteSnapshot.isPending}
                        className="ml-3 grid size-6 place-items-center rounded outline-none transition hover:opacity-70"
                        aria-label="刪除快照"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Field label="日期">
                  <DatePicker value={snapshotDate} onChange={(val) => setSnapshotDate(val)} className="w-full h-10 ns-input" />
                </Field>
                <Field label="淨值 / 價格">
                  <TextInput type="number" value={snapshotPrice} onChange={(e) => setSnapshotPrice(Number(e.target.value))} />
                </Field>
                <div className="flex items-end">
                  <ActionButton onClick={() => void submitSnapshot()} disabled={createSnapshot.isPending}>
                    {createSnapshot.isPending ? "儲存中…" : "新增快照"}
                  </ActionButton>
                </div>
              </div>
              <div className="mt-2">
                <Field label="備註（選填）">
                  <TextInput value={snapshotNote} onChange={(e) => setSnapshotNote(e.target.value)} placeholder="基金公告淨值 2026-05-26" />
                </Field>
              </div>
              {snapshotMessage ? <div className="mt-2"><StatusText>{snapshotMessage}</StatusText></div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
