# CAH QBank Browse-Only Repair Handoff Package

This package is for repairing the `168` remaining published browse-only CAH QBank questions outside Codex.

Give ChatGPT:

1. `CHATGPT_TASK_PROMPT.md`
2. `remaining_browse_only_questions.json`
3. `examples/pilot_repaired_examples.json`

Ask it to return:

```text
repaired_browse_only_questions.json
```

The returned file should preserve every original item and fill `fixedQuestion` plus `repairAudit` for each item.

When the repaired file is brought back into this repo, it can be validated and applied to the `questions/` JSON files, then incorporated into the apps with `pnpm sync-db`.

Package created after the local pilot repair had already completed 10 of the original 178 browse-only questions. Those 10 are not included as repair targets.

