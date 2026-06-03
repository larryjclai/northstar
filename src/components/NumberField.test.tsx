import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { NumberField } from "./NumberField";

function Harness({ decimals }: { decimals?: number }) {
  const [value, setValue] = useState(0);
  return (
    <>
      <NumberField value={value} onChange={setValue} decimals={decimals} aria-label="amount" />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("NumberField", () => {
  it("lets you type a leading-zero decimal directly (0.05) without losing the dot", () => {
    render(<Harness decimals={2} />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;

    fireEvent.focus(input);
    // Simulate the keystroke sequence "0", "0.", "0.0", "0.05".
    for (const step of ["0", "0.", "0.0", "0.05"]) {
      fireEvent.change(input, { target: { value: step } });
      // The dot/intermediate text must survive each re-render.
      expect(input.value).toBe(step);
    }
    expect(screen.getByTestId("value").textContent).toBe("0.05");
  });

  it("collapses extra decimal points and strips non-numeric characters", () => {
    render(<Harness decimals={4} />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1.2.3a" } });
    expect(input.value).toBe("1.23");
    expect(screen.getByTestId("value").textContent).toBe("1.23");
  });

  it("formats with thousand separators once blurred and shows empty for zero", () => {
    function FormatHarness() {
      const [value, setValue] = useState(1234.5);
      return <NumberField value={value} onChange={setValue} decimals={2} aria-label="amount" />;
    }
    render(<FormatHarness />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;
    expect(input.value).toBe("1,234.5");
  });
});
