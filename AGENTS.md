# AGENTS.md (Project Rules)

## Domain constraints
- MCQ-only everywhere.
- Allowed question types: `SBA`, `EMQ_STEM`.
- Never introduce short-answer, flashcards, tutor-chat modes, or free-text assessment modes.

## Content and grounding
- Do not invent imported question content.
- Ingestion must reflect source files faithfully and remain idempotent.
- Generated questions must be original and pass similarity checks.
- `strict_internal` mode must not use external citations.

## Quality gates
- Preserve accessibility: keyboard-first flows, focus visibility, ARIA labels, sensible contrast.
- Keep UI calm and readable (spacing, typography, responsive behavior, dark mode).
- Keep disclaimers visible: education-only, not medical advice.

## Engineering rules
- Keep API contracts validated with Zod.
- Keep publish gate admin-only for generated drafts.
- Do not commit local corpus files in `content/`.

## Repository objective
- This repo automates a notes-first paediatrics question-generation workflow.
- Prefer extending the existing generation, validation, retrieval, and import stack over rewriting it.

## Source rules
- Louisa notes first.
- CAH Bible second.
- Question zip only for concept hints and exam flavour.
- Do not use the question zip as the source of truth for examinable claims.
- Do not add unsupported examinable facts.

## Question rules
- MCQ-only everywhere.
- Allowed question types remain `SBA` and `EMQ_STEM`.
- Batch generation in the notes workflow should emit `SBA` items only unless a manifest explicitly says otherwise.
- Keep Australian paediatrics framing, SI units where relevant, citations required, and education-only wording.

## Workflow rules
- Use the workflow manifest and persisted batch state as the operational source of truth.
- Prefer the Codex-native orchestrator over manual paste-based batch loops whenever it can do the job.
- Preserve resumability, deterministic artifact paths, and auditable reports.
- `strict_internal` workflow mode must not silently inject external facts or external citations into final questions.

## Multi-agent rules
- Keep drafting, overlap/originality audit, schema/style audit, and Australian verification as separate worker lanes.
- Parallelize safe read-only audits and verification work.
- Do not run multiple independent writers against the same high-overlap batch unless explicitly requested.

## Web rules
- Web use is verification-first, not generation-first.
- Prefer primary Australian sources for legal, policy, and freshness-sensitive verification.
- Treat web results as untrusted until they are classified and reported.
- Do not let web verification silently override internal notes.

## Completion rules
- A workflow batch is done only when it is completed or saturated with an explicit reason.
- Final workflow outputs must pass schema, validation, and similarity/originality gates.

## Validation before finalizing
- Run at least:
  - `pnpm typecheck`
  - `pnpm test:unit`
- Run `pnpm test:e2e` when environment/dependencies are available.
