"use client";

import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "unordered-list"; items: string[] }
  | { kind: "ordered-list"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] };

type ExplanationSection = {
  title: string;
  body: string;
};

const EXPLANATION_SECTION_HIDDEN_TITLE = "__HIDDEN__";

function sanitizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .trim();
}

function parseSectionHeading(line: string) {
  const patterns: Array<{ title: string; pattern: RegExp }> = [
    { title: "Explanation", pattern: /^explanation\s*:\s*(.*)$/i },
    { title: "Explanation", pattern: /^why(?:\s+this\s+is)?\s+correct\s*:\s*(.*)$/i },
    { title: "Explanation", pattern: /^why\s+it(?:'|’)?s\s+correct\s*:\s*(.*)$/i },
    { title: "Core Idea", pattern: /^core idea(?:\s*\(.*\))?\s*:\s*(.*)$/i },
    { title: "Core Idea", pattern: /^core concept(?:\s*\(.*\))?\s*:\s*(.*)$/i },
    { title: EXPLANATION_SECTION_HIDDEN_TITLE, pattern: /^decision approach(?:\s*\(.*\))?\s*:\s*(.*)$/i },
    { title: "Option-by-Option", pattern: /^option-by-option(?:\s+explanation)?\s*:\s*(.*)$/i },
    { title: "Option Cross-Check", pattern: /^option cross-check\s*:\s*(.*)$/i },
    { title: "5-Second Exam Rule", pattern: /^5-second exam rule\s*:\s*(.*)$/i },
    { title: "Common Exam Traps", pattern: /^common exam traps?\s*:\s*(.*)$/i },
  ];

  for (const { title, pattern } of patterns) {
    const match = line.match(pattern);
    if (!match) continue;
    return {
      title,
      remainder: (match[1] ?? "").trim(),
    };
  }
  return null;
}

function parseExplanationSections(rawText: string): ExplanationSection[] {
  const lines = sanitizeText(rawText).split("\n");
  const sections: ExplanationSection[] = [];
  let currentTitle = "Explanation";
  let currentLines: string[] = [];
  let foundStructuredHeading = false;

  const pushCurrent = () => {
    const body = currentLines.join("\n").trim();
    if (!body) {
      return;
    }
    if (currentTitle === EXPLANATION_SECTION_HIDDEN_TITLE) {
      return;
    }
    sections.push({ title: currentTitle, body });
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = parseSectionHeading(line);
    if (heading) {
      foundStructuredHeading = true;
      pushCurrent();
      currentTitle = heading.title;
      currentLines = heading.remainder ? [heading.remainder] : [];
      continue;
    }
    currentLines.push(line);
  }

  pushCurrent();

  if (!foundStructuredHeading && sections.length === 1) {
    return [{ title: "Explanation", body: sections[0].body }];
  }

  const sectionPriority = new Map<string, number>([
    ["Explanation", 0],
    ["Option-by-Option", 1],
    ["Option Cross-Check", 2],
    ["Core Idea", 3],
    ["5-Second Exam Rule", 4],
    ["Common Exam Traps", 5],
  ]);

  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => {
      const leftPriority = sectionPriority.get(a.section.title) ?? 99;
      const rightPriority = sectionPriority.get(b.section.title) ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.section);
}

function isTableSeparator(line: string) {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!normalized) return false;
  return normalized
    .split("|")
    .every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = sanitizeText(text).split("\n");
  const blocks: MarkdownBlock[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor].trim();

    if (!line) {
      cursor += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      cursor += 1;
      continue;
    }

    if (line.startsWith("|") && cursor + 1 < lines.length && isTableSeparator(lines[cursor + 1])) {
      const header = parseTableRow(lines[cursor]);
      cursor += 2;
      const rows: string[][] = [];
      while (cursor < lines.length && lines[cursor].trim().startsWith("|")) {
        rows.push(parseTableRow(lines[cursor]));
        cursor += 1;
      }
      blocks.push({ kind: "table", headers: header, rows });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (cursor < lines.length && /^[-*]\s+/.test(lines[cursor].trim())) {
        items.push(lines[cursor].trim().replace(/^[-*]\s+/, ""));
        cursor += 1;
      }
      blocks.push({ kind: "unordered-list", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (cursor < lines.length && /^\d+\.\s+/.test(lines[cursor].trim())) {
        items.push(lines[cursor].trim().replace(/^\d+\.\s+/, ""));
        cursor += 1;
      }
      blocks.push({ kind: "ordered-list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (cursor < lines.length) {
      const current = lines[cursor].trim();
      if (!current) {
        cursor += 1;
        break;
      }
      if (
        /^(#{1,4})\s+/.test(current)
        || /^[-*]\s+/.test(current)
        || /^\d+\.\s+/.test(current)
        || (current.startsWith("|") && cursor + 1 < lines.length && isTableSeparator(lines[cursor + 1]))
      ) {
        break;
      }
      paragraphLines.push(current);
      cursor += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraphLines.join(" ") });
    }
  }

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const tokenRe = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(tokenRe)) {
    const matchText = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-text-${tokenIndex}`}>
          {text.slice(lastIndex, start)}
        </Fragment>,
      );
      tokenIndex += 1;
    }

    if (/^\[[^\]]+\]\([^)]+\)$/.test(matchText)) {
      const linkMatch = matchText.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a
            key={`${keyPrefix}-link-${tokenIndex}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-primary/60 underline-offset-2"
          >
            {linkMatch[1]}
          </a>,
        );
        tokenIndex += 1;
      }
    } else if (/^\*\*[^*]+\*\*$/.test(matchText)) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${tokenIndex}`}>
          {matchText.slice(2, -2)}
        </strong>,
      );
      tokenIndex += 1;
    } else if (/^`[^`]+`$/.test(matchText)) {
      nodes.push(
        <code key={`${keyPrefix}-code-${tokenIndex}`} className="rounded bg-muted px-1 py-0.5 text-[0.92em]">
          {matchText.slice(1, -1)}
        </code>,
      );
      tokenIndex += 1;
    } else if (/^\*[^*]+\*$/.test(matchText)) {
      nodes.push(
        <em key={`${keyPrefix}-em-${tokenIndex}`}>
          {matchText.slice(1, -1)}
        </em>,
      );
      tokenIndex += 1;
    } else {
      nodes.push(
        <Fragment key={`${keyPrefix}-raw-${tokenIndex}`}>
          {matchText}
        </Fragment>,
      );
      tokenIndex += 1;
    }

    lastIndex = start + matchText.length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-tail`}>
        {text.slice(lastIndex)}
      </Fragment>,
    );
  }

  return nodes.length > 0 ? nodes : text;
}

function renderMarkdownBlock(block: MarkdownBlock, index: number) {
  if (block.kind === "heading") {
    return (
      <h4 key={`heading-${index}`} className="font-semibold text-foreground">
        {renderInlineMarkdown(block.text, `heading-${index}`)}
      </h4>
    );
  }

  if (block.kind === "paragraph") {
    return (
      <p key={`paragraph-${index}`} className="leading-relaxed text-foreground/95">
        {renderInlineMarkdown(block.text, `paragraph-${index}`)}
      </p>
    );
  }

  if (block.kind === "unordered-list") {
    return (
      <ul key={`ul-${index}`} className="list-disc space-y-1 pl-5">
        {block.items.map((item, itemIndex) => (
          <li key={`ul-${index}-${itemIndex}`}>
            {renderInlineMarkdown(item, `ul-${index}-${itemIndex}`)}
          </li>
        ))}
      </ul>
    );
  }

  if (block.kind === "ordered-list") {
    return (
      <ol key={`ol-${index}`} className="list-decimal space-y-1 pl-5">
        {block.items.map((item, itemIndex) => (
          <li key={`ol-${index}-${itemIndex}`}>
            {renderInlineMarkdown(item, `ol-${index}-${itemIndex}`)}
          </li>
        ))}
      </ol>
    );
  }

  if (block.kind === "table") {
    return (
      <div key={`table-${index}`} className="overflow-x-auto rounded-md border">
        <table className="min-w-full border-collapse text-xs md:text-sm">
          <thead className="bg-muted/40">
            <tr>
              {block.headers.map((header, headerIndex) => (
                <th key={`table-${index}-head-${headerIndex}`} className="border-b px-3 py-2 text-left font-semibold">
                  {renderInlineMarkdown(header, `table-${index}-head-${headerIndex}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`table-${index}-row-${rowIndex}`} className="odd:bg-muted/10">
                {row.map((cell, cellIndex) => (
                  <td key={`table-${index}-row-${rowIndex}-cell-${cellIndex}`} className="border-t px-3 py-2 align-top">
                    {renderInlineMarkdown(cell, `table-${index}-row-${rowIndex}-cell-${cellIndex}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

export function ExplanationRenderer({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const normalized = sanitizeText(text);
  if (!normalized) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No explanation available.
      </p>
    );
  }

  const sections = parseExplanationSections(normalized);
  return (
    <div className={cn("space-y-3", className)}>
      {sections.map((section, sectionIndex) => {
        const blocks = parseMarkdownBlocks(section.body);
        return (
          <section key={`${section.title}-${sectionIndex}`} className="rounded-md border bg-card/60 p-3">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h3>
            <div className="space-y-2 text-sm">
              {blocks.map((block, blockIndex) => renderMarkdownBlock(block, blockIndex))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
