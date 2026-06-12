// Demo mode pairs real tickers with synthetic prices, so live market data must
// never be pulled while the demo flag is on (e.g. post-split 0050.TW quotes
// would show a -42% P&L against the demo's pre-split cost basis).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFinanceRepository: vi.fn(),
}));

// The repo's jsdom setup ships without localStorage (Node's experimental
// localStorage shadows it), so back the demo flag with an in-memory stub.
function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

vi.mock("../../data/repositories", () => ({
  getFinanceRepository: mocks.getFinanceRepository,
}));

import { refreshLatestMarketData } from "./useMarketRefresh";

const DEMO_FLAG_KEY = "northstar.demoMode.v1";

beforeEach(() => {
  vi.stubGlobal("localStorage", makeLocalStorageStub());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("refreshLatestMarketData demo-mode guard", () => {
  it("skips the repository and providers entirely while the demo flag is set", async () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    await expect(refreshLatestMarketData()).resolves.toEqual({ quotes: 0, fxRates: 0 });
    expect(mocks.getFinanceRepository).not.toHaveBeenCalled();
  });

  it("runs normally once the demo flag is cleared", async () => {
    const repository = {
      listPortfolioAssets: vi.fn(async () => []),
      getAppSettings: vi.fn(async () => ({ exchangeRates: [] })),
      saveMarketQuotes: vi.fn(),
      saveDailyFxRates: vi.fn(),
      updateAppSettings: vi.fn(),
      recalculateDerivedData: vi.fn(async () => undefined),
    };
    mocks.getFinanceRepository.mockResolvedValue(repository);
    await expect(refreshLatestMarketData()).resolves.toEqual({ quotes: 0, fxRates: 0 });
    expect(mocks.getFinanceRepository).toHaveBeenCalledTimes(1);
    expect(repository.recalculateDerivedData).toHaveBeenCalledTimes(1);
  });
});
