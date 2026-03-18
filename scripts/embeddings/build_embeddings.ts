import dotenv from "dotenv";
import OpenAI from "openai";

import { prisma } from "../lib/prisma";
import { parseBuildEmbeddingArgs, type EmbeddingSourceMode } from "./build_embeddings_args";

dotenv.config();

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getModel() {
  return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
}

function getExpectedDim() {
  const raw = Number(process.env.OPENAI_EMBEDDING_DIM ?? "1536");
  return Number.isFinite(raw) && raw > 0 ? raw : 1536;
}

function toVectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

async function loadPendingChunks(limit: number, source: EmbeddingSourceMode) {
  const sourceClause = source === "internal"
    ? ` AND "sourceType" IN ('pdf', 'docx')`
    : "";
  return prisma.$queryRawUnsafe<Array<{ id: string; text: string }>>(
    `
      SELECT id, text
      FROM "ContentChunk"
      WHERE embedding IS NULL
      ${sourceClause}
      ORDER BY "createdAt" ASC
      LIMIT ${Math.max(1, Math.min(limit, 10000))}
    `,
  );
}

async function updateEmbedding(id: string, embedding: number[]) {
  const literal = toVectorLiteral(embedding).replace(/'/g, "");
  await prisma.$executeRawUnsafe(
    `UPDATE "ContentChunk" SET embedding = '${literal}'::vector WHERE id = $1`,
    id,
  );
}

async function buildEmbeddings() {
  const client = getClient();
  const model = getModel();
  const dim = getExpectedDim();
  const args = parseBuildEmbeddingArgs(process.argv.slice(2));

  const pending = await loadPendingChunks(args.limit, args.source);
  if (pending.length === 0) {
    console.log("No pending chunks found.");
    return;
  }

  let processed = 0;
  const batchSize = 50;

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model,
      input: batch.map((item) => item.text),
    });

    if (response.data.length !== batch.length) {
      throw new Error(`Embedding response size mismatch: expected ${batch.length}, received ${response.data.length}`);
    }

    for (let index = 0; index < batch.length; index += 1) {
      const record = batch[index];
      const embedding = response.data[index]?.embedding ?? [];

      if (embedding.length !== dim) {
        throw new Error(`Embedding dimension mismatch for ${record.id}: expected ${dim}, got ${embedding.length}`);
      }

      await updateEmbedding(record.id, embedding);
      processed += 1;
    }

    console.log(`Embedded ${processed}/${pending.length} chunks`);
  }

  console.log(
    JSON.stringify(
      {
        processed,
        model,
        dimension: dim,
        source: args.source,
      },
      null,
      2,
    ),
  );
}

buildEmbeddings()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
