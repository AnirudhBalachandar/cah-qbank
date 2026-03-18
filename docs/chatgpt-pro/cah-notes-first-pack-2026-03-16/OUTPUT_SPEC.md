# Output Spec

Return one JSON object with this top-level shape:

```json
{
  "questions": [
    {
      "stem_markdown": "Question stem here",
      "options": [
        { "key": "A", "text": "Option A" },
        { "key": "B", "text": "Option B" },
        { "key": "C", "text": "Option C" },
        { "key": "D", "text": "Option D" },
        { "key": "E", "text": "Option E" }
      ],
      "correctKey": "A",
      "explanation_markdown": "Why the correct answer is best.",
      "why_others_wrong": {
        "B": "Why B is wrong.",
        "C": "Why C is wrong.",
        "D": "Why D is wrong.",
        "E": "Why E is wrong."
      },
      "key_takeaways": [
        "Takeaway 1",
        "Takeaway 2",
        "Takeaway 3"
      ],
      "tags": [
        "General Paediatrics",
        "respiratory",
        "acute care"
      ],
      "moduleCode": null,
      "difficulty": "Intermediate",
      "ausScore": 4,
      "citations": [
        {
          "type": "internal",
          "source": "Exact Uploaded Filename.docx",
          "title": "Exact Uploaded Filename.docx",
          "page": 3
        }
      ]
    }
  ]
}
```

Field rules:

- `questions`: array of generated draft questions.
- `stem_markdown`: minimum 20 characters.
- `options`: exactly 5 options with keys `A` to `E`.
- `correctKey`: exactly one of `A`, `B`, `C`, `D`, `E`.
- `explanation_markdown`: minimum 20 characters.
- `why_others_wrong`: include the four incorrect option keys only.
- `key_takeaways`: 3 to 8 concise learning points.
- `tags`: at least 1 tag.
- First tag must be exactly one of:
  - `General Paediatrics`
  - `Paediatric Sub-specialties`
  - `Paediatric Surgery`
  - `Emergency Paediatrics`
  - `Adolescent Medicine`
  - `Community-based Paediatrics`
- Add 1 to 4 extra topic tags after the first curriculum-area tag.
- `moduleCode`: use `null` if unknown.
- `difficulty`: one of `Basic`, `Intermediate`, `Hard`.
- `ausScore`: integer from 1 to 5.
- `citations`: at least 1 citation, all internal only.

Citation rules:

- Every citation object must have `"type": "internal"`.
- Use the exact uploaded filename in both `source` and `title`.
- Include `page` only when the page number is clearly visible or confidently inferable.
- Do not include external URLs.

Content rules:

- SBA only.
- Australian framing and terminology.
- SI units.
- Education-only, not medical advice.
- Do not copy stems or options verbatim from uploaded source questions.
- Do not add unsupported examinable facts.
