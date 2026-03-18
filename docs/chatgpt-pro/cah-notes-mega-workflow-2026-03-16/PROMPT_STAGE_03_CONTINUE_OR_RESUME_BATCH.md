Continue the **same batch only**.

Use the same uploaded files, the same subtopic scope, and the same rules as before.

Do not restart the batch from the beginning.
Do not repeat already generated questions.
Do not widen the subtopic coverage.

If the previous answer was truncated:

- continue with the remaining questions only
- preserve the same JSON schema

If the previous answer completed but needs correction:

- return only a corrected full JSON object for the same batch
- keep the batch size unchanged

Return JSON only.
