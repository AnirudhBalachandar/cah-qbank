#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { defaultJobsDbPath, enqueueJobs, ensureJobsDatabase, getJobCounts } from "./storage.js"
import { runWorker } from "./worker.js"

type Command =
  | { kind: "enqueue"; source: string; count: number; tags: string[] }
  | { kind: "worker" }
  | { kind: "help" }

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, "..", "..", "..")

function loadEnvFileIfPresent(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      process.loadEnvFile?.(filePath)
    }
  } catch {
    // Ignore missing or unsupported env loading.
  }
}

function loadEnvironment() {
  loadEnvFileIfPresent(path.join(repoRoot, ".env"))
  loadEnvFileIfPresent(path.join(repoRoot, "app", ".env"))
}

function parseCsv(value: string | undefined) {
  if (!value) return []
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

function getFlagValue(argv: string[], flagName: string) {
  const index = argv.indexOf(flagName)
  if (index === -1) return undefined
  return argv[index + 1]
}

export function parseCommand(argv: string[]): Command {
  const [first] = argv

  if (!first || first === "help" || first === "--help" || first === "-h") {
    return { kind: "help" }
  }

  if (first === "worker") {
    return { kind: "worker" }
  }

  if (first === "enqueue") {
    const source = getFlagValue(argv, "--source")
    const countRaw = getFlagValue(argv, "--count")
    const count = countRaw ? Number.parseInt(countRaw, 10) : Number.NaN

    if (!source) {
      throw new Error("Missing required flag: --source")
    }
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("Missing or invalid flag: --count")
    }

    return {
      kind: "enqueue",
      source,
      count,
      tags: parseCsv(getFlagValue(argv, "--tags")),
    }
  }

  throw new Error(`Unknown command: ${argv.join(" ")}`)
}

function printHelp() {
  console.log(`Usage:
  generate enqueue --source path/to/file.pdf --count 10 --tags "neonatal,respiratory"
  generate worker`)
}

async function handleEnqueue(command: Extract<Command, { kind: "enqueue" }>) {
  const dbPath = defaultJobsDbPath(repoRoot)
  ensureJobsDatabase(dbPath)

  const sourcePath = path.resolve(process.cwd(), command.source)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file does not exist: ${sourcePath}`)
  }

  const timestamp = new Date().toISOString().replace(/[:]/g, "-")
  const batch = `${path.basename(sourcePath, path.extname(sourcePath))}-${timestamp}`
  const jobs = enqueueJobs({
    batch,
    sourcePath,
    tags: command.tags,
    count: command.count,
    dbPath,
  })
  const counts = getJobCounts(dbPath)

  console.log(
    JSON.stringify(
      {
        status: "queued",
        batch,
        enqueued: jobs.length,
        dbPath,
        counts,
      },
      null,
      2,
    ),
  )
}

async function handleWorker() {
  const dbPath = defaultJobsDbPath(repoRoot)
  ensureJobsDatabase(dbPath)
  const result = await runWorker({
    repoRoot,
    dbPath,
  })
  const counts = getJobCounts(dbPath)

  console.log(
    JSON.stringify(
      {
        status: "completed",
        ...result,
        dbPath,
        counts,
      },
      null,
      2,
    ),
  )
}

export async function main(argv = process.argv.slice(2)) {
  loadEnvironment()
  const command = parseCommand(argv)

  switch (command.kind) {
    case "enqueue":
      await handleEnqueue(command)
      return
    case "worker":
      await handleWorker()
      return
    case "help":
      printHelp()
      return
  }
}

const entrypointPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null

if (entrypointPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error)
    process.exitCode = 1
  })
}
