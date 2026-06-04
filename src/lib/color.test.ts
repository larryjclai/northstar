import { describe, expect, it } from "vitest";
import { readableTextColor } from "./color";

const DARK = "#1a1a1a";
const WHITE = "#ffffff";

describe("readableTextColor", () => {
  it("uses dark text on light category colors", () => {
    expect(readableTextColor("#facc15")).toBe(DARK); // yellow
    expect(readableTextColor("#9fe870")).toBe(DARK); // light green (dark-theme chart-1)
    expect(readableTextColor("#f0c050")).toBe(DARK); // light amber (dark-theme chart-3)
    expect(readableTextColor("#ffffff")).toBe(DARK);
  });

  it("uses white text on dark/saturated colors", () => {
    expect(readableTextColor("#2c6df0")).toBe(WHITE); // blue
    expect(readableTextColor("#000000")).toBe(WHITE);
    expect(readableTextColor("#6e58d8")).toBe(WHITE); // purple
  });

  it("supports 3-digit hex and rgb()", () => {
    expect(readableTextColor("#fff")).toBe(DARK);
    expect(readableTextColor("#000")).toBe(WHITE);
    expect(readableTextColor("rgb(250, 204, 21)")).toBe(DARK);
    expect(readableTextColor("rgba(44, 109, 240, 0.9)")).toBe(WHITE);
  });

  it("falls back to white for unresolvable input", () => {
    expect(readableTextColor("not-a-color")).toBe(WHITE);
  });
});
