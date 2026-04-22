import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { loadEnvFileIfPresent, parseEnvFileContents } from "../src/index.js"

describe("generate env loading", () => {
  const originalEnv = { ...process.env }
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    for (const key of new Set([...Object.keys(process.env), ...Object.keys(originalEnv)])) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }

    await Promise.all(
      temporaryDirectories.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    )
  })

  it("parses env lines and strips wrapping quotes", () => {
    expect(
      parseEnvFileContents([
        "OPENAI_API_KEY=\"sk-test\"",
        "OPENROUTER_MODEL='google/gemma-4-31b-it:free'",
        "# comment",
        "",
      ].join("\n")),
    ).toEqual({
      OPENAI_API_KEY: "sk-test",
      OPENROUTER_MODEL: "google/gemma-4-31b-it:free",
    })
  })

  it("prefers repo env values over shell exports for managed generation keys", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cah-generate-env-"))
    temporaryDirectories.push(tempDir)
    const envPath = path.join(tempDir, ".env")

    await fs.writeFile(
      envPath,
      [
        "OPENAI_API_KEY=from-file",
        "GENERATE_API_PROVIDER=openai",
        "UNMANAGED_VALUE=from-file",
      ].join("\n"),
      "utf8",
    )

    process.env.OPENAI_API_KEY = "from-shell"
    process.env.GENERATE_API_PROVIDER = "openrouter"
    process.env.UNMANAGED_VALUE = "from-shell"

    loadEnvFileIfPresent(envPath)

    expect(process.env.OPENAI_API_KEY).toBe("from-file")
    expect(process.env.GENERATE_API_PROVIDER).toBe("openai")
    expect(process.env.UNMANAGED_VALUE).toBe("from-shell")
  })
})
