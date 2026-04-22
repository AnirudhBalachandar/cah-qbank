# Migration to v2

This document covers the safe v2 migration path from a legacy backup snapshot into the JSON-first `cah-qbank-v2` workflow.

The core rule is simple:

- preserve the legacy repo until an explicit rename/cutover is approved
- import legacy data into JSON first
- rebuild local SQLite from JSON
- treat `drafts/` and `cah.db` as local working state, not canonical migration artifacts

## What v2 changes

In v1, SQLite-backed app state and backup artifacts were part of the day-to-day workflow. In v2:

- published content is stored in `questions/*.json`
- local unpublished work is stored in `drafts/*.json`
- the question/tag projection inside `cah.db` is rebuilt from those JSON files
- practice sessions, attempts, notes, flags, and mastery remain SQLite-only local state
- the app stays local-first
- the legacy repo stays untouched until an explicit rename

## Backup snapshot input

The migration script expects a snapshot directory that contains:

- `questions.json`
- `tags.json`
- `question-tag-links.json`

The input path is resolved from the first valid candidate in this order:

1. `CAH_BACKUP_DIR`
2. `../cah-qbank/backups/qbank-state/2026-04-22`
3. `../cah-qbank-v1-archive/backups/qbank-state/2026-04-22`
4. `./backups/qbank-state/2026-04-22`

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

## Migration steps

1. Keep the legacy repo unchanged.
2. In `cah-qbank-v2`, point `CAH_BACKUP_DIR` at the chosen snapshot if you are not using one of the built-in default locations.
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
- map legacy records into the current v2 question schema
- validate each mapped question with Zod
- delete the current v2 `questions/` and `drafts/` folders
- recreate those folders from the snapshot
- enforce the expected imported counts of `1107` published and `976` draft questions

Because it replaces both JSON folders, do not rerun it casually after you have started curating local v2 drafts.

Current import normalization note:

- the current v2 schema is effectively SBA-only
- `pnpm migrate:backup` normalizes imported legacy questions to `questionType: "SBA"`

## Local-only artifacts

These v2 artifacts are intentionally local-only:

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

## Generate workflow during migration

The generation boundary in v2 is:

- generation creates JSON
- validation checks JSON
- `pnpm sync-db` materializes that JSON into SQLite

Do not let generation write directly into `cah.db`.

The repo-level generation command exists now:

```bash
pnpm generate help
pnpm generate enqueue --source /absolute/path/to/source.pdf --count 10 --tags "general-paediatrics/respiratory,bronchiolitis"
pnpm generate worker
```

Operational prerequisites:

- valid `OPENAI_API_KEY`
- optional `OPENAI_MODEL`
- optional `GENERATE_CONCURRENCY`
- `sqlite3` for `tools/generate/jobs.db`
- `textutil` for `.doc`, `.docx`, `.rtf`
- `pdftotext` for `.pdf`

Current behavior notes:

- generated output is draft-only
- the sourced-file generation path is currently SBA-only
- generated drafts are written to `drafts/`
- queue state lives in `tools/generate/jobs.db`

## Safe cutover guidance

The migration is complete only when v2 is verified and there is an explicit decision to rename/switch over.

Until then:

- keep the legacy repo in place
- keep legacy backups in place
- keep v2 in the separate `cah-qbank-v2` folder
- avoid changing external scripts, aliases, or automation that still point at the legacy repo
- use v2 for side-by-side validation, not destructive replacement

## When an explicit cutover is approved

Use this sequence:

1. Stop any running local CAH app processes.
2. Take a final legacy backup snapshot.
3. Confirm the v2 JSON corpus is the state you want to preserve.
4. Run `pnpm validate:questions`.
5. Run `pnpm sync-db`.
6. Verify `pnpm cah serve` starts cleanly.
7. Only then rename or archive the legacy repo and promote v2 to the canonical repo name if that is the chosen cutover path.

Until step 7 is explicitly approved, the legacy repo remains the preserved fallback.
