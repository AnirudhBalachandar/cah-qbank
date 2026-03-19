# CAH Batch Orchestrator

Use this skill when running the notes-first paediatrics workflow from the repo instead of manually pasting prompts into ChatGPT Pro.

Core rules:

- Treat the workflow manifest in `workflow/manifests/` as the operational source of truth.
- Treat the docs workflow pack in `docs/chatgpt-pro/` as read-only source material.
- Keep source priority strict: Louisa notes first, CAH Bible second, question zip third for concept hints only.
- Keep final batch content notes-first and schema-valid.
- Run drafting, overlap audit, schema/style audit, and Australian verification as separate worker lanes when possible.
- In `strict_internal`, do not inject externally sourced examinable facts into final question content.
- Preserve artifact trails in `workflow/artifacts/` and resumable state in `workflow/state/`.

Primary commands:

- `pnpm tsx scripts/generation/run_notes_workflow.ts run-batch --workflow <id> --batch <BXX>`
- `pnpm tsx scripts/generation/run_notes_workflow.ts run-range --workflow <id> --from <BXX> --to <BYY>`
- `pnpm tsx scripts/generation/run_notes_workflow.ts resume --workflow <id> --batch <BXX>`
- `pnpm tsx scripts/generation/run_notes_workflow.ts review-pack --workflow <id> --from <BXX> --to <BYY>`

Validation:

- Run `pnpm typecheck`
- Run `pnpm test:unit`
- Run `pnpm test:e2e` when the environment is available
