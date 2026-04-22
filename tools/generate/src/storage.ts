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
  workerId?: string | null
  startedAt?: string | null
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
  workerId TEXT,
  startedAt TEXT,
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
  const columns = new Set(queryJson<Array<{ name: string }>[number]>(dbPath, "PRAGMA table_info(jobs);").map((row) => row.name))
  if (!columns.has("workerId")) {
    executeSql(dbPath, "ALTER TABLE jobs ADD COLUMN workerId TEXT;")
  }
  if (!columns.has("startedAt")) {
    executeSql(dbPath, "ALTER TABLE jobs ADD COLUMN startedAt TEXT;")
  }
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

export function claimQueuedJobs({
  limit,
  dbPath,
  workerId,
  staleAfterMs = 15 * 60_000,
}: {
  limit: number
  dbPath: string
  workerId: string
  staleAfterMs?: number
}) {
  ensureJobsDatabase(dbPath)
  const claimedAt = new Date().toISOString()
  const staleCutoff = new Date(Date.now() - staleAfterMs).toISOString()
  executeSql(
    dbPath,
    `
    BEGIN IMMEDIATE;
    UPDATE jobs
    SET status = 'queued',
        workerId = NULL,
        startedAt = NULL,
        updatedAt = ${sqlQuote(claimedAt)}
    WHERE status = 'running'
      AND updatedAt < ${sqlQuote(staleCutoff)};

    WITH picked AS (
      SELECT id
      FROM jobs
      WHERE status = 'queued'
      ORDER BY createdAt ASC
      LIMIT ${Math.max(1, limit)}
    )
    UPDATE jobs
    SET status = 'running',
        workerId = ${sqlQuote(workerId)},
        startedAt = ${sqlQuote(claimedAt)},
        updatedAt = ${sqlQuote(claimedAt)}
    WHERE id IN (SELECT id FROM picked);
    COMMIT;
    `,
  )
  const rows = queryJson<JobRow>(
    dbPath,
    `
    SELECT id, status, batch, input, output, error, createdAt, updatedAt
    FROM jobs
    WHERE status = 'running'
      AND workerId = ${sqlQuote(workerId)}
      AND startedAt = ${sqlQuote(claimedAt)}
    ORDER BY createdAt ASC;
    `,
  )

  return rows.map(parseJobRow)
}

export function markJobDone({
  dbPath,
  jobId,
  workerId,
  output,
}: {
  dbPath: string
  jobId: string
  workerId: string
  output: JobOutput
}) {
  ensureJobsDatabase(dbPath)
  const rows = queryJson<Array<{ changes: number }>[number]>(
    dbPath,
    `
    UPDATE jobs
    SET status = 'done',
        output = ${sqlQuote(JSON.stringify(jobOutputSchema.parse(output)))},
        error = NULL,
        workerId = NULL,
        startedAt = NULL,
        updatedAt = ${sqlQuote(new Date().toISOString())}
    WHERE id = ${sqlQuote(jobId)}
      AND status = 'running'
      AND workerId = ${sqlQuote(workerId)};
    SELECT changes() AS changes;
    `,
  )

  return (rows[0]?.changes ?? 0) > 0
}

export function markJobFailed({
  dbPath,
  jobId,
  workerId,
  error,
}: {
  dbPath: string
  jobId: string
  workerId: string
  error: string
}) {
  ensureJobsDatabase(dbPath)
  const rows = queryJson<Array<{ changes: number }>[number]>(
    dbPath,
    `
    UPDATE jobs
    SET status = 'failed',
        error = ${sqlQuote(error)},
        output = NULL,
        workerId = NULL,
        startedAt = NULL,
        updatedAt = ${sqlQuote(new Date().toISOString())}
    WHERE id = ${sqlQuote(jobId)}
      AND status = 'running'
      AND workerId = ${sqlQuote(workerId)};
    SELECT changes() AS changes;
    `,
  )

  return (rows[0]?.changes ?? 0) > 0
}

export function touchClaimedJobs({
  dbPath,
  jobIds,
  workerId,
}: {
  dbPath: string
  jobIds: string[]
  workerId: string
}) {
  if (jobIds.length === 0) return

  ensureJobsDatabase(dbPath)
  const quotedIds = jobIds.map((jobId) => sqlQuote(jobId)).join(", ")
  executeSql(
    dbPath,
    `
    UPDATE jobs
    SET updatedAt = ${sqlQuote(new Date().toISOString())}
    WHERE status = 'running'
      AND workerId = ${sqlQuote(workerId)}
      AND id IN (${quotedIds});
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
