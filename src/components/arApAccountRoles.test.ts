import { describe, expect, it } from "vitest";
import { arApAccountRoles } from "./arApAccountRoles";
import type { LedgerTransaction } from "../domain";

// Account name lookup for the test fixtures.
const ACCOUNTS: Record<string, string> = {
  acct_richart: "Richart",
  acct_costco: "富邦 Costco",
};
const accountName = (id: string) => ACCOUNTS[id] ?? id;

type RoleRow = Pick<LedgerTransaction, "entryType" | "accountId" | "counterAccountId">;

/**
 * Build a 代墊 (AR/AP) role row.
 * - AR persists as income; counterAccountId = 付款帳戶 (墊付), accountId = 收款帳戶.
 * - AP persists as expense; counterAccountId = 收款帳戶, accountId = 付款帳戶.
 * When unsettled the main `accountId` is empty (chosen at 結清 time).
 */
function row(opts: { kind: "ar" | "ap"; settled: boolean }): RoleRow {
  const isAr = opts.kind === "ar";
  return {
    entryType: isAr ? "income" : "expense",
    // counterAccountId (墊付 leg) is set at creation for both AR and AP fixtures.
    counterAccountId: "acct_costco",
    // The main leg only gets an account on settle.
    accountId: opts.settled ? "acct_richart" : "",
  };
}

describe("arApAccountRoles", () => {
  it("returns null for a non-代墊 row (no counterAccountId)", () => {
    expect(
      arApAccountRoles(
        { entryType: "expense", accountId: "acct_richart", counterAccountId: null },
        accountName,
      ),
    ).toBeNull();
  });

  describe("應收 (AR)", () => {
    it("unsettled: 付款帳戶（代墊）= counter, 收款帳戶 = 結清時指定", () => {
      const roles = arApAccountRoles(row({ kind: "ar", settled: false }), accountName)!;
      expect(roles.payLabel).toBe("付款帳戶（代墊）");
      expect(roles.payValue).toBe("富邦 Costco");
      expect(roles.receiveLabel).toBe("收款帳戶");
      expect(roles.receiveValue).toBe("結清時指定");
    });

    // Regression guard: settled AR previously flipped to 應付 labels.
    it("settled: 收款帳戶 = receiving account (Richart), 付款帳戶 = paying account (Costco)", () => {
      const roles = arApAccountRoles(row({ kind: "ar", settled: true }), accountName)!;
      expect(roles.payLabel).toBe("付款帳戶（代墊）");
      expect(roles.payValue).toBe("富邦 Costco");
      expect(roles.receiveLabel).toBe("收款帳戶");
      expect(roles.receiveValue).toBe("Richart");
    });
  });

  describe("應付 (AP)", () => {
    it("unsettled: 收款帳戶（代墊）= counter, 付款帳戶 = 結清時指定", () => {
      const roles = arApAccountRoles(row({ kind: "ap", settled: false }), accountName)!;
      expect(roles.receiveLabel).toBe("收款帳戶（代墊）");
      expect(roles.receiveValue).toBe("富邦 Costco");
      expect(roles.payLabel).toBe("付款帳戶");
      expect(roles.payValue).toBe("結清時指定");
    });

    it("settled: 付款帳戶 = paying account (Richart), 收款帳戶 = received account (Costco)", () => {
      const roles = arApAccountRoles(row({ kind: "ap", settled: true }), accountName)!;
      expect(roles.receiveLabel).toBe("收款帳戶（代墊）");
      expect(roles.receiveValue).toBe("富邦 Costco");
      expect(roles.payLabel).toBe("付款帳戶");
      expect(roles.payValue).toBe("Richart");
    });
  });
});
