# CAH ChatGPT Pro Handoff

Use this folder when you want ChatGPT Pro to generate original CAH draft MCQs from the internal question-source documents without using an API key.

Recommended workflow:

1. Upload the files listed in `UPLOAD_FILES.md` to a fresh ChatGPT Pro chat.
2. Paste the full contents of `PROMPT_INITIAL.md`.
3. If ChatGPT Pro stops early or you want more batches, keep the same chat open and paste `PROMPT_CONTINUE.md`.
4. Paste the JSON output back into this Codex thread and I will validate it, deduplicate it, and turn it into a reviewable import set.

Important constraints:

- Use internal uploaded material only.
- Generate original draft questions only, not faithful copies of past-paper stems.
- Keep to SBA format only for this workflow.
- Preserve incomplete and fragmentary remembered-question material by converting it into clean high-yield draft MCQs instead of discarding it.
