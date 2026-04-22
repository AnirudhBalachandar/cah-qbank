import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(currentDir, "..")
const schemaPath = path.join(appRoot, "prisma", "schema.prisma")
const schemaDir = path.dirname(schemaPath)

let cachedBootstrapSql: string | null = null

function getBootstrapSql() {
  if (cachedBootstrapSql) {
    return cachedBootstrapSql
  }

  const rawSql = execFileSync(
    "pnpm",
    [
      "exec",
      "prisma",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
    ],
    {
      cwd: appRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  )

  cachedBootstrapSql = rawSql
    .replaceAll('CREATE TABLE "', 'CREATE TABLE IF NOT EXISTS "')
    .replaceAll('CREATE UNIQUE INDEX "', 'CREATE UNIQUE INDEX IF NOT EXISTS "')
    .replaceAll('CREATE INDEX "', 'CREATE INDEX IF NOT EXISTS "')

  return cachedBootstrapSql
}

export function resolveSqliteFilePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL: ${databaseUrl}`)
  }

  const rawPath = databaseUrl.slice("file:".length).split("?")[0]
  if (!rawPath || rawPath === ":memory:") {
    throw new Error(`Unsupported SQLite path: ${databaseUrl}`)
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(schemaDir, rawPath)
}

export async function ensureSqliteSchema(databaseUrl: string) {
  const dbPath = resolveSqliteFilePath(databaseUrl)
  await fs.mkdir(path.dirname(dbPath), { recursive: true })
  await fs.writeFile(dbPath, "", { flag: "a" })
  execFileSync("sqlite3", [dbPath], {
    input: `PRAGMA foreign_keys = ON;\n${getBootstrapSql()}\n`,
    stdio: ["pipe", "ignore", "pipe"],
  })

  return dbPath
}
