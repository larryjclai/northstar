import { describe, expect, it, vi } from "vitest";
import { createMemoryFinanceRepositoryForTests } from "../../../data/repositories";
import { pullAndApply } from "./pull";
import { pullEnvelopes } from "./client";
import type { SyncEntity } from "../../../domain/sync";

vi.mock("./client", () => ({ pullEnvelopes: vi.fn() }));
vi.mock("../crypto/vault", () => ({
  loadVaultKey: vi.fn(async () => ({})),
  decryptPayload: vi.fn(async (_k: unknown, p: string) => JSON.parse(p)),
}));
const mockedPull = vi.mocked(pullEnvelopes);

async function fullSync(from: any, to: any, opts: { dropOpening?: boolean } = {}) {
  // Serialize every entity from A exactly as push would (getSyncPayload),
  // wrap as envelopes from a different device, and pullAndApply into B.
  const entities: Exclude<SyncEntity, "settings">[] = [
    "account", "asset", "investment", "ledger", "recurring", "recurringInvestment", "goal",
  ];
  const data = (from as any).data;
  const lists: Record<string, any[]> = {
    account: data.accounts,
    asset: data.portfolioAssets,
    investment: data.investmentRecords,
    ledger: data.ledgerTransactions,
    recurring: data.recurringTransactions,
    recurringInvestment: data.recurringInvestments,
    goal: data.financialGoals,
  };
  const envelopes: any[] = [];
  for (const entity of entities) {
    for (const row of lists[entity]) {
      if (opts.dropOpening && entity === "investment" && String(row.id).startsWith("inv_open_")) continue;
      const payload = await from.getSyncPayload(entity, row.id);
      if (!payload) continue;
      envelopes.push({
        id: `env_${entity}_${row.id}_${payload.revision}`,
        deviceId: "device_a",
        entity,
        entityId: row.id,
        revision: payload.revision,
        encryptedPayload: JSON.stringify(payload),
        updatedAt: payload.updatedAt,
      });
    }
  }
  mockedPull.mockResolvedValue({ envelopes, nextCursor: "c1" } as any);
  await pullAndApply(to, { apiSecret: "x" } as any, "0", "device_b");
}

describe("repro: manual holding + buy sync", () => {
  it("syncs 400 manual + 20 buy = 420 to device B", async () => {
    const A = createMemoryFinanceRepositoryForTests();
    await A.createAccount({
      name: "券商", currency: "TWD", openingBalance: 0, type: "investment",
      creditLimit: null, creditLimitGroup: "", statementDay: null, paymentDueDay: null,
      creditPaymentPaidUntil: null, isSharedToHousehold: false, loanStartDate: null,
      annualInterestRate: null, loanTerm: null, iconName: null, color: null,
    } as any);
    const acct = (await A.listAccounts())[0];

    await A.createManualHolding({
      ticker: "2449.TW", name: "京元電子", currency: "TWD",
      totalQuantity: 400, averageCost: 50, acquisitionDate: "2024-01-01", accountId: acct.id,
    });
    await A.createInvestmentRecord({
      ticker: "2449.TW", name: "京元電子", currency: "TWD", linkedAccountId: acct.id,
      date: "2024-06-01", action: "buy", price: 60, quantity: 20, fee: 0, note: "",
    });

    const aAssets = await A.listPortfolioAssets();
    const aTotal = aAssets.filter(a => a.ticker === "2449.TW").reduce((s, a) => s + a.totalQuantity, 0);
    expect(aTotal).toBe(420);

    const B = createMemoryFinanceRepositoryForTests();
    await fullSync(A, B);

    const bAssets = await B.listPortfolioAssets();
    const bTotal = bAssets.filter(a => a.ticker === "2449.TW").reduce((s, a) => s + a.totalQuantity, 0);
    expect(bTotal).toBe(420);
  });

  it("survives a missing opening-balance lot (the reported bug)", async () => {
    const A = createMemoryFinanceRepositoryForTests();
    await A.createAccount({
      name: "券商", currency: "TWD", openingBalance: 0, type: "investment",
      creditLimit: null, creditLimitGroup: "", statementDay: null, paymentDueDay: null,
      creditPaymentPaidUntil: null, isSharedToHousehold: false, loanStartDate: null,
      annualInterestRate: null, loanTerm: null, iconName: null, color: null,
    } as any);
    const acct = (await A.listAccounts())[0];
    await A.createManualHolding({
      ticker: "2449.TW", name: "京元電子", currency: "TWD",
      totalQuantity: 400, averageCost: 50, acquisitionDate: "2024-01-01", accountId: acct.id,
    });
    await A.createInvestmentRecord({
      ticker: "2449.TW", name: "京元電子", currency: "TWD", linkedAccountId: acct.id,
      date: "2024-06-01", action: "buy", price: 60, quantity: 20, fee: 0, note: "",
    });

    const B = createMemoryFinanceRepositoryForTests();
    await fullSync(A, B, { dropOpening: true });

    const bAssets = await B.listPortfolioAssets();
    const bTotal = bAssets.filter(a => a.ticker === "2449.TW").reduce((s, a) => s + a.totalQuantity, 0);
    expect(bTotal).toBe(420);
  });
});
