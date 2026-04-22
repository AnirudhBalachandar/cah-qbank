import { randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { jobInputSchema, jobOutputSchema, jobRecordSchema, type JobOutput, type JobRecord } from "./types.js"

type JobRow = {
  id: string
  status: string
  batch: string
  input: string
  output: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

type EnqueueJobsParams = {
  batch: string
  sourcePath: string
  tags: string[]
  count: number
  dbPath: string
}

type JobCounts = {
  queued: number
  running: number
  done: number
  failed: number
  total: number
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  batch TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT,
  error TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_status_created_idx ON jobs(status, createdAt);
`

function sqlQuote(value: string | null) {
  if (value === null) return "NULL"
  return `'${value.replace(/'/g, "''")}'`
}

function executeSql(dbPath: string, sql: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  return execFileSync("sqlite3", [dbPath, sql], {
    encoding: "utf8",
  })
}

function queryJson<T>(dbPath: string, sql: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const output = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
  }).trim()
  if (!output) return [] as T[]
  return JSON.parse(output) as T[]
}

function parseJobRow(row: JobRow) {
  return jobRecordSchema.parse({
    id: row.id,
    status: row.status,
    batch: row.batch,
    input: JSON.parse(row.input),
    output: row.output ? JSON.parse(row.output) : null,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export function defaultJobsDbPath(repoRoot: string) {
  return path.join(repoRoot, "tools", "generate", "jobs.db")
}

export function ensureJobsDatabase(dbPath: string) {
  executeSql(dbPath, schemaSql)
}

export function enqueueJobs({
  batch,
  sourcePath,
  tags,
  count,
  dbPath,
}: EnqueueJobsParams) {
  const created: JobRecord[] = []

  ensureJobsDatabase(dbPath)

  for (let ordinal = 1; ordinal <= count; ordinal += 1) {
    const input = jobInputSchema.parse({
      sourcePath,
      tags,
      ordinal,
      total: count,
    })
    const timestamp = new Date().toISOString()
    const id = randomUUID()
    executeSql(
      dbPath,
      `
      INSERT INTO jobs (id, status, batch, input, output, error, createdAt, updatedAt)
      VALUES (
        ${sqlQuote(id)},
        'queued',
        ${sqlQuote(batch)},
        ${sqlQuote(JSON.stringify(input))},
        NULL,
        NULL,
        ${sqlQuote(timestamp)},
        ${sqlQuote(timestamp)}
      );
      `,
    )
    created.push(
      jobRecordSchema.parse({
        id,
        status: "queued",
        batch,
        input,
        output: null,
        error: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    )
  }

  return created
}

export function claimQueuedJobs(limit: number, dbPath: string) {
  ensureJobsDatabase(dbPath)
  const rows = queryJson<JobRow>(
    dbPath,
    `
    SELECT id, status, batch, input, output, error, createdAt, updatedAt
    FROM jobs
    WHERE status = 'queued'
    ORDER BY createdAt ASC
    LIMIT ${Math.max(1, limit)};
    `,
  )
  const claimed: JobRecord[] = []

  for (const row of rows) {
    const updatedAt = new Date().toISOString()
    executeSql(
      dbPath,
      `
      UPDATE jobs
      SET status = 'running', updatedAt = ${sqlQuote(updatedAt)}
      WHERE id = ${sqlQuote(row.id)} AND status = 'queued';
      `,
    )

    const refreshed = queryJson<JobRow>(
      dbPath,
      `
      SELECT id, status, batch, input, output, error, createdAt, updatedAt
      FROM jobs
      WHERE id = ${sqlQuote(row.id)};
      `,
    )[0]

    if (!refreshed || refreshed.status !== "running") continue
    claimed.push(parseJobRow(refreshed))
  }

  return claimed
}

export function markJobDone({
  dbPath,
  jobId,
  output,
}: {
  dbPath: string
  jobId: string
  output: JobOutput
}) {
  ensureJobsDatabase(dbPath)
  executeSql(
    dbPath,
    `
    UPDATE jobs
    SET status = 'done',
        output = ${sqlQuote(JSON.stringify(jobOutputSchema.parse(output)))},
        error = NULL,
        updatedAt = ${sqlQuote(new Date().toISOString())}
    WHERE id = ${sqlQuote(jobId)};
    `,
  )
}

export function markJobFailed({
  dbPath,
  jobId,
  error,
}: {
  dbPath: string
  jobId: string
  error: string
}) {
  ensureJobsDatabase(dbPath)
  executeSql(
    dbPath,
    `
    UPDATE jobs
    SET status = 'failed',
        error = ${sqlQuote(error)},
        output = NULL,
        updatedAt = ${sqlQuote(new Date().toISOString())}
    WHERE id = ${sqlQuote(jobId)};
    `,
  )
}

export function getJobCounts(dbPath: string): JobCounts {
  ensureJobsDatabase(dbPath)
  const rows = queryJson<Array<{ status: string; count: number }>[number]>(
    dbPath,
    `
    SELECT status, COUNT(*) AS count
    FROM jobs
    GROUP BY status;
    `,
  )
  const counts: JobCounts = {
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
    total: 0,
  }

  for (const row of rows) {
    if (row.status === "queued" || row.status === "running" || row.status === "done" || row.status === "failed") {
      counts[row.status] = row.count
      counts.total += row.count
    }
  }

  return counts
}
