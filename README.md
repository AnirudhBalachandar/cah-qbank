# cah-qbank-v2

`cah-qbank-v2` is the JSON-first local workspace for the CAH qbank migration. The v2 repo is designed to run beside the legacy repo during verification. Do not rename, delete, or overwrite the legacy repo until there is an explicit cutover decision.

## V2 workflow

1. Published questions live in `questions/*.json`.
2. Local draft questions live in `drafts/*.json`.
3. `pnpm sync-db` rebuilds the local SQLite database from those JSON files.
4. The `cah` CLI starts and stops the app, and can back up the local SQLite database.
5. Legacy snapshot import is a separate migration step. See `docs/MIGRATION.md`.

## Source of truth

- `questions/` is the v2 source of truth for published content.
- `drafts/` is local working state for unpublished draft content.
- `cah.db` is local runtime state, not source of truth.
- The question/tag projection inside SQLite is rebuilt from JSON whenever `pnpm sync-db` runs.
- Practice sessions, attempts, flags, notes, and mastery live only in SQLite and are not recreated from JSON.
- Any future import or generation workflow must write schema-valid JSON first, then refresh SQLite.

## Repository layout

- `questions/`: published question JSON files tracked as the durable v2 content layer.
- `drafts/`: local draft JSON files. This directory is gitignored and should be treated as local-only working state.
- `cah.db`: local SQLite database at the repo root. This file is gitignored. Question/tag rows can be rebuilt from JSON, but local study state inside SQLite cannot.
- `app/`: Next.js app and Prisma schema.
- `tools/cli/`: the `cah` CLI implementation.
- `tools/generate/`: generation workspace, queue DB, and `generate` CLI.
- `~/.cah/`: local CLI runtime state such as logs, PID tracking, and SQLite backups.

## Commands

```bash
pnpm install
pnpm validate:questions
pnpm sync-db
pnpm dev
pnpm cah serve
pnpm cah stop
pnpm cah db backup
pnpm generate help
```

Before `pnpm dev` on a fresh checkout:

- copy `app/.env.example` to `app/.env` if needed
- run `pnpm sync-db`

`pnpm dev` does not bootstrap or sync SQLite for you. `cah serve` does.

## What `pnpm sync-db` does

`pnpm sync-db` is the bridge between JSON content and local app state.

- Runs Prisma code generation.
- Ensures the SQLite file exists.
- Reads all JSON files from `questions/` and `drafts/`.
- Upserts tags, questions, and question-tag links into SQLite.
- Deletes DB rows that no longer exist in the JSON layer.

Use `pnpm sync-db` after:

- importing legacy data into JSON
- editing question JSON by hand
- adding or removing drafts
- any workflow that changes the JSON corpus

Be careful with `cah.db` lifecycle:

- rerunning `pnpm sync-db` refreshes question/tag projection tables
- deleting `cah.db` will also delete local notes, flags, mastery, and session history
- use `pnpm cah db backup` before wiping or recreating SQLite if you want to preserve local study state

## `cah` CLI

The repo-level `cah` command is wired to `tools/cli/dist/index.js`.

### `pnpm cah serve`

- runs `pnpm sync-db`
- builds the Next.js app
- starts the app on `http://localhost:3000`
- stores PID state in `~/.cah/pid`
- writes logs to `~/.cah/logs/`
- opens the browser if possible

If the app is already running, `cah serve` reuses the existing process and reopens the URL instead of starting another copy.

### `pnpm cah stop`

- stops the background `cah serve` process if one is running
- removes the stored PID record

### `pnpm cah db backup`

- reads `DATABASE_URL` from `app/.env`
- resolves the SQLite file path
- copies the current DB file into `~/.cah/backups/<timestamp>.db`

This command backs up the derived SQLite file. It does not replace the JSON source of truth.

## Generate workflow

The v2 contract is JSON-first even for generated content.

- Generated output should land as schema-valid JSON files, normally in `drafts/` first.
- Generation should not write directly into SQLite.
- After generation or promotion, run `pnpm validate:questions` and `pnpm sync-db`.

The repo does expose a generation command:

```bash
pnpm generate help
pnpm generate enqueue --source /absolute/path/to/source.pdf --count 10 --tags "general-paediatrics/respiratory,bronchiolitis"
pnpm generate worker
pnpm generate promote --id <draft-question-id> [--reviewed-by <name>]
```

Generation prerequisites:

- `OPENAI_API_KEY` must be valid
- optional overrides: `OPENAI_MODEL`, `GENERATE_CONCURRENCY`
- `sqlite3` must be available for the jobs queue at `tools/generate/jobs.db`
- `textutil` is used for `.doc`, `.docx`, and `.rtf`
- `pdftotext` is used for `.pdf`

Current generation rules:

- worker output lands in `drafts/` as `createdBy: "ai"` and `status: "draft"`
- reviewed AI drafts can be promoted with `pnpm generate promote --id <draft-question-id>`
- `generate promote` defaults `reviewedBy` from `--reviewed-by`, `CAH_REVIEWED_BY`, or the local OS username
- promoted AI records keep `createdBy: "ai"` and add `source.review` metadata
- the current sourced-file path is SBA-only
- sourced generation expects `Intermediate` or `Hard` difficulty
- internal citations only are allowed in the generated payload
- generated citations must point to the source filename and include either a page or a section-title locator

## Local-only state

The following are intentionally local-only artifacts in v2:

- `drafts/`
- `cah.db`
- `~/.cah/logs/`
- `~/.cah/backups/`
- `~/.cah/pid`

Operational guidance:

- Do not treat `drafts/` as the published source of truth.
- Do not hand-edit `cah.db`.
- It is safe to rebuild the question/tag portion of `cah.db` by rerunning `pnpm sync-db`.
- It is not safe to assume `pnpm sync-db` restores local study state after `cah.db` is deleted.
- Back up SQLite with `pnpm cah db backup` before risky local experiments if needed.

## Safe cutover rule

Until there is an explicit rename/cutover decision:

- keep the legacy repo intact
- keep the v2 repo named `cah-qbank-v2`
- do not repoint existing automation or scripts from the legacy repo by surprise
- do not delete the legacy backups used to bootstrap v2

The migration and cutover checklist lives in `docs/MIGRATION.md`.
