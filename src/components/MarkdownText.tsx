import type { CSSProperties, ReactNode } from "react";
import { Fragment } from "react";

/**
 * Lightweight markdown renderer for the small subset device-side AI output
 * (and changelog notes) actually use: **bold**, ## / ### headings, - lists,
 * paragraphs and line breaks. No markdown library — the project has none as
 * a dependency and only needs this subset. Parses into React nodes (no
 * dangerouslySetInnerHTML).
 */

/** Split a line of text on `**bold**` spans, leaving unpaired `*`/`**` as literal text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t${i}`}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
      i += 1;
    }
    nodes.push(<strong key={`${keyPrefix}-b${i}`}>{match[1]}</strong>);
    i += 1;
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t${i}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

type Block =
  | { type: "h2" | "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "p"; text: string };

function parseBlocks(text: string): Block[] {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: "p", text: paragraphLines.join(" ") });
      paragraphLines = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: "ul", items: listItems });
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h3", text: line.slice(4) });
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h2", text: line.slice(3) });
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }
    flushList();
    paragraphLines.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function MarkdownText({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
}) {
  const blocks = parseBlocks(text);
  return (
    <div className={className} style={style}>
      {blocks.map((block, idx) => {
        const key = `b${idx}`;
        if (block.type === "h2") {
          return (
            <h2 key={key} className="text-base">
              {renderInline(block.text, key)}
            </h2>
          );
        }
        if (block.type === "h3") {
          return (
            <h3 key={key} className="text-sm">
              {renderInline(block.text, key)}
            </h3>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={key}>
              {block.items.map((item, itemIdx) => (
                <li key={`${key}-li${itemIdx}`}>{renderInline(item, `${key}-li${itemIdx}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={key}>{renderInline(block.text, key)}</p>;
      })}
    </div>
  );
}
