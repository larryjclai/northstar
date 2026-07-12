import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModalShell } from "./ModalShell";

afterEach(() => {
  // Guard against a leaked scroll-lock between tests.
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

// jsdom has no `matchMedia` implementation — stub it per-test (repo convention,
// see AGENTS.md "vitest jsdom has no localStorage; stub per-test with vi.stubGlobal").
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe("ModalShell", () => {
  it("renders a labelled dialog (role + aria-modal + aria-label)", () => {
    render(
      <ModalShell title="編輯持倉" onClose={() => {}}>
        <button>ok</button>
      </ModalShell>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "編輯持倉");
  });

  it("supports aria-labelledby instead of aria-label", () => {
    render(
      <ModalShell labelledById="hdr" onClose={() => {}}>
        <h2 id="hdr">標題</h2>
      </ModalShell>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "hdr");
    expect(dialog).not.toHaveAttribute("aria-label");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <ModalShell title="t" onClose={onClose}>
        <button>ok</button>
      </ModalShell>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape when disableEscape is set", () => {
    const onClose = vi.fn();
    render(
      <ModalShell title="t" onClose={onClose} disableEscape>
        <button>ok</button>
      </ModalShell>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on scrim click but not on panel click", () => {
    const onClose = vi.fn();
    render(
      <ModalShell title="t" onClose={onClose}>
        <button>ok</button>
      </ModalShell>,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog); // panel — stopPropagation, no close
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement as HTMLElement); // scrim
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on scrim click when disableScrimClose is set", () => {
    const onClose = vi.fn();
    render(
      <ModalShell title="t" onClose={onClose} disableScrimClose>
        <button>ok</button>
      </ModalShell>,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focuses the panel (or [data-autofocus]) on mount and restores focus on unmount", () => {
    const opener = document.createElement("button");
    opener.textContent = "opener";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(
      <ModalShell title="t" onClose={() => {}}>
        <input aria-label="first" />
        <input aria-label="target" data-autofocus />
      </ModalShell>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("target"));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("wraps Tab from the last focusable back to the first", () => {
    render(
      <ModalShell title="t" onClose={() => {}}>
        <button>first</button>
        <button>last</button>
      </ModalShell>,
    );
    const first = screen.getByText("first");
    const last = screen.getByText("last");
    last.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    render(
      <ModalShell title="t" onClose={() => {}}>
        <button>first</button>
        <button>last</button>
      </ModalShell>,
    );
    const first = screen.getByText("first");
    const last = screen.getByText("last");
    first.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("locks viewport scroll while open and restores it on unmount", () => {
    document.documentElement.style.overflow = "auto";
    const { unmount } = render(
      <ModalShell title="t" onClose={() => {}}>
        <button>ok</button>
      </ModalShell>,
    );
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("leaves a portalled popover's own keyboard handling alone (trap ignores document.body focusables)", () => {
    // Simulate a Base UI popover that portals to document.body: a focusable that
    // is NOT a DOM descendant of the panel. Tab from it must not be hijacked by
    // the trap (the panel's native listener never sees the event).
    const onClose = vi.fn();
    render(
      <ModalShell title="t" onClose={onClose}>
        <button>inside</button>
      </ModalShell>,
    );
    const portalled = document.createElement("input");
    document.body.appendChild(portalled);
    portalled.focus();
    expect(document.activeElement).toBe(portalled);

    // Dispatch keydown on the portalled node — it is outside the panel subtree,
    // so it must not bubble into the trap nor move focus into the panel.
    fireEvent.keyDown(portalled, { key: "Tab" });
    expect(document.activeElement).toBe(portalled);
    fireEvent.keyDown(portalled, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    portalled.remove();
  });

  it("render-prop dismiss triggers onClose on click (jsdom sync path)", () => {
    const onClose = vi.fn();
    render(
      <ModalShell title="t" onClose={onClose}>
        {(dismiss) => <button onClick={dismiss}>x</button>}
      </ModalShell>,
    );
    fireEvent.click(screen.getByText("x"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("double-dismiss guard: two rapid Escape presses call onClose exactly once", () => {
    const onClose = vi.fn();
    render(
      <ModalShell title="t" onClose={onClose}>
        <button>ok</button>
      </ModalShell>,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('motion="none" renders no data-motion attribute', () => {
    render(
      <ModalShell title="t" onClose={() => {}} motion="none">
        <button>ok</button>
      </ModalShell>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("data-motion");
  });

  describe("mobilePresentation (plan 159)", () => {
    it('renders ns-sheet-bottom + data-motion="sheet-bottom" + the grab handle on a coarse pointer', () => {
      stubMatchMedia(true);
      render(
        <ModalShell
          title="t"
          onClose={() => {}}
          variant="drawer"
          mobilePresentation="bottom-sheet"
          panelStyle={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 420 }}
        >
          <button>ok</button>
        </ModalShell>,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveClass("ns-sheet-bottom");
      expect(dialog).toHaveAttribute("data-motion", "sheet-bottom");
      expect(dialog.querySelector(".ns-sheet-grab")).not.toBeNull();
      expect(dialog.querySelector(".ns-sheet-handle")).not.toBeNull();
      // Positional panelStyle keys are overridden, not merged onto the panel.
      expect(dialog.style.position).not.toBe("absolute");
      expect(dialog.style.width).toBe("");
    });

    it("leaves panelStyle positioning untouched on a fine pointer even when opted in", () => {
      stubMatchMedia(false);
      render(
        <ModalShell
          title="t"
          onClose={() => {}}
          variant="drawer"
          mobilePresentation="bottom-sheet"
          panelStyle={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 420 }}
        >
          <button>ok</button>
        </ModalShell>,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveClass("ns-sheet-bottom");
      expect(dialog).toHaveAttribute("data-motion", "drawer");
      expect(dialog.style.position).toBe("absolute");
      expect(dialog.style.width).toBe("420px");
      expect(dialog.querySelector(".ns-sheet-grab")).toBeNull();
    });

    it("does not render the grab handle when mobilePresentation is unset (default)", () => {
      stubMatchMedia(true); // coarse pointer, but call site never opted in
      render(
        <ModalShell title="t" onClose={() => {}} variant="drawer">
          <button>ok</button>
        </ModalShell>,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveClass("ns-sheet-bottom");
      expect(dialog.querySelector(".ns-sheet-grab")).toBeNull();
    });
  });
});
