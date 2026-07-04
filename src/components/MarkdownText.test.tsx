import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "./MarkdownText";

describe("MarkdownText", () => {
  it("renders **bold** as a single strong element", () => {
    const { container } = render(<MarkdownText text="**你好**" />);
    const strongs = container.querySelectorAll("strong");
    expect(strongs).toHaveLength(1);
    expect(strongs[0].textContent).toBe("你好");
  });

  it("renders bold numbers inline within surrounding plain text", () => {
    const { container } = render(<MarkdownText text="這個月收入是 **6,060** 元" />);
    const strongs = container.querySelectorAll("strong");
    expect(strongs).toHaveLength(1);
    expect(strongs[0].textContent).toBe("6,060");
    expect(container.textContent).toBe("這個月收入是 6,060 元");
  });

  it("renders ### headings without the literal markdown marker", () => {
    const { container } = render(<MarkdownText text="### 標題" />);
    expect(container.textContent).toContain("標題");
    expect(container.textContent).not.toContain("###");
    expect(container.querySelector("h3")?.textContent).toBe("標題");
  });

  it("renders - lists as separate list items", () => {
    render(<MarkdownText text={"- a\n- b"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("a");
    expect(items[1].textContent).toBe("b");
  });

  it("leaves unpaired ** as literal text without swallowing the rest of the string", () => {
    const { container } = render(<MarkdownText text="這是 **未完成的粗體 之後還有文字" />);
    expect(container.querySelectorAll("strong")).toHaveLength(0);
    expect(container.textContent).toBe("這是 **未完成的粗體 之後還有文字");
  });
});
