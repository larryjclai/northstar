import { X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { DatePicker } from "../components/ui/date-picker";
import { Field, TextInput } from "../components/Field";
import { HoldingForm, makeEmptyHoldingDraft } from "../components/HoldingForm";
import { SegmentedControl } from "../components/SegmentedControl";
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
  const { manualPriceSnapshots, dailyPrices } = useFinanceData();
  const snapshotRows = manualPriceSnapshots.data ?? [];
  const [editForm, setEditForm] = useState<PortfolioAssetDraft | null>(null);
  const [message, setMessage] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [snapshotPrice, setSnapshotPrice] = useState(0);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [snapshotMessage, setSnapshotMessage] = useState("");
  // B16: price-record area has two modes — "auto" shows Yahoo's daily quotes
  // (read-only, paginated) for tickers Yahoo covers; "manual" is the snapshot
  // editor for assets Yahoo can't price (funds, private holdings).
  const [priceMode, setPriceMode] = useState<"auto" | "manual">("manual");
  const [pricePage, setPricePage] = useState(1);
  const PRICE_PAGE_SIZE = 8;

  // Yahoo daily prices for this ticker (most recent first).
  const yahooPrices = useMemo(() => {
    if (!editingAsset) return [];
    const ticker = editingAsset.ticker.toUpperCase();
    return (dailyPrices.data ?? [])
      .filter((p) => p.ticker.toUpperCase() === ticker)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [dailyPrices.data, editingAsset]);
  const hasYahoo = yahooPrices.length > 0;

  const updateHolding = useRepositoryMutation(
    (repository, input: PortfolioAssetDraft & { id: string }) => repository.updateManualHolding(input.id, input),
    ["assets"],
  );
  const updateClassification = useRepositoryMutation(
    (repository, input: { id: string; assetType: AssetType | null; sector: string | null; industry: string | null }) =>
      // User-driven edit: lock the classification so 回補分類 won't overwrite it.
      repository.updateAssetClassification(input.id, { assetType: input.assetType, sector: input.sector, industry: input.industry, lockClassification: true }),
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
  const deleteHolding = useRepositoryMutation(
    (repository, id: string) => repository.deleteManualHolding(id),
    ["assets"],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      setPricePage(1);
      setConfirmDelete(false);
    } else {
      setEditForm(null);
    }
  }, [editingAsset]);

  // Default to the Yahoo view when this ticker has live data; fall back to the
  // manual editor otherwise.
  useEffect(() => {
    setPriceMode(hasYahoo ? "auto" : "manual");
    setPricePage(1);
  }, [editingAsset?.id, hasYahoo]);

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

  async function submitDelete() {
    if (!editingAsset) return;
    setMessage("");
    try {
      await deleteHolding.mutateAsync(editingAsset.id);
      setConfirmDelete(false);
      onClose();
    } catch (error) {
      setConfirmDelete(false);
      setMessage(error instanceof Error ? error.message : "持倉刪除失敗。");
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
            <div className="mt-4 flex items-center gap-3">
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={() => void submitDelete()}
                    disabled={deleteHolding.isPending}
                    className="rounded-md px-3 py-2 text-sm font-semibold text-white outline-none transition hover:opacity-90 disabled:opacity-60"
                    style={{ background: "var(--ns-neg)" }}
                  >
                    {deleteHolding.isPending ? "刪除中…" : "確認刪除"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleteHolding.isPending}
                    className="text-sm outline-none transition hover:opacity-70"
                    style={{ color: "var(--ns-muted)" }}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-md px-3 py-2 text-sm font-semibold outline-none transition hover:opacity-80"
                  style={{ color: "var(--ns-neg)", border: "1px solid var(--ns-neg)" }}
                >
                  刪除持倉
                </button>
              )}
            </div>
          ) : null}

          {(editingAsset.holdingSource === "manual" || hasYahoo) ? (
            <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--ns-border)" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">價格紀錄</h3>
                {/* The auto/manual toggle only applies to manual holdings; for
                    transaction-based holdings prices are always Yahoo-driven. */}
                {editingAsset.holdingSource === "manual" && hasYahoo ? (
                  <SegmentedControl
                    value={priceMode}
                    onChange={setPriceMode}
                    options={[{ value: "auto", label: "自動 (Yahoo)" }, { value: "manual", label: "手動" }]}
                  />
                ) : null}
              </div>

              {hasYahoo && (editingAsset.holdingSource !== "manual" || priceMode === "auto") ? (
                <div>
                  <p className="mb-2 text-xs" style={{ color: "var(--ns-muted)" }}>
                    來自 Yahoo Finance 的每日收盤價（共 {yahooPrices.length} 筆，唯讀）。
                  </p>
                  <div className="space-y-1.5">
                    {yahooPrices.slice((pricePage - 1) * PRICE_PAGE_SIZE, pricePage * PRICE_PAGE_SIZE).map((p) => (
                      <div key={p.date} className="flex items-center justify-between rounded-md px-3 py-2 text-sm" style={{ background: "var(--ns-surface-strong)" }}>
                        <span className="tabular font-semibold">{p.date}</span>
                        <span className="tabular">{formatPrice(p.close)} <span className="text-xs" style={{ color: "var(--ns-muted)" }}>{p.currency}</span></span>
                      </div>
                    ))}
                  </div>
                  {Math.ceil(yahooPrices.length / PRICE_PAGE_SIZE) > 1 ? (
                    <div className="mt-3 flex items-center justify-center gap-3 text-xs">
                      <ActionButton variant="secondary" size="sm" disabled={pricePage === 1} onClick={() => setPricePage((p) => Math.max(1, p - 1))}>上一頁</ActionButton>
                      <span style={{ color: "var(--ns-muted)" }}>{pricePage} / {Math.ceil(yahooPrices.length / PRICE_PAGE_SIZE)}</span>
                      <ActionButton variant="secondary" size="sm" disabled={pricePage >= Math.ceil(yahooPrices.length / PRICE_PAGE_SIZE)} onClick={() => setPricePage((p) => Math.min(Math.ceil(yahooPrices.length / PRICE_PAGE_SIZE), p + 1))}>下一頁</ActionButton>
                    </div>
                  ) : null}
                </div>
              ) : editingAsset.holdingSource === "manual" ? (
                <>
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
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
