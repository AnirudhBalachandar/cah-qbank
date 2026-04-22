import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const maxBuffer = 32 * 1024 * 1024

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

export function buildSourceExcerpt(sourceText: string, maxChars = 32_000) {
  if (sourceText.length <= maxChars) {
    return sourceText
  }

  return `${sourceText.slice(0, maxChars).trimEnd()}\n\n[TRUNCATED]`
}
