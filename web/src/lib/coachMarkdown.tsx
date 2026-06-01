import type { ReactNode } from "react";

type Block =
  | { type: "h"; level: 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h", level: 3, text: trimmed.slice(4).trim() });
      i += 1;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h", level: 2, text: trimmed.slice(3).trim() });
      i += 1;
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || t.startsWith("#") || /^[-*•]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
        break;
      }
      para.push(t);
      i += 1;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }

  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-[var(--clin-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-[var(--clin-surface-muted)] px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function CoachMessageBody({ content }: { content: string }) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const blocks = parseBlocks(trimmed);

  return (
    <div className="coach-md space-y-2.5 text-sm leading-relaxed text-[var(--clin-text)]">
      {blocks.map((block, idx) => {
        const key = `b-${idx}`;
        if (block.type === "h") {
          const Tag = block.level === 2 ? "h3" : "h4";
          return (
            <Tag
              key={key}
              className={
                block.level === 2
                  ? "text-base font-semibold text-[var(--clin-text)]"
                  : "text-sm font-semibold text-[var(--clin-text)]"
              }
            >
              {renderInline(block.text, key)}
            </Tag>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={`${key}-${j}`}>{renderInline(item, `${key}-li-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={key} className="list-decimal space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={`${key}-${j}`}>{renderInline(item, `${key}-li-${j}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={key} className="text-[var(--clin-text)]">
            {renderInline(block.text, key)}
          </p>
        );
      })}
    </div>
  );
}
