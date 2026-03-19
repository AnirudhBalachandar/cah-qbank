# CAH QBank

CAH QBank is a web-first local revision platform for Sydney Medical School Child and Adolescent Health.

It combines:

- a Next.js qbank web app
- explicit source-question ingestion
- notes-first AI draft generation
- hierarchical curriculum tagging
- admin-gated publication of generated content
- local launchers for development and production use

Non-negotiable project constraints:

- MCQ-only everywhere
- allowed question types: `SBA`, `EMQ_STEM`
- imported questions must reflect source files faithfully
- generated questions must remain original and draft-only until published by an admin
- education-only, not medical advice

## Read Me Based On Your Role

- AI contributors and coding agents: [docs/README_AI_AGENTS.md](/Users/anirudhbalachandar/Projects/cah-qbank/docs/README_AI_AGENTS.md)
- Medical students using the app: [docs/README_STUDENTS.md](/Users/anirudhbalachandar/Projects/cah-qbank/docs/README_STUDENTS.md)

## Current Snapshot

As of `2026-03-20`, the backed-up qbank contains:

| Metric | Count |
|---|---:|
| Total questions | `2083` |
| Published | `1107` |
| Draft | `976` |
| NotebookLM-tagged | `1153` |

Curriculum-tag coverage:

| Curriculum area | Tagged questions |
|---|---:|
| General Paediatrics | `176` |
| Paediatric Sub-specialties | `820` |
| Paediatric Surgery | `313` |
| Emergency Paediatrics | `174` |
| Adolescent Medicine | `146` |
| Community-based Paediatrics | `197` |

The GitHub-safe qbank snapshot for this state lives in:

- [backups/qbank-state/2026-03-20](/Users/anirudhbalachandar/Projects/cah-qbank/backups/qbank-state/2026-03-20)

## What This Repository Backs Up

This repository now backs up:

- the full app code
- Prisma schema and migrations
- ingest and generation tooling
- NotebookLM import and curriculum-tagging scripts
- GitHub-safe question/tag snapshot exports
- operator documentation and workflow manifests

This repository intentionally does not commit:

- local source corpus files in [content](/Users/anirudhbalachandar/Projects/cah-qbank/content)
- `.env` files or secrets
- runtime workflow state and orchestration logs
- generated build output and local dependency folders

## Project Layout

- [app](/Users/anirudhbalachandar/Projects/cah-qbank/app): Next.js app and server logic
- [prisma](/Users/anirudhbalachandar/Projects/cah-qbank/prisma): schema and migrations
- [scripts](/Users/anirudhbalachandar/Projects/cah-qbank/scripts): launch, ingest, audit, generation, and validation tooling
- [content/CAH_qbank](/Users/anirudhbalachandar/Projects/cah-qbank/content/CAH_qbank): local corpus root, intentionally local-only
- [docs](/Users/anirudhbalachandar/Projects/cah-qbank/docs): workflow and operator docs
- [workflow](/Users/anirudhbalachandar/Projects/cah-qbank/workflow): manifests and local workflow state
- [backups/qbank-state](/Users/anirudhbalachandar/Projects/cah-qbank/backups/qbank-state): versioned qbank backup exports

## Quick Start

### Easiest option

Double-click one of these:

- [CAH QBank.command](/Users/anirudhbalachandar/Projects/cah-qbank/CAH%20QBank.command)
- [CAH QBank Production.command](/Users/anirudhbalachandar/Projects/cah-qbank/CAH%20QBank%20Production.command)
- [Stop CAH QBank.command](/Users/anirudhbalachandar/Projects/cah-qbank/Stop%20CAH%20QBank.command)

Equivalent terminal commands:

```bash
cd /Users/anirudhbalachandar/Projects/cah-qbank
./scripts/launch_cah_qbank.sh
./scripts/launch_cah_qbank_production.sh
./scripts/stop_cah_qbank.sh
```

### Fresh-Mac bootstrap

The launchers handle first-run bootstrap on macOS by installing or checking:

- Xcode Command Line Tools
- Homebrew
- Node.js and `pnpm`
- database prerequisites
- dependencies
- Prisma client generation
- migrations and seed data

## Environment

Copy `.env.example` to `.env` if needed.

Important variables:

- `DATABASE_URL`
- `AUTH_SECRET`
- `DEV_USER_EMAIL`
- `DEV_USER_PASSWORD`
- `SINGLE_USER_MODE=1`
- `CONTENT_ROOT=./content/CAH_qbank`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## Ingestion And Generation Workflow

Prepare a source folder:

```bash
pnpm corpus:prepare -- --source-folder /absolute/path/to/your/cah-folder
```

Import explicit questions:

```bash
pnpm ingest
```

Build notes retrieval:

```bash
pnpm chunks:ingest
pnpm embeddings:build
```

Run the Codex-native notes workflow:

```bash
pnpm tsx scripts/generation/run_notes_workflow.ts run-batch --workflow cah-notes-mega-2026-03-16 --batch B06
pnpm tsx scripts/generation/run_notes_workflow.ts run-range --workflow cah-notes-mega-2026-03-16 --from B01 --to B06
pnpm tsx scripts/generation/run_notes_workflow.ts review-pack --workflow cah-notes-mega-2026-03-16 --from B01 --to B06
```

Rebuild the GitHub-safe qbank snapshot:

```bash
pnpm tsx scripts/audit/export_qbank_snapshot.ts
```

## Validation

Minimum checks:

```bash
pnpm typecheck
pnpm test:unit
```

When generation logic or validation changes, also run:

```bash
pnpm generation:test
pnpm test:e2e
```
```

Run `pnpm test:e2e` when the environment is available. The Playwright setup uses the CAH bootstrap/test harness automatically.

## Current v1 scope

Included:
- web app only
- local single-user workflow
- explicit-question import
- note-driven generation drafts
- blueprint tagging and exam-first filters
- notes, flags, mastery, analytics, issue reporting

Not included yet:
- iOS app
- short-answer questions
- flashcards
- tutor chat
- free-text assessment

## Safety and content rules

- Imported question content should never be invented.
- Ambiguous mappings should be reported, not silently attached.
- Disclaimers should remain visible in the UI.
- This project is for education and exam revision only, not medical advice.
