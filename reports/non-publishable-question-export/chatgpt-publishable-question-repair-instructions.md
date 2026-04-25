# ChatGPT Instructions: CAH QBank Publishable Question Repair

Use this with `non-publishable-questions-for-chatgpt-2026-04-25.json`.

Work through the exported `questions` array one item at a time. For each item, do not edit `originalQuestion`. Put the corrected complete question object in `fixedQuestion`. If an item cannot reasonably be turned into a clinical question, leave `fixedQuestion` as `null` and explain why in a short note if you add one.

## Required Output Shape

Each `fixedQuestion` must keep the same JSON shape as `originalQuestion`.

Required fields:

- `id`: keep the same UUID as `originalQuestion.id`.
- `stem`: non-empty learner-facing clinical question text.
- `questionType`: must be `"SBA"`.
- `options`: exactly five answer options.
- `explanation`: non-empty explanation of the correct answer.
- `citations`: non-empty citation array if present in the original item; preserve existing citations unless clearly impossible.
- `tags`: non-empty tag array; preserve existing tags unless clearly impossible.
- `curriculum`: one of the accepted curricula listed below; must not be `"Unclassified"`.
- `status`: keep as `"draft"` for repaired handoff items.
- `createdBy`: keep the original value.
- `createdAt`: keep the original value.
- `sourceFingerprint`: keep the original value.
- `rationale`: optional, but if present it must be plain text or `null`.
- `optionExplanations`: must include non-empty explanations for options `A`, `B`, `C`, `D`, and `E`.
- `moduleCode`: keep the original value unless already absent/null.
- `difficulty`: keep the original value unless already absent/null. If changing, use only `"Basic"`, `"Intermediate"`, or `"Hard"`.
- `ausScore`: keep the original value unless already absent/null. If changing, use an integer from `1` to `5`.
- `source`: preserve existing metadata unless it directly conflicts with the repaired question.

## Accepted Curricula

Use exactly one of:

- `"General Paediatrics"`
- `"Paediatric Sub-specialties"`
- `"Paediatric Surgery"`
- `"Emergency Paediatrics"`
- `"Adolescent Medicine"`
- `"Community-based Paediatrics"`

Do not use `"Unclassified"` for a publishable repaired question.

## Option Rules

The `options` array must contain exactly five options in this exact order:

```json
[
  { "key": "A", "text": "...", "isCorrect": false },
  { "key": "B", "text": "...", "isCorrect": false },
  { "key": "C", "text": "...", "isCorrect": true },
  { "key": "D", "text": "...", "isCorrect": false },
  { "key": "E", "text": "...", "isCorrect": false }
]
```

Only one option may have `"isCorrect": true`. All other options must have `"isCorrect": false`. Do not use `null` for `isCorrect` in a repaired publishable item.

Option text must be concise answer text only. Do not put explanations into option text. Do not end option text with a full stop/period.

## Explanation Rules

`explanation` must:

- Clearly explain why the correct answer is correct.
- Be clinically useful to a paediatric learner.
- Be plain text with no markdown formatting.
- Not refer to source packs, notes, excerpts, batches, drafting, quality assurance, or the repair process.

`optionExplanations` must:

- Include keys `A`, `B`, `C`, `D`, and `E`.
- Explain why each option is correct or incorrect.
- Match the final option text and correct answer.
- Be plain text with no markdown formatting.

## Stem Rules

The stem must:

- Be a clinical paediatric SBA question.
- End with a question mark.
- Give enough clinical context to answer the question without referring to hidden source material.
- Ask for one best answer.
- Avoid vague process questions such as “which drafting choice”, “which batch outcome”, or “which source constraint”.

## Forbidden Learner-Facing Wording

Do not include learner-facing wording about:

- source packs
- provided excerpts
- provided notes
- according to the notes
- source material
- strict_internal
- this batch / the batch / batch outcome / within this batch
- draft writer
- question-bank style
- quality assurance of the drafting process
- publication governance
- citation governance
- evidence discipline as a process concept

The final item should read like a normal clinical qbank question, not like a question about creating or validating questions.

## Citation Rules

Preserve existing `citations` where possible.

Allowed citation object fields are:

- `type`: `"internal"` or `"external"`
- `source`: optional string
- `page`: optional non-negative integer
- `url`: optional valid URL
- `title`: optional string

Do not invent external URLs. If the original item has internal citations, keep them.

## Tag Rules

Preserve existing tags where possible. Tags must be non-empty strings.

If you add or edit a tag, use lowercase slash-separated slug style, for example:

```json
"cah-exam-blueprint/cah-kat/general-paediatrics"
```

## Final Checklist For Each Fixed Question

Before filling `fixedQuestion`, confirm:

- JSON is valid.
- `id` is unchanged.
- `status` is `"draft"`.
- `questionType` is `"SBA"`.
- `curriculum` is not `"Unclassified"`.
- There are exactly five options, ordered `A` to `E`.
- Exactly one option has `"isCorrect": true`.
- Each incorrect option has `"isCorrect": false`.
- The stem ends with `?`.
- The explanation is non-empty.
- `optionExplanations` has non-empty `A`, `B`, `C`, `D`, and `E`.
- Citations and tags are non-empty.
- There is no markdown in stem, options, explanation, rationale, or option explanations.
- Option text does not end with a period.
- The question is clinical and learner-facing.
- There is no source/drafting/batch/governance/process wording in learner-facing fields.

