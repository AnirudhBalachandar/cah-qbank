# AGENTS.md (Project Rules)

## Mandatory First Read
- Before making non-trivial changes, align with:
  - `AGENTS.md`
  - `README.md`
  - `docs/style_spec.md`
  - `app/src/lib/server/generation/validator.ts`
  - `app/src/lib/server/generation/similarity.ts`
  - `app/src/lib/server/generation/prompt-builder.ts`
  - `app/src/lib/server/generation/service.ts`
  - relevant files in `scripts/generation/`
- When working on notes-first workflows, also read the relevant docs in `docs/chatgpt-pro/`.

## Domain constraints
- MCQ-only everywhere.
- Allowed question types: `SBA`, `EMQ_STEM`.
- Never introduce short-answer, flashcards, tutor-chat modes, or free-text assessment modes.

## Content and grounding
- Do not invent imported question content.
- Ingestion must reflect source files faithfully and remain idempotent.
- Generated questions must be original and pass similarity checks.
- `strict_internal` mode must not use external citations.
- In `strict_internal`, use internal corpus material only for examinable claims.
- If internal material is insufficient, narrow or skip the topic rather than invent detail.

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
- Manual/chat-style generation payloads must match the repo schema exactly:
  - top-level `questions`
  - exactly 5 options `A-E`
  - one best answer
  - `why_others_wrong` covering the 4 incorrect options
  - `key_takeaways` length `3-8`
  - at least 1 citation
- For manual JSON batches, keep the first tag exactly one of:
  - `General Paediatrics`
  - `Paediatric Sub-specialties`
  - `Paediatric Surgery`
  - `Emergency Paediatrics`
  - `Adolescent Medicine`
  - `Community-based Paediatrics`

## Acceptance gates
- App generation/validation paths allow difficulty:
  - `Basic`
  - `Intermediate`
  - `Hard`
- The sourced DOC/PDF script path is stricter and expects:
  - `Intermediate`
  - `Hard`
- Do not emit `Basic` for the sourced DOC/PDF path unless intentionally changing that code path.

## Originality guardrails
- Do not reproduce imported stems/options verbatim.
- Do not lightly paraphrase remembered question-bank wording.
- Do not preserve a distinctive clue bundle plus the same lead-in.
- Prefer changing task type, framing, age, context, and lead-in.
- If a concept is too thin to support a genuinely new item, skip it.
- Operational similarity targets:
  - trigram overlap `< 0.35`
  - cosine similarity `< 0.92` against the published corpus
  - in-run near-duplicate `< 0.35`
- When reusing a topic area, prefer a clearly different note-derived reasoning task:
  - next best step
  - best discriminator in the history
  - best interpretation of a finding
  - parent counselling point
  - prevention strategy
  - complication/consequence
  - follow-up/referral decision
  - safety-netting advice

## Workflow rules
- Use the workflow manifest and persisted batch state as the operational source of truth.
- Prefer the Codex-native orchestrator over manual paste-based batch loops whenever it can do the job.
- Preserve resumability, deterministic artifact paths, and auditable reports.
- `strict_internal` workflow mode must not silently inject external facts or external citations into final questions.
- Notes-first source priority:
  - Louisa notes first
  - CAH Bible second
  - question zip only for concept hints, exam flavour, and overlap-risk awareness
- Do not use past-question files as the main writing template.

## Multi-agent rules
- Keep drafting, overlap/originality audit, schema/style audit, and Australian verification as separate worker lanes.
- Parallelize safe read-only audits and verification work.
- Do not run multiple independent writers against the same high-overlap batch unless explicitly requested.
- Use as many safe parallel background agents as possible.
- The main instance is the orchestrator, reviewer, and final integrator.
- Default split for non-trivial tasks:
  - repo rules / invariants
  - affected code-path discovery
  - generation/schema/similarity analysis
  - safest patch path
  - tests / regressions / edge cases
  - alternative approach / failure-mode review
- Review all agent outputs critically before integrating.

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
- When generation logic, schema, similarity, or prompt construction changes, also run:
  - `pnpm generation:test`
  - relevant Vitest coverage for generation / similarity
- Run `pnpm test:e2e` when environment/dependencies are available.
