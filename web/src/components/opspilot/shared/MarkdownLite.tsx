"use client";

/**
 * MarkdownLite — tiny, dependency-free renderer for AI assistant drafts.
 * Supports the subset the assistant prompts allow: "## "/"### " headings,
 * "- " bullets, "1." ordered lists, **bold**, `code`, and paragraphs.
 * Everything is rendered as React elements (no dangerouslySetInnerHTML),
 * so AI output can never inject markup.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded-md bg-surface-container-high px-1.5 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = m.index + token.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownLite({ content, className }: { content: string; className?: string }) {
  const blocks = React.useMemo(() => {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    type Block =
      | { kind: "h2"; text: string }
      | { kind: "h3"; text: string }
      | { kind: "p"; text: string }
      | { kind: "ul"; items: string[] }
      | { kind: "ol"; items: string[] };
    const out: Block[] = [];
    let list: { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] } | null = null;

    const flush = () => {
      if (list) out.push(list);
      list = null;
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        flush();
        continue;
      }
      if (line.startsWith("### ")) {
        flush();
        out.push({ kind: "h3", text: line.slice(4) });
      } else if (line.startsWith("## ")) {
        flush();
        out.push({ kind: "h2", text: line.slice(3) });
      } else if (/^\s*[-*]\s+/.test(line)) {
        const item = line.replace(/^\s*[-*]\s+/, "");
        if (!list || list.kind !== "ul") {
          flush();
          list = { kind: "ul", items: [] };
        }
        list.items.push(item);
      } else if (/^\s*\d+[.)]\s+/.test(line)) {
        const item = line.replace(/^\s*\d+[.)]\s+/, "");
        if (!list || list.kind !== "ol") {
          flush();
          list = { kind: "ol", items: [] };
        }
        list.items.push(item);
      } else {
        flush();
        out.push({ kind: "p", text: line });
      }
    }
    flush();
    return out;
  }, [content]);

  return (
    <div className={cn("space-y-2.5 text-label-lg leading-relaxed text-on-surface", className)}>
      {blocks.map((b, i) => {
        if (b.kind === "h2") {
          return (
            <h3 key={i} className="pt-1.5 text-title-sm font-semibold text-foreground">
              {renderInline(b.text, `h2-${i}`)}
            </h3>
          );
        }
        if (b.kind === "h3") {
          return (
            <h4 key={i} className="pt-1 text-label-lg font-semibold text-foreground">
              {renderInline(b.text, `h3-${i}`)}
            </h4>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul key={i} className="ml-1 space-y-1.5">
              {b.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2">
                  <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
                  <span className="min-w-0">{renderInline(item, `ul-${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.kind === "ol") {
          return (
            <ol key={i} className="ml-1 space-y-1.5">
              {b.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground" aria-hidden>
                    {j + 1}
                  </span>
                  <span className="min-w-0">{renderInline(item, `ol-${i}-${j}`)}</span>
                </li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{renderInline(b.text, `p-${i}`)}</p>;
      })}
    </div>
  );
}
