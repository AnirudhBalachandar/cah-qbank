import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { parseCommand, resolveSqliteFilePath } from "../src/index.js"

const testsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testsDir, "..", "..", "..")

describe("cah cli", () => {
  it("parses supported commands", () => {
    expect(parseCommand(["serve"])).toEqual({ kind: "serve" })
    expect(parseCommand(["stop"])).toEqual({ kind: "stop" })
    expect(parseCommand(["db", "backup"])).toEqual({ kind: "db-backup" })
    expect(parseCommand([])).toEqual({ kind: "help" })
  })

  it("resolves sqlite paths from the app prisma directory", () => {
    expect(resolveSqliteFilePath("file:../../cah.db")).toBe(
      path.join(repoRoot, "cah.db"),
    )
    expect(resolveSqliteFilePath("file:/tmp/cah.db")).toBe("/tmp/cah.db")
  })
})
