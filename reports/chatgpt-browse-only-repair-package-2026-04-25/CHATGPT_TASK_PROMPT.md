# Task: Repair Remaining CAH QBank Browse-Only Published Questions

You are repairing a set of published CAH QBank paediatric SBA questions that are currently browse-only because they are incomplete. Use the files in this package.

## Goal

Repair every item in `remaining_browse_only_questions.json` so each one becomes a complete, answerable, practice-ready single-best-answer question.

Return a completed JSON file named `repaired_browse_only_questions.json` using the same top-level structure as `remaining_browse_only_questions.json`, but with `fixedQuestion` filled for every repaired item and `repairAudit` filled for every item.

Do not edit `originalQuestion`. Do not remove items.

## Source Standard

You must search online for each question.

Use Australian-first sources wherever possible:

- Royal Children's Hospital Melbourne Clinical Practice Guidelines
- Australian Immunisation Handbook
- ASCIA
- Australian state health guidance
- Australian specialty society guidance

Use reputable international sources only when Australian sources are insufficient for the clinical point.

Do not invent URLs. Every citation in `fixedQuestion.citations` must correspond to a source actually used.

## Repair Policy

For each item:

- Preserve `id`, `status`, `createdBy`, `createdAt`, `sourceFingerprint`, `moduleCode`, and original `source` metadata.
- Keep `status` as `"published"`.
- Keep `questionType` as `"SBA"`.
- Repair low-information fragments when a safe clinical interpretation is possible.
- If an item truly cannot be repaired safely, keep `fixedQuestion` as `null` and set `repairAudit.status` to `"unrepairable"` with a clear reason.
- Prefer preserving the original clinical concept and answer options when they are usable.
- If the stem or options are malformed, rewrite into a complete clinical SBA using the safest relevant interpretation.

## Required Fixed Question Shape

Each repaired `fixedQuestion` must be a complete question object with:

- `id`: unchanged from `originalQuestion.id`
- `stem`: complete learner-facing clinical question, ending in `?`
- `questionType`: `"SBA"`
- `options`: exactly five options, ordered `A`, `B`, `C`, `D`, `E`
- exactly one option with `"isCorrect": true`
- all other options with `"isCorrect": false`
- `explanation`: non-empty explanation of the correct answer
- `citations`: non-empty array of external evidence sources
- `tags`: non-empty array of lowercase slash-separated slug tags
- `curriculum`: one of the accepted curricula below, not `"Unclassified"`
- `status`: `"published"`
- `createdBy`, `createdAt`, `sourceFingerprint`: unchanged
- `rationale`: short plain-text rationale or `null`
- `optionExplanations`: non-empty explanations for `A`, `B`, `C`, `D`, and `E`
- `difficulty`: `"Basic"`, `"Intermediate"`, `"Hard"`, or `null`
- `ausScore`: integer `1` to `5`, or `null`
- `source`: preserve the original object and add/update `source.answerRecovery`

Accepted curricula:

- `"General Paediatrics"`
- `"Paediatric Sub-specialties"`
- `"Paediatric Surgery"`
- `"Emergency Paediatrics"`
- `"Adolescent Medicine"`
- `"Community-based Paediatrics"`

## Citation Shape

Use citation objects like:

```json
{
  "type": "external",
  "source": "Royal Children's Hospital Melbourne",
  "url": "https://www.rch.org.au/clinicalguide/...",
  "title": "Clinical Practice Guidelines: Example"
}
```

Use at least one citation per fixed question. Two or three citations are preferred when the answer depends on multiple clinical points.

## Required Audit Shape

Fill `repairAudit` for every item:

```json
{
  "status": "repaired",
  "method": "selected_existing_option",
  "confidence": 0.92,
  "sourcesUsed": [
    {
      "title": "Clinical Practice Guidelines: Example",
      "url": "https://...",
      "organization": "Royal Children's Hospital Melbourne",
      "sourceType": "australian_guideline",
      "supports": "Brief statement of what this source supports"
    }
  ],
  "notes": "Short note on interpretation or uncertainty"
}
```

Allowed `repairAudit.status` values:

- `"repaired"`
- `"unrepairable"`

Allowed `repairAudit.method` values:

- `"selected_existing_option"` when the original options were kept and one correct option was selected
- `"normalized_existing_question"` when the original concept/options were mostly preserved but cleaned into a five-option SBA
- `"rewritten_to_complete_sba"` when the item was too malformed and needed a full rewrite

Allowed `sourceType` values:

- `"australian_guideline"`
- `"australian_health"`
- `"australian_specialty"`
- `"international_guideline"`
- `"other_reputable"`

## Learner-Facing Style Rules

Do not include any of this in learner-facing fields:

- source pack
- provided excerpts
- provided notes
- according to the notes
- source material
- strict_internal
- this batch / the batch / batch outcome / within this batch
- draft writer
- question-bank style
- quality assurance
- publication governance
- citation governance
- web search
- repair process

Use plain text only. No markdown in stem, option text, explanation, rationale, or option explanations.

Option text must be concise and must not end with a full stop.

## Final Checklist For Every Repaired Item

Before returning the completed file, confirm:

- `fixedQuestion.id` matches `originalQuestion.id`
- `fixedQuestion.status` is `"published"`
- exactly five options ordered `A-E`
- exactly one correct option
- no option has `isCorrect: null`
- `stem` ends in `?`
- `explanation` is non-empty
- `optionExplanations` has non-empty `A-E`
- `citations` is non-empty and all citation URLs are real sources
- `tags` is non-empty
- `curriculum` is not `"Unclassified"`
- `source.answerRecovery` includes repair metadata and preserves `preRepair`
- no learner-facing source/process wording remains

## Reference Files In This Package

- `remaining_browse_only_questions.json`: combined handoff file to complete
- `remaining_manifest.csv`: compact manifest of all remaining items
- `remaining_questions/`: individual original question JSON files
- `examples/pilot_repaired_examples.json`: examples of already repaired items from the pilot run
- `current_counts.json`: verified repo counts at package creation time

