import { describe, expect, it } from "vitest";
import { createMemoryFinanceRepositoryForTests } from "./repositories";

describe("collectPendingChanges (repository)", () => {
  it("reports created and deleted records as pending changes", async () => {
    const repo = createMemoryFinanceRepositoryForTests({});
    await repo.createAccount({
      name: "錢包", currency: "TWD", openingBalance: 0, type: "cash",
      creditLimit: null, creditLimitGroup: "", statementDay: null, paymentDueDay: null,
      isSharedToHousehold: false, loanStartDate: null, annualInterestRate: null, loanTerm: null,
      iconName: null, color: null,
    });

    const all = await repo.collectPendingChanges(null);
    const accounts = all.changes.filter((c) => c.entity === "account");
    expect(accounts).toHaveLength(1);
    expect(accounts[0].deleted).toBe(false);
    expect(all.nextCursor).not.toBeNull();

    // Nothing pending once the cursor is advanced past the latest change.
    const caughtUp = await repo.collectPendingChanges(all.nextCursor);
    expect(caughtUp.count).toBe(0);

    // A soft-delete shows up as a pending deletion after the cursor.
    const [created] = await repo.listAccounts();
    await repo.deleteAccount(created.id);
    const afterDelete = await repo.collectPendingChanges(all.nextCursor);
    expect(afterDelete.changes.some((c) => c.entity === "account" && c.deleted)).toBe(true);
  });
});
