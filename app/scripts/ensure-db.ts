import path from "node:path"
import { fileURLToPath } from "node:url"

import { ensureSqliteSchema } from "../lib/sqlite-schema"

const currentDir = path.dirname(fileURLToPath(import.meta.url))
process.loadEnvFile?.(path.resolve(currentDir, "..", ".env"))

async function main() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set")
  }

  const dbPath = await ensureSqliteSchema(databaseUrl)

  console.log(
    JSON.stringify(
      {
        databaseUrl,
        dbPath,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
