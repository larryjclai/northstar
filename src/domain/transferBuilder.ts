import type { CurrencyCode, LedgerTransaction } from "./types";

export interface TransferInput {
  idFactory: () => string;
  now: string;
  spaceId: string;
  groupId: string;
  date: string;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceCurrency: CurrencyCode;
  destinationCurrency: CurrencyCode;
  sourceAmount: number;
  destinationAmount?: number;
  note?: string;
}

export function buildTransfer(input: TransferInput): LedgerTransaction[] {
  if (input.sourceAccountId === input.destinationAccountId) {
    throw new Error("Transfer requires two different accounts.");
  }
  if (input.sourceAmount <= 0) {
    throw new Error("Source amount must be greater than zero.");
  }

  const sameCurrency = input.sourceCurrency.toUpperCase() === input.destinationCurrency.toUpperCase();
  const destinationAmount = sameCurrency ? input.sourceAmount : input.destinationAmount;
  if (destinationAmount === undefined || destinationAmount <= 0) {
    throw new Error("Destination amount is required for cross-currency transfers.");
  }

  const common = {
    spaceId: input.spaceId,
    revision: 1,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    date: input.date,
    name: sameCurrency ? "轉帳" : "外幣兌換",
    category: sameCurrency ? "轉帳" : "外幣兌換",
    subcategory: sameCurrency ? "帳戶轉移" : "外幣兌換",
    merchant: "",
    entryType: "transfer" as const,
    settlementStatus: "settled" as const,
    note: input.note ?? "",
    linkedInvestmentRecordId: null,
    groupId: input.groupId,
    isReviewed: false,
    receiptAttachmentId: null,
    recurringRuleId: null,
  };

  return [
    {
      ...common,
      id: input.idFactory(),
      accountId: input.sourceAccountId,
      amount: -input.sourceAmount,
      currency: input.sourceCurrency,
    },
    {
      ...common,
      id: input.idFactory(),
      accountId: input.destinationAccountId,
      amount: destinationAmount,
      currency: input.destinationCurrency,
    },
  ];
}
