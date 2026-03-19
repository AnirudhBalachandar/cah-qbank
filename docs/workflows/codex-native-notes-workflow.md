# Codex-Native Notes Workflow

This is the primary operator path for the notes-first CAH generation workflow.

It replaces the old manual ChatGPT Pro batch loop for normal operation.

## Purpose

Use this workflow to:
- generate original draft CAH MCQs from internal notes
- keep generation notes-first and citation-grounded
- run overlap, validation, verification, and import automatically
- continue batches until they are completed or explicitly saturated

It does not:
- generate non-MCQ content
- use external facts in `strict_internal` mode
- require manual prompt pasting during normal execution

## Inputs

Current workflow pack:
- `/Users/anirudhbalachandar/Projects/cah-qbank/docs/chatgpt-pro/cah-notes-mega-workflow-2026-03-16`

Machine-readable manifest:
- `/Users/anirudhbalachandar/Projects/cah-qbank/workflow/manifests/cah-notes-mega-2026-03-16.json`

Source priority:
1. Louisa notes
2. CAH Bible
3. question zip for flavour only

Operational rule files:
- `/Users/anirudhbalachandar/Projects/cah-qbank/docs/chatgpt-pro/cah-notes-mega-workflow-2026-03-16/SOURCE_PRIORITY.md`
- `/Users/anirudhbalachandar/Projects/cah-qbank/docs/chatgpt-pro/cah-notes-mega-workflow-2026-03-16/OUTPUT_SPEC.md`
- `/Users/anirudhbalachandar/Projects/cah-qbank/docs/chatgpt-pro/cah-notes-mega-workflow-2026-03-16/REJECTED_PATTERNS_SUMMARY.md`

## Prerequisites

- `pnpm`
- `tsx`
- `codex`
- local database configured
- notes/chunks already ingested for the CAH corpus

Recommended checks before a serious run:

```bash
cd /Users/anirudhbalachandar/Projects/cah-qbank
pnpm typecheck
pnpm test:unit
```

Run `pnpm test:e2e` when the environment is available.

## Key Directories

- state: `/Users/anirudhbalachandar/Projects/cah-qbank/workflow/state`
- prompts: `/Users/anirudhbalachandar/Projects/cah-qbank/workflow/artifacts/prompts`
- raw artifacts: `/Users/anirudhbalachandar/Projects/cah-qbank/workflow/artifacts/raw`
- reports: `/Users/anirudhbalachandar/Projects/cah-qbank/workflow/artifacts/reports`
- review packs: `/Users/anirudhbalachandar/Projects/cah-qbank/workflow/artifacts/review-packs`

## Normal Operator Flow

Run one batch:

```bash
cd /Users/anirudhbalachandar/Projects/cah-qbank
pnpm tsx scripts/generation/run_notes_workflow.ts run-batch --workflow cah-notes-mega-2026-03-16 --batch B06
```

Run a range:

```bash
pnpm tsx scripts/generation/run_notes_workflow.ts run-range --workflow cah-notes-mega-2026-03-16 --from B01 --to B06
```

Resume an interrupted batch:

```bash
pnpm tsx scripts/generation/run_notes_workflow.ts resume --workflow cah-notes-mega-2026-03-16 --batch B06
```

Build a review pack:

```bash
pnpm tsx scripts/generation/run_notes_workflow.ts review-pack --workflow cah-notes-mega-2026-03-16 --batch B06
pnpm tsx scripts/generation/run_notes_workflow.ts review-pack --workflow cah-notes-mega-2026-03-16 --from B01 --to B06
```

## What A Batch Does

Each batch run:
1. loads manifest and batch state
2. builds an internal source pack
3. builds an initial or replacement prompt
4. generates draft chunks
5. repairs invalid draft structure when needed
6. runs validation, overlap, semantic originality, and Australian verification lanes
7. imports only accepted items
8. retries replacements until complete or saturated

## What To Watch Live

Start with the batch state file:
- `/Users/anirudhbalachandar/Projects/cah-qbank/workflow/state/cah-notes-mega-2026-03-16__B06.json`

Important fields:
- `status`
- `attempts`
- `activeJob`
- `currentAttempt`
- `lastAttempt`
- `nextAction`

Then inspect:
- draft job files: `attempt-XX.draft.job.json`, `attempt-XX.draft.stdout.jsonl`, `attempt-XX.draft.stderr.log`, `attempt-XX.draft.txt`
- repair/raw files: `attempt-XX.repair.json`, `attempt-XX.generated.json`
- reports: validation, overlap, semantic-overlap, verification, merged, import
- summary: `batch-summary.md`

## Success States

- `completed`: accepted total reached the target and validators passed
- `saturated`: retries were no longer yielding useful additions and the saturation reason was recorded

## Troubleshooting

If state is `running` but the worker PID or heartbeat is stale:

```bash
pnpm tsx scripts/generation/run_notes_workflow.ts resume --workflow cah-notes-mega-2026-03-16 --batch B06
```

If the last attempt is clearly aborted or failed:

```bash
pnpm tsx scripts/generation/run_notes_workflow.ts run-batch --workflow cah-notes-mega-2026-03-16 --batch B06
```

Use `--force` only when you intentionally want to rerun a batch that is already `completed` or `saturated`.

Failure signatures:
- `command_execution` in `attempt-XX.draft.stdout.jsonl`: drafting guard fired
- no `attempt-XX.draft.txt` and dead worker PID: draft generation died before audits/import
- `stream disconnected - retrying sampling request` in stderr: likely Codex transport instability
- missing validation/overlap/import reports: run never got past draft generation

## Review Packs

Use review packs for human review after a batch or range finishes.

They summarize:
- accepted totals
- saturated batches and reasons
- overlap traps
- verification findings
- next recommended batches

Output location:
- `/Users/anirudhbalachandar/Projects/cah-qbank/workflow/artifacts/review-packs/cah-notes-mega-2026-03-16`
