# Sydney Medical School Paediatrics Question Style Spec

## Scope
- MCQ-only platform.
- Allowed item types: `SBA`, `EMQ_STEM`.
- No SAQ, short-answer, flashcard, or free-text assessment modes.

## Stem design
- Use concise clinical vignettes relevant to child and adolescent health.
- Prioritize paediatric discriminators:
  - age
  - developmental stage
  - weight/growth context
  - key vital signs or exam findings
  - investigation cues
- Keep each question single-focus and exam-relevant.

## Option rules
- SBA items use exactly 5 options (`A`-`E`).
- EMQ stems must reference a shared option list and have one best answer.
- Distractors should be plausible but clearly inferior when explanations are shown.
- Disallow “all of the above”, “none of the above”, or multi-correct constructs.

## Language and framing
- Australian framing and terminology.
- SI units.
- Education-only, not medical advice.
- Follow local Sydney Medical School / Australian paediatric exam tone.

## Required generated output fields
- `stem_markdown`
- `options`
- `correctKey`
- `explanation_markdown`
- `why_others_wrong`
- `key_takeaways`
- `tags`
- `moduleCode` (when known)
- `difficulty`
- `ausScore`
- `citations`

## Grounding and citation policy
- Default mode: `strict_internal`.
- In strict mode, examinable claims must come from the local corpus only.
- `augmented` mode may use curated external citations only for clarification.
- Do not introduce unsupported examinable facts in strict mode.

## Similarity constraints
- Do not reproduce imported stems/options verbatim.
- Generated questions must be original and pass similarity checks before becoming drafts.
