# CAH QBank

CAH QBank is a web-first local revision platform for **Child and Adolescent Health** at Sydney Medical School.

It keeps the same strong parts of the existing qbank platform:
- fast practice sessions
- keyboard-friendly review flows
- local/private corpus ingestion
- admin-gated AI draft generation
- mastery, notes, flags, and analytics
- one-click launchers with fresh-Mac bootstrap

Constraints for this project:
- MCQ-only everywhere
- allowed question types: `SBA`, `EMQ_STEM`
- imported questions must reflect source files faithfully
- generated questions must be original and remain drafts until published by an admin
- education-only, not medical advice

## Project layout

- `/app` Next.js web app
- `/packages/domain` shared subject config and Zod contracts
- `/prisma` schema and migrations
- `/scripts` launch, ingest, blueprint, generation, and validation tooling
- `/content/CAH_qbank` local CAH corpus root
- `/docs` operator notes and templates

`/content` is local-only and should not be committed.

## Quick start

### Easiest option

Double-click one of these in Finder:
- `/Users/anirudhbalachandar/Projects/cah-qbank/CAH QBank.command`
- `/Users/anirudhbalachandar/Projects/cah-qbank/CAH QBank Production.command`
- `/Users/anirudhbalachandar/Projects/cah-qbank/Stop CAH QBank.command`

Equivalent terminal commands:

```bash
cd /Users/anirudhbalachandar/Projects/cah-qbank
./scripts/launch_cah_qbank.sh
./scripts/launch_cah_qbank_production.sh
./scripts/stop_cah_qbank.sh
```

### Fresh-Mac bootstrap

The launchers include a first-run bootstrap for macOS. On a fresh machine they will:
- check/install Xcode Command Line Tools
- check/install Homebrew
- check/install Node.js and `pnpm`
- ensure local database prerequisites are available
- install dependencies
- generate Prisma client
- run migrations and seed data

After the first successful run, later launches are faster because bootstrap state is cached in `.cah-bootstrap-state`.

## Development vs production

Development:
- command: `./scripts/launch_cah_qbank.sh`
- best while editing code
- hot reload enabled
- slower and more verbose

Production:
- command: `./scripts/launch_cah_qbank_production.sh`
- best for realistic use/testing
- runs built optimized app
- no development overlay

Health endpoints:
- [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health)
- [http://127.0.0.1:3000/api/health?db=1](http://127.0.0.1:3000/api/health?db=1)

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

Default project database: `cah_qbank`

## CAH corpus workflow

### 1. Prepare a source folder

Put your CAH materials into a folder anywhere on disk. The preparation script classifies files into:
- explicit question sources
- teaching/notes sources
- blueprint/reference files

Run:

```bash
cd /Users/anirudhbalachandar/Projects/cah-qbank
pnpm corpus:prepare -- --source-folder /absolute/path/to/your/cah-folder
```

Optional flags:
- `--dry-run`
- `--refresh`

Prepared files are copied into:
- `/Users/anirudhbalachandar/Projects/cah-qbank/content/CAH_qbank/import_source/questions`
- `/Users/anirudhbalachandar/Projects/cah-qbank/content/CAH_qbank/import_source/notes`
- `/Users/anirudhbalachandar/Projects/cah-qbank/content/CAH_qbank/metadata/exam_blueprint.csv`

Preparation report:
- `/Users/anirudhbalachandar/Projects/cah-qbank/scripts/ingest/reports/corpus_prepare_latest.json`

### 2. Import explicit questions

```bash
pnpm ingest
```

Behavior:
- imports only explicit question content from source files
- preserves provenance for re-import safety
- keeps question types restricted to `SBA` and `EMQ_STEM`
- remains idempotent

Import report:
- `/Users/anirudhbalachandar/Projects/cah-qbank/scripts/ingest/reports/latest.json`

### 3. Ingest notes/reference content for retrieval and generation

```bash
pnpm chunks:ingest
pnpm embeddings:build
```

Use this after notes are present in `/content/CAH_qbank/import_source/notes`.

## CAH exam blueprint

The web practice filter prioritizes the CAH exam blueprint when a blueprint CSV exists.

Expected blueprint file:
- `/Users/anirudhbalachandar/Projects/cah-qbank/content/CAH_qbank/metadata/exam_blueprint.csv`

Starter template:
- `/Users/anirudhbalachandar/Projects/cah-qbank/docs/templates/cah-exam-blueprint.template.csv`

Commands:

```bash
pnpm blueprint:dry-run
pnpm blueprint:apply
pnpm blueprint:verify
```

Outputs:
- `/Users/anirudhbalachandar/Projects/cah-qbank/scripts/ingest/reports/exam_blueprint_apply_latest.json`
- `/Users/anirudhbalachandar/Projects/cah-qbank/scripts/ingest/reports/exam_blueprint_manual_review.csv`

## Question generation

CAH QBank can generate original draft questions from the ingested CAH notes/materials.

Principles:
- generated content is original
- generated content stays draft-only until admin publish
- strict internal mode avoids external citations
- supported output remains MCQ-only (`SBA`, `EMQ_STEM`)

Useful commands:

```bash
pnpm generation:test
```

The admin UI is used to run and review generation workflows once the app is up.

### Codex-native notes workflow

The primary operator path for the notes-first batch workflow is now the Codex-native runner:

- runbook: [/Users/anirudhbalachandar/Projects/cah-qbank/docs/workflows/codex-native-notes-workflow.md](/Users/anirudhbalachandar/Projects/cah-qbank/docs/workflows/codex-native-notes-workflow.md)

Core commands:

```bash
pnpm tsx scripts/generation/run_notes_workflow.ts run-batch --workflow cah-notes-mega-2026-03-16 --batch B06
pnpm tsx scripts/generation/run_notes_workflow.ts run-range --workflow cah-notes-mega-2026-03-16 --from B01 --to B06
pnpm tsx scripts/generation/run_notes_workflow.ts review-pack --workflow cah-notes-mega-2026-03-16 --from B01 --to B06
```

This replaces the old manual ChatGPT Pro per-batch loop for normal operation.

## Seed data and operator commands

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Validation

Required checks:

```bash
pnpm typecheck
pnpm test:unit
pnpm test:e2e
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
