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

## Validation before finalizing
- Run at least:
  - `pnpm typecheck`
  - `pnpm test:unit`
- Run `pnpm test:e2e` when environment/dependencies are available.
