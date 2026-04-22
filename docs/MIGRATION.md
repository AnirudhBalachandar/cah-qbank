# Migration History

This document is archival. The migration and cutover are complete; use `README.md` for current operational guidance.

It records the migration path from the legacy CAH qbank into the JSON-first `cah-qbank` workflow.

The core migration rule was simple:

- preserve the legacy repo until an explicit rename/cutover was approved
- import legacy data into JSON first
- rebuild local SQLite from JSON
- treat `drafts/` and `cah.db` as local working state, not canonical migration artifacts

## What Changed During Migration

In v1, SQLite-backed app state and backup artifacts were part of the day-to-day workflow. During the migration, the target repo changed to:

- published content is stored in `questions/*.json`
- local unpublished work is stored in `drafts/*.json`
- the question/tag projection inside `cah.db` is rebuilt from those JSON files
- practice sessions, attempts, notes, flags, and mastery remain SQLite-only local state
- the app stays local-first
- the legacy repo stayed untouched until the explicit rename

## Backup Snapshot Input

The migration script expects a snapshot directory that contains:

- `questions.json`
- `tags.json`
- `question-tag-links.json`

The input path is resolved from the first valid candidate in this order:

1. `CAH_BACKUP_DIR`
2. `./backups/qbank-state/2026-04-22`

If your snapshot is somewhere else, set `CAH_BACKUP_DIR` explicitly.

## `CAH_BACKUP_DIR`

Set `CAH_BACKUP_DIR` to the folder that contains the three legacy snapshot JSON files.

Example:

```bash
export CAH_BACKUP_DIR=/absolute/path/to/qbank-state/2026-04-22
```

Important boundary:

- `CAH_BACKUP_DIR` is read by `pnpm migrate:backup`
- `CAH_BACKUP_DIR` is not used by `pnpm cah db backup`
- `pnpm cah db backup` always writes SQLite backups to `~/.cah/backups/`

## Historical Migration Steps

At the time, the migration followed this sequence:

1. Keep the legacy repo unchanged.
2. In `cah-qbank`, point `CAH_BACKUP_DIR` at the chosen snapshot if you are not using one of the built-in default locations.
3. Run the legacy import:

```bash
pnpm migrate:backup
```

4. Validate the imported JSON:

```bash
pnpm validate:questions
```

5. Rebuild local SQLite from the imported JSON:

```bash
pnpm sync-db
```

6. Start the local app and verify behavior:

```bash
pnpm cah serve
```

## What `pnpm migrate:backup` does

`pnpm migrate:backup` is a bootstrap/import command, not a routine sync.

It will:

- locate the legacy backup snapshot
- load legacy questions, tags, and question-tag links
- map legacy records into the current question schema
- validate each mapped question with Zod
- delete the current `questions/` and `drafts/` folders
- recreate those folders from the snapshot
- enforce the expected imported counts of `1107` published and `976` draft questions

Because it replaces both JSON folders, do not rerun it casually after you have started curating local drafts.

Current import normalization note:

- the current schema is effectively SBA-only
- `pnpm migrate:backup` normalizes imported legacy questions to `questionType: "SBA"`

## Local-Only Artifacts

These artifacts are intentionally local-only:

- `drafts/`
- `cah.db`

How to treat them:

- `drafts/` is local working state for unpublished material.
- `cah.db` is a mixed local runtime store for both the JSON-backed question/tag projection and SQLite-only study state.
- neither should be treated as the published source of truth
- neither should be used as the reason to retire the legacy repo

Practical rule:

- preserve published JSON in `questions/`
- keep draft JSON only as local working state unless you intentionally promote a workflow for sharing it
- use `pnpm sync-db` to rebuild question/tag rows
- use `pnpm cah db backup` if you want to preserve local notes, flags, mastery, or session history before recreating `cah.db`

## Generation Behavior During Migration

The generation boundary is:

- generation creates JSON
- validation checks JSON
- `pnpm sync-db` materializes that JSON into SQLite

After generation or promotion, rerun `pnpm validate:questions` and `pnpm sync-db`.

Do not let generation write directly into `cah.db`.

The repo-level generation command exists now:

```bash
pnpm generate help
pnpm generate doctor
pnpm generate enqueue --source /absolute/path/to/source.pdf --count 10 --tags "general-paediatrics/respiratory,bronchiolitis"
pnpm generate worker
pnpm generate promote --id <draft-question-id> [--reviewed-by <name>]
```

Operational prerequisites:

- set `GENERATE_API_PROVIDER=openai` or `GENERATE_API_PROVIDER=openrouter`
- OpenAI mode requires `OPENAI_API_KEY`
- OpenRouter mode requires `OPENROUTER_API_KEY`
- optional `GENERATE_MODEL`, `OPENAI_MODEL`, `OPENROUTER_MODEL`
- optional `GENERATE_CONCURRENCY`
- retry tuning: `GENERATE_RETRY_LIMIT`, `GENERATE_RETRY_BASE_DELAY_MS`
- OpenRouter defaults to `google/gemma-4-31b-it:free`
- `sqlite3` for `tools/generate/jobs.db`
- `textutil` for `.doc`, `.docx`, `.rtf`
- `pdftotext` for `.pdf`
- generation-related values from the repo root `.env` override stale exported shell values

Current behavior notes:

- worker output lands in `drafts/` as `createdBy: "ai"` and `status: "draft"`
- reviewed AI drafts can be promoted with `pnpm generate promote --id <draft-question-id>`
- `generate promote` defaults `reviewedBy` from `--reviewed-by`, `CAH_REVIEWED_BY`, or the local OS username
- promoted AI records keep `createdBy: "ai"` and add `source.review` metadata
- the sourced-file generation path is currently SBA-only
- generated drafts are written to `drafts/`
- queue state lives in `tools/generate/jobs.db`
- generated citations must point to the source filename and include either a page or a section-title locator

Practical reviewed-publish loop:

```bash
pnpm generate worker
# inspect drafts/<id>.json
pnpm generate promote --id <draft-question-id>
pnpm validate:questions
pnpm sync-db
```

## Archived Cutover Notes

Before the cutover, the operating guidance was:

- keep the legacy repo in place
- keep legacy backups in place
- keep the next-version repo in a separate sibling folder
- avoid changing external scripts, aliases, or automation that still point at the legacy repo
- use the next-version repo for side-by-side validation, not destructive replacement

## Historical Cutover Sequence

When the cutover was executed, it used this sequence:

1. Stop any running local CAH app processes.
2. Take a final legacy backup snapshot.
3. Confirm the new JSON corpus is the state you want to preserve.
4. Run `pnpm validate:questions`.
5. Run `pnpm sync-db`.
6. Verify `pnpm cah serve` starts cleanly.
7. Only then rename or archive the legacy repo and promote the new repo to the canonical repo name if that is the chosen cutover path.

This sequence has now been executed.
