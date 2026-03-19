# CAH QBank For AI Coding Agents

This repository is a local-first Sydney Medical School Child and Adolescent Health qbank with a web app, ingestion pipeline, notes-first generation workflow, and admin-gated draft publication flow.

## Start Here

Before making non-trivial changes, read:

- [AGENTS.md](/Users/anirudhbalachandar/Projects/cah-qbank/AGENTS.md)
- [README.md](/Users/anirudhbalachandar/Projects/cah-qbank/README.md)
- [docs/style_spec.md](/Users/anirudhbalachandar/Projects/cah-qbank/docs/style_spec.md)
- [app/src/lib/server/generation/validator.ts](/Users/anirudhbalachandar/Projects/cah-qbank/app/src/lib/server/generation/validator.ts)
- [app/src/lib/server/generation/similarity.ts](/Users/anirudhbalachandar/Projects/cah-qbank/app/src/lib/server/generation/similarity.ts)
- [app/src/lib/server/generation/prompt-builder.ts](/Users/anirudhbalachandar/Projects/cah-qbank/app/src/lib/server/generation/prompt-builder.ts)
- [app/src/lib/server/generation/service.ts](/Users/anirudhbalachandar/Projects/cah-qbank/app/src/lib/server/generation/service.ts)
- relevant files in [scripts/generation](/Users/anirudhbalachandar/Projects/cah-qbank/scripts/generation)

For notes-first workflow changes, also read:

- [docs/workflows/codex-native-notes-workflow.md](/Users/anirudhbalachandar/Projects/cah-qbank/docs/workflows/codex-native-notes-workflow.md)

## Non-Negotiable Constraints

- MCQ-only everywhere.
- Allowed question types: `SBA`, `EMQ_STEM`.
- Imported content must remain source-faithful and idempotent.
- Generated content must remain original and pass similarity checks.
- Generated questions stay draft-only until an admin explicitly publishes them.
- `strict_internal` must not silently introduce unsupported external facts or citations.
- Do not commit the local corpus in [content](/Users/anirudhbalachandar/Projects/cah-qbank/content).
- Keep accessibility and education-only disclaimers intact.

## Repo Layout

- [app](/Users/anirudhbalachandar/Projects/cah-qbank/app): Next.js app, API routes, practice flows, analytics, and generation review UI.
- [prisma](/Users/anirudhbalachandar/Projects/cah-qbank/prisma): schema and migrations.
- [scripts/ingest](/Users/anirudhbalachandar/Projects/cah-qbank/scripts/ingest): explicit question import, corpus preparation, notes chunk ingest, blueprint application.
- [scripts/generation](/Users/anirudhbalachandar/Projects/cah-qbank/scripts/generation): notes-first generation runner, multi-worktree conductor, review-pack and audit tooling.
- [workflow/manifests](/Users/anirudhbalachandar/Projects/cah-qbank/workflow/manifests): workflow source of truth for batches.
- [docs](/Users/anirudhbalachandar/Projects/cah-qbank/docs): operator docs and workflow guides.
- [backups/qbank-state](/Users/anirudhbalachandar/Projects/cah-qbank/backups/qbank-state): GitHub-safe qbank question/tag snapshots.

## Data Model At A Glance

- Questions are stored in Prisma `Question`.
- Tags live in Prisma `Tag`.
- Question/tag links live in Prisma `QuestionTag`.
- Tags are hierarchical via `parentId`.
- Generated content is tracked separately through `GeneratedQuestionRun` and `GeneratedQuestionItem`.

The current GitHub backup snapshot exports the core qbank domain:

- questions
- tags
- question-tag links
- summary/manifest metadata

It intentionally does not version:

- local corpus source documents
- live workflow state and runtime artifacts
- secrets or environment files

## Setup

```bash
cd /Users/anirudhbalachandar/Projects/cah-qbank
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Use `.env.example` as the starting point for local configuration.

Important environment variables:

- `DATABASE_URL`
- `AUTH_SECRET`
- `OPENAI_API_KEY`
- `CONTENT_ROOT=./content/CAH_qbank`
- `SINGLE_USER_MODE=1`

## App And Ingestion Workflow

1. Prepare corpus files:

```bash
pnpm corpus:prepare -- --source-folder /absolute/path/to/your/cah-folder
```

2. Import explicit source questions:

```bash
pnpm ingest
```

3. Ingest notes/reference content and build embeddings:

```bash
pnpm chunks:ingest
pnpm embeddings:build
```

4. Run the app:

```bash
./scripts/launch_cah_qbank.sh
```

## Notes-First Generation Workflow

Single-lane batch runner:

```bash
pnpm tsx scripts/generation/run_notes_workflow.ts run-batch --workflow cah-notes-mega-2026-03-16 --batch B06
pnpm tsx scripts/generation/run_notes_workflow.ts run-range --workflow cah-notes-mega-2026-03-16 --from B01 --to B06
pnpm tsx scripts/generation/run_notes_workflow.ts resume --workflow cah-notes-mega-2026-03-16 --batch B06
pnpm tsx scripts/generation/run_notes_workflow.ts review-pack --workflow cah-notes-mega-2026-03-16 --from B01 --to B06
```

Multi-worktree conductor:

```bash
pnpm tsx scripts/generation/run_multi_worktree_conductor.ts resume --workflow cah-notes-mega-2026-03-16 --max-preview-lanes 3 --requeue-limit 2
```

## Current QBank Snapshot

As of `2026-03-20`, the backed-up qbank contains:

- `2083` total questions
- `1107` published
- `976` draft
- `1153` tagged `notebookLM`

Curriculum-tag totals:

- `176` General Paediatrics
- `820` Paediatric Sub-specialties
- `313` Paediatric Surgery
- `174` Emergency Paediatrics
- `146` Adolescent Medicine
- `197` Community-based Paediatrics

Refresh the GitHub-safe snapshot with:

```bash
pnpm tsx scripts/audit/export_qbank_snapshot.ts
```

## Validation

Run at least:

```bash
pnpm typecheck
pnpm test:unit
```

When generation logic, schema, similarity, or prompt construction changes, also run:

```bash
pnpm generation:test
pnpm test:e2e
```

if the environment supports it.
