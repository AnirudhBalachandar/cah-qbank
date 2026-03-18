import { parse } from "node-html-parser";
import { existsSync } from "node:fs";
import robotsParser from "robots-parser";

import { prisma } from "@/lib/db";

type CuratedSourceConfig = {
  domain: string;
  entries: Array<{
    title: string;
    url: string;
    tags?: string[];
  }>;
};

export type ExternalSnippet = {
  sourceRef: string;
  title: string;
  excerpt: string;
  accessedAt: string;
};

const MAX_EXCERPT_LENGTH = 1400;

function getCuratedConfigPath() {
  const direct = `${process.cwd()}/docs/curated_sources.json`;
  if (existsSync(direct)) {
    return direct;
  }
  return `${process.cwd()}/../docs/curated_sources.json`;
}

async function loadCuratedSources(): Promise<CuratedSourceConfig[]> {
  const content = await import("node:fs/promises").then((fs) => fs.readFile(getCuratedConfigPath(), "utf8"));
  return JSON.parse(content) as CuratedSourceConfig[];
}

function scoreEntry(entry: { title: string; tags?: string[] }, query: string) {
  const lower = query.toLowerCase();
  const tagMatch = (entry.tags ?? []).some((tag) => lower.includes(tag.toLowerCase()));
  const titleMatch = lower.split(/\s+/).some((part) => part.length > 2 && entry.title.toLowerCase().includes(part));
  return Number(tagMatch) + Number(titleMatch);
}

async function canFetch(url: string) {
  try {
    const parsed = new URL(url);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
    const robotsText = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) }).then((response) => response.text());
    const robots = robotsParser(robotsUrl, robotsText);
    return robots.isAllowed(url, "CAH-QBank-Bot");
  } catch {
    return false;
  }
}

async function fetchExcerpt(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const root = parse(html);
  const text = root.text
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, MAX_EXCERPT_LENGTH);

  return text;
}

export async function retrieveExternalSnippets({
  query,
  limit = 3,
}: {
  query: string;
  limit?: number;
}): Promise<ExternalSnippet[]> {
  const curated = await loadCuratedSources();

  const candidates = curated
    .flatMap((source) =>
      source.entries.map((entry) => ({
        domain: source.domain,
        ...entry,
        score: scoreEntry(entry, query),
      })),
    )
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 3);

  const snippets: ExternalSnippet[] = [];

  for (const entry of candidates) {
    if (snippets.length >= limit) {
      break;
    }

    const cached = await prisma.contentChunk.findFirst({
      where: {
        sourceType: "web",
        sourceRef: entry.url,
      },
      orderBy: { createdAt: "desc" },
      select: { text: true, metadata: true },
    });

    if (cached && cached.text) {
      snippets.push({
        sourceRef: entry.url,
        title: entry.title,
        excerpt: cached.text,
        accessedAt:
          typeof (cached.metadata as Record<string, unknown> | null)?.accessedAt === "string"
            ? ((cached.metadata as Record<string, unknown>).accessedAt as string)
            : new Date().toISOString(),
      });
      continue;
    }

    const allowed = await canFetch(entry.url);
    if (!allowed) {
      continue;
    }

    try {
      const excerpt = await fetchExcerpt(entry.url);
      const accessedAt = new Date().toISOString();

      snippets.push({
        sourceRef: entry.url,
        title: entry.title,
        excerpt,
        accessedAt,
      });

      await prisma.contentChunk.create({
        data: {
          sourceType: "web",
          sourceRef: entry.url,
          title: entry.title,
          heading: null,
          pageStart: null,
          pageEnd: null,
          text: excerpt,
          metadata: {
            url: entry.url,
            title: entry.title,
            domain: entry.domain,
            accessedAt,
            tags: entry.tags ?? [],
          },
        },
      });
    } catch {
      continue;
    }
  }

  return snippets;
}
