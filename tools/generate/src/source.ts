import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const maxBuffer = 32 * 1024 * 1024

export type SourceExcerpt = {
  text: string
  start: number
  end: number
  truncated: boolean
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function extractSourceText(sourcePath: string) {
  const extension = path.extname(sourcePath).toLowerCase()

  if (extension === ".txt" || extension === ".md") {
    return cleanExtractedText(await fs.readFile(sourcePath, "utf8"))
  }

  if (extension === ".doc" || extension === ".docx" || extension === ".rtf") {
    return cleanExtractedText(
      execFileSync("textutil", ["-convert", "txt", "-stdout", sourcePath], {
        encoding: "utf8",
        maxBuffer,
      }),
    )
  }

  if (extension === ".pdf") {
    return cleanExtractedText(
      execFileSync("pdftotext", ["-layout", sourcePath, "-"], {
        encoding: "utf8",
        maxBuffer,
      }),
    )
  }

  throw new Error(`Unsupported source type: ${extension || "(no extension)"}`)
}

export function buildSourceExcerpt(
  sourceText: string,
  {
    maxChars = 32_000,
    ordinal = 1,
    total = 1,
  }: {
    maxChars?: number
    ordinal?: number
    total?: number
  } = {},
): SourceExcerpt {
  if (sourceText.length <= maxChars) {
    return {
      text: sourceText,
      start: 0,
      end: sourceText.length,
      truncated: false,
    }
  }

  const safeTotal = Math.max(1, total)
  const safeOrdinal = Math.min(Math.max(1, ordinal), safeTotal)
  const maxStart = Math.max(0, sourceText.length - maxChars)
  const ratio = safeTotal === 1 ? 0 : (safeOrdinal - 1) / (safeTotal - 1)
  const start = Math.min(maxStart, Math.floor(maxStart * ratio))
  const end = Math.min(sourceText.length, start + maxChars)

  return {
    text: `${sourceText.slice(start, end).trimEnd()}\n\n[TRUNCATED EXCERPT ${safeOrdinal}/${safeTotal}]`,
    start,
    end,
    truncated: true,
  }
}
