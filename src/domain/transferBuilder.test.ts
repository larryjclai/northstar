import { describe, expect, it } from "vitest";
import { buildTransfer } from "./transferBuilder";

describe("transfer builder", () => {
  it("creates balanced same-currency transfer rows", () => {
    let next = 0;
    const rows = buildTransfer({
      idFactory: () => `id_${next++}`,
      now: "2026-05-24T00:00:00.000Z",
      spaceId: "space",
      groupId: "group",
      date: "2026-05-24",
      sourceAccountId: "a",
      destinationAccountId: "b",
      sourceCurrency: "TWD",
      destinationCurrency: "TWD",
      sourceAmount: 1000,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(-1000);
    expect(rows[1].amount).toBe(1000);
    expect(rows[0].groupId).toBe("group");
    expect(rows[1].category).toBe("轉帳");
  });

  it("requires destination amount for cross-currency transfers", () => {
    expect(() =>
      buildTransfer({
        idFactory: () => crypto.randomUUID(),
        now: "2026-05-24T00:00:00.000Z",
        spaceId: "space",
        groupId: "group",
        date: "2026-05-24",
        sourceAccountId: "a",
        destinationAccountId: "b",
        sourceCurrency: "USD",
        destinationCurrency: "TWD",
        sourceAmount: 100,
      }),
    ).toThrow("Destination amount");
  });

  it("creates cross-currency rows with FX category", () => {
    const rows = buildTransfer({
      idFactory: () => crypto.randomUUID(),
      now: "2026-05-24T00:00:00.000Z",
      spaceId: "space",
      groupId: "group",
      date: "2026-05-24",
      sourceAccountId: "usd",
      destinationAccountId: "twd",
      sourceCurrency: "USD",
      destinationCurrency: "TWD",
      sourceAmount: 100,
      destinationAmount: 3150,
    });

    expect(rows[0].amount).toBe(-100);
    expect(rows[1].amount).toBe(3150);
    expect(rows[0].category).toBe("外幣兌換");
  });
});

