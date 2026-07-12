import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./Toast";

let api: ReturnType<typeof useToast>;

function Capture() {
  api = useToast();
  return null;
}

function renderProvider() {
  render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("auto-dismisses a success toast after its default 4000ms duration", () => {
    renderProvider();
    act(() => {
      api.success("已儲存");
    });
    expect(screen.getByText("已儲存")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("已儲存")).not.toBeInTheDocument();
  });

  it("keeps a sticky error toast around past any normal duration", () => {
    renderProvider();
    act(() => {
      api.error("失敗了");
    });
    expect(screen.getByText("失敗了")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("失敗了")).toBeInTheDocument();
  });

  it("pauses the auto-dismiss timer while the pointer hovers the stack, resumes on leave", () => {
    renderProvider();
    act(() => {
      api.success("提示");
    });
    const viewport = screen.getByTestId("toast-viewport");

    act(() => {
      vi.advanceTimersByTime(2000); // 2000ms elapsed of the 4000ms duration
    });
    act(() => {
      fireEvent.pointerEnter(viewport);
    });
    act(() => {
      vi.advanceTimersByTime(10_000); // paused — none of this should count
    });
    expect(screen.getByText("提示")).toBeInTheDocument();

    act(() => {
      fireEvent.pointerLeave(viewport);
    });
    act(() => {
      vi.advanceTimersByTime(2100); // ~2000ms remaining, resumed
    });
    expect(screen.queryByText("提示")).not.toBeInTheDocument();
  });

  it("pauses while the document is hidden and resumes when it becomes visible again", () => {
    renderProvider();
    act(() => {
      api.success("背景通知");
    });

    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      vi.advanceTimersByTime(4000); // past the default duration, but hidden → paused
    });
    expect(screen.getByText("背景通知")).toBeInTheDocument();

    hiddenSpy.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      vi.advanceTimersByTime(4000); // full duration again to be safe
    });
    expect(screen.queryByText("背景通知")).not.toBeInTheDocument();

    hiddenSpy.mockRestore();
  });

  it("two-phase dismiss is idempotent: dismissing the same toast twice removes it once and does not throw", () => {
    renderProvider();
    let id = "";
    act(() => {
      id = api.info("提醒");
    });
    expect(screen.getByText("提醒")).toBeInTheDocument();

    expect(() => {
      act(() => {
        api.dismiss(id);
        api.dismiss(id);
      });
    }).not.toThrow();

    expect(screen.queryByText("提醒")).not.toBeInTheDocument();
  });
});
