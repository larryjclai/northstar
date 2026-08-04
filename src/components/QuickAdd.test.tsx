import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuickAdd } from "./QuickAdd";
import { ToastProvider } from "./Toast";

// QuickAdd now delegates its dialog semantics + body scroll lock entirely to
// <ModalShell> (plan 301 migration). ModalShell.test.tsx already covers the
// mechanism exhaustively (focus trap, Escape, drag, mobile presentation); this
// test only pins that QuickAdd actually wires ModalShell correctly — role,
// aria-label, and scroll-lock restoration on unmount — the same assertions
// ModalShell.test.tsx makes directly on ModalShell itself.
vi.mock("../data/repositories", async () => {
  const actual =
    await vi.importActual<typeof import("../data/repositories")>("../data/repositories");
  return {
    ...actual,
    getFinanceRepository: () => Promise.resolve(actual.createMemoryFinanceRepositoryForTests({})),
  };
});

function renderQuickAdd(open: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <QuickAdd open={open} onClose={() => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("QuickAdd (ModalShell migration)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    document.documentElement.style.overflow = "auto";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders as a labelled dialog when open", async () => {
    renderQuickAdd(true);
    const dialog = await screen.findByRole("dialog", { name: "快速記帳" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("locks viewport scroll while open and restores it on unmount", async () => {
    const { unmount } = renderQuickAdd(true);
    await waitFor(() => {
      expect(document.documentElement.style.overflow).toBe("hidden");
    });
    unmount();
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("renders nothing when closed", () => {
    renderQuickAdd(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
