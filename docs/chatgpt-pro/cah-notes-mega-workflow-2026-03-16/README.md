# CAH 1000+ Workflow Pack

This pack is for building a **1000+ question** CAH QBank in **many small steps** so quality stays high.

Do **not** ask ChatGPT Pro to generate all 1000+ questions in one response.

Use this pack in stages:

1. Build a **master batch plan** from the notes.
2. Generate **one batch at a time**.
3. Paste each returned JSON batch back into Codex for offline originality screening.
4. Only keep batches that pass.

If you have **already** told ChatGPT Pro to make `1000+ questions`, use
`PROMPT_IF_ALREADY_STARTED_1000_PLUS_CHAT.md` first so it resets into the staged workflow cleanly.

Saved artifacts:

- `outputs/master-batch-plan-2026-03-16.md` stores the current accepted planning response.
- `batch-briefs/B01.md` stores the first-batch parameters.
- `batch-briefs/PROMPT_STAGE_02_B01_READY_TO_PASTE.md` is a ready-to-paste first generation prompt.

Recommended scale:

- aim for **80 to 100 batches**
- generate **10 to 14 full questions per batch**
- keep each batch tightly tied to a small set of subtopics

Why this structure matters:

- the past-question corpus strongly pulls ChatGPT into near-paraphrases
- smaller batches are much more likely to stay original
- note-first grounding works better than question-first grounding
