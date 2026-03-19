# CAH Local Corpus

This folder is the local/private corpus root for the CAH QBank project.

Recommended workflow:
1. Drop a source folder into a temporary location.
2. Run `pnpm corpus:prepare -- --source-folder /absolute/path/to/folder`.
3. Review the generated manifest/report.
4. Run `pnpm ingest` to import explicit question files.
5. Run `pnpm chunks:ingest` then `pnpm embeddings:build` to prepare notes for retrieval/generation.
6. Add or update `metadata/exam_blueprint.csv`, then run `pnpm blueprint:apply`.
