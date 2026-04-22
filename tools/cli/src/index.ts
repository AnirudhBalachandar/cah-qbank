#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs/promises"
import { createWriteStream } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, "..", "..", "..")
const appDir = path.join(repoRoot, "app")
const prismaDir = path.join(appDir, "prisma")
const nextBinaryPath = path.join(appDir, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next")
const cahHomeDir = path.join(os.homedir(), ".cah")
const pidFilePath = path.join(cahHomeDir, "pid")
const logsDir = path.join(cahHomeDir, "logs")
const backupsDir = path.join(cahHomeDir, "backups")
const defaultPort = 3000
const defaultUrl = `http://localhost:${defaultPort}`

type Command =
  | { kind: "serve" }
  | { kind: "stop" }
  | { kind: "db-backup" }
  | { kind: "help" }

type PidRecord = {
  pid: number
  url: string
  startedAt: string
}

export function parseCommand(argv: string[]): Command {
  const [first, second] = argv

  if (!first || first === "help" || first === "--help" || first === "-h") {
    return { kind: "help" }
  }

  if (first === "serve") {
    return { kind: "serve" }
  }

  if (first === "stop") {
    return { kind: "stop" }
  }

  if (first === "db" && second === "backup") {
    return { kind: "db-backup" }
  }

  throw new Error(`Unknown command: ${argv.join(" ") || "(empty)"}`)
}

export function resolveSqliteFilePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL: ${databaseUrl}`)
  }

  const rawPath = databaseUrl.slice("file:".length).split("?")[0]
  if (!rawPath || rawPath === ":memory:") {
    throw new Error(`Unsupported SQLite path: ${databaseUrl}`)
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(prismaDir, rawPath)
}

function loadAppEnvironment() {
  process.loadEnvFile?.(path.join(appDir, ".env"))
}

function runPnpm(args: string[], cwd = repoRoot) {
  execFileSync("pnpm", args, {
    cwd,
    stdio: "inherit",
  })
}

function processIsRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function ensureCahDirectories() {
  await Promise.all([
    fs.mkdir(cahHomeDir, { recursive: true }),
    fs.mkdir(logsDir, { recursive: true }),
    fs.mkdir(backupsDir, { recursive: true }),
  ])
}

async function readPidRecord() {
  try {
    const raw = await fs.readFile(pidFilePath, "utf8")
    return JSON.parse(raw) as PidRecord
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw error
  }
}

async function writePidRecord(record: PidRecord) {
  await fs.writeFile(pidFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf8")
}

async function removePidRecord() {
  await fs.rm(pidFilePath, { force: true })
}

async function openBrowser(url: string) {
  try {
    execFileSync("open", [url], { stdio: "ignore" })
  } catch {
    // Keep serving even if opening the browser fails.
  }
}

async function serve() {
  await ensureCahDirectories()

  const existingPid = await readPidRecord()
  if (existingPid && processIsRunning(existingPid.pid)) {
    await openBrowser(existingPid.url)
    console.log(
      JSON.stringify(
        {
          status: "already-running",
          ...existingPid,
        },
        null,
        2,
      ),
    )
    return
  }

  if (existingPid) {
    await removePidRecord()
  }

  runPnpm(["sync-db"])
  runPnpm(["--dir", appDir, "build"])

  const logPath = path.join(logsDir, `serve-${Date.now()}.log`)
  const logStream = createWriteStream(logPath, { flags: "a" })

  const child = spawn(
    nextBinaryPath,
    ["start", "--hostname", "127.0.0.1", "--port", String(defaultPort)],
    {
      cwd: appDir,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )

  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)
  child.unref()

  const record: PidRecord = {
    pid: child.pid ?? -1,
    url: defaultUrl,
    startedAt: new Date().toISOString(),
  }

  await writePidRecord(record)
  await openBrowser(defaultUrl)

  console.log(
    JSON.stringify(
      {
        status: "started",
        ...record,
        logPath,
      },
      null,
      2,
    ),
  )
}

async function stop() {
  const existingPid = await readPidRecord()

  if (!existingPid) {
    console.log(
      JSON.stringify(
        {
          status: "not-running",
        },
        null,
        2,
      ),
    )
    return
  }

  if (processIsRunning(existingPid.pid)) {
    process.kill(existingPid.pid)
  }

  await removePidRecord()

  console.log(
    JSON.stringify(
      {
        status: "stopped",
        pid: existingPid.pid,
      },
      null,
      2,
    ),
  )
}

async function backupDatabase() {
  await ensureCahDirectories()
  loadAppEnvironment()

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in app/.env")
  }

  const sourcePath = resolveSqliteFilePath(databaseUrl)
  const timestamp = new Date().toISOString().replace(/[:]/g, "-")
  const backupPath = path.join(backupsDir, `${timestamp}.db`)

  await fs.copyFile(sourcePath, backupPath)

  console.log(
    JSON.stringify(
      {
        status: "backed-up",
        sourcePath,
        backupPath,
      },
      null,
      2,
    ),
  )
}

function printHelp() {
  console.log(`Usage:
  cah serve
  cah stop
  cah db backup`)
}

export async function main(argv = process.argv.slice(2)) {
  const command = parseCommand(argv)

  switch (command.kind) {
    case "serve":
      await serve()
      return
    case "stop":
      await stop()
      return
    case "db-backup":
      await backupDatabase()
      return
    case "help":
      printHelp()
      return
  }
}

const entrypointPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null

if (entrypointPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  })
}
