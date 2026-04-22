import { describe, expect, it } from "vitest"

import { createDraftGenerator } from "../src/openai-client.js"

const parsedQuestion = {
  stem: "Which management step is most appropriate?",
  questionType: "SBA" as const,
  options: [
    { key: "A" as const, text: "A", isCorrect: false },
    { key: "B" as const, text: "B", isCorrect: true },
    { key: "C" as const, text: "C", isCorrect: false },
    { key: "D" as const, text: "D", isCorrect: false },
    { key: "E" as const, text: "E", isCorrect: false },
  ],
  explanation: "Because B is correct.",
  citations: [{ type: "internal" as const, source: "source.txt", page: 1, url: null, title: "Excerpt 1/1" }],
  tags: ["general-paediatrics"],
  curriculum: "General Paediatrics" as const,
  why_others_wrong: {
    A: "Wrong",
    B: null,
    C: "Wrong",
    D: "Wrong",
    E: "Wrong",
  },
  key_takeaways: ["One", "Two", "Three"],
  moduleCode: null,
  difficulty: "Intermediate" as const,
  ausScore: 2,
}

describe("createDraftGenerator", () => {
  it("uses the OpenAI responses API path when provider=openai", async () => {
    let called = false
    const generator = createDraftGenerator({
      provider: "openai",
      model: "gpt-5.4-mini",
      client: {
        responses: {
          parse: async () => {
            called = true
            return { output_parsed: parsedQuestion }
          },
        },
      } as never,
    })

    const result = await generator({
      batch: "batch",
      ordinal: 1,
      total: 1,
      requestedTags: ["general-paediatrics"],
      sourcePath: "/tmp/source.txt",
      sourceLabel: "Full source",
      sourceExcerpt: "Excerpt",
    })

    expect(called).toBe(true)
    expect(result.stem).toBe(parsedQuestion.stem)
  })

  it("uses the OpenRouter chat-completions path when provider=openrouter", async () => {
    let called = false
    const generator = createDraftGenerator({
      provider: "openrouter",
      model: "google/gemma-4-31b-it:free",
      client: {
        chat: {
          completions: {
            parse: async () => {
              called = true
              return {
                choices: [
                  {
                    message: {
                      parsed: parsedQuestion,
                      refusal: null,
                    },
                  },
                ],
              }
            },
          },
        },
      } as never,
    })

    const result = await generator({
      batch: "batch",
      ordinal: 1,
      total: 1,
      requestedTags: ["general-paediatrics"],
      sourcePath: "/tmp/source.txt",
      sourceLabel: "Excerpt 1/1",
      sourceExcerpt: "Excerpt",
    })

    expect(called).toBe(true)
    expect(result.citations[0]?.source).toBe("source.txt")
  })

  it("retries retryable provider errors before succeeding", async () => {
    const attempts: number[] = []
    const originalRetryLimit = process.env.GENERATE_RETRY_LIMIT
    const originalRetryBaseDelayMs = process.env.GENERATE_RETRY_BASE_DELAY_MS
    process.env.GENERATE_RETRY_LIMIT = "2"
    process.env.GENERATE_RETRY_BASE_DELAY_MS = "1"

    try {
      const generator = createDraftGenerator({
        provider: "openrouter",
        model: "google/gemma-4-31b-it:free",
        client: {
          chat: {
            completions: {
              parse: async () => {
                attempts.push(Date.now())
                if (attempts.length < 3) {
                  throw Object.assign(new Error("temporarily rate-limited upstream"), { status: 429 })
                }

                return {
                  choices: [
                    {
                      message: {
                        parsed: parsedQuestion,
                        refusal: null,
                      },
                    },
                  ],
                }
              },
            },
          },
        } as never,
      })

      const result = await generator({
        batch: "batch",
        ordinal: 1,
        total: 1,
        requestedTags: ["general-paediatrics"],
        sourcePath: "/tmp/source.txt",
        sourceLabel: "Excerpt 1/1",
        sourceExcerpt: "Excerpt",
      })

      expect(attempts).toHaveLength(3)
      expect(result.stem).toBe(parsedQuestion.stem)
    } finally {
      if (originalRetryLimit === undefined) delete process.env.GENERATE_RETRY_LIMIT
      else process.env.GENERATE_RETRY_LIMIT = originalRetryLimit

      if (originalRetryBaseDelayMs === undefined) delete process.env.GENERATE_RETRY_BASE_DELAY_MS
      else process.env.GENERATE_RETRY_BASE_DELAY_MS = originalRetryBaseDelayMs
    }
  })

  it("surfaces a final failure after exhausting retryable attempts", async () => {
    const originalRetryLimit = process.env.GENERATE_RETRY_LIMIT
    const originalRetryBaseDelayMs = process.env.GENERATE_RETRY_BASE_DELAY_MS
    process.env.GENERATE_RETRY_LIMIT = "1"
    process.env.GENERATE_RETRY_BASE_DELAY_MS = "1"

    try {
      const generator = createDraftGenerator({
        provider: "openrouter",
        model: "google/gemma-4-31b-it:free",
        client: {
          chat: {
            completions: {
              parse: async () => {
                throw Object.assign(new Error("temporarily rate-limited upstream"), { status: 429 })
              },
            },
          },
        } as never,
      })

      await expect(
        generator({
          batch: "batch",
          ordinal: 1,
          total: 1,
          requestedTags: ["general-paediatrics"],
          sourcePath: "/tmp/source.txt",
          sourceLabel: "Excerpt 1/1",
          sourceExcerpt: "Excerpt",
        }),
      ).rejects.toThrow(/rate-limited upstream/i)
    } finally {
      if (originalRetryLimit === undefined) delete process.env.GENERATE_RETRY_LIMIT
      else process.env.GENERATE_RETRY_LIMIT = originalRetryLimit

      if (originalRetryBaseDelayMs === undefined) delete process.env.GENERATE_RETRY_BASE_DELAY_MS
      else process.env.GENERATE_RETRY_BASE_DELAY_MS = originalRetryBaseDelayMs
    }
  })
})
