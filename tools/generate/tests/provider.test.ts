import { describe, expect, it } from "vitest"

import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  resolveGenerationApiKey,
  resolveGenerationModel,
  resolveGenerationProvider,
  resolveOpenRouterHeaders,
} from "../src/provider.js"

describe("generation provider config", () => {
  it("defaults to OpenAI provider and model", () => {
    expect(resolveGenerationProvider({})).toBe("openai")
    expect(resolveGenerationModel({})).toBe(DEFAULT_OPENAI_MODEL)
  })

  it("supports OpenRouter provider defaults", () => {
    expect(resolveGenerationProvider({ GENERATE_API_PROVIDER: "openrouter" })).toBe("openrouter")
    expect(resolveGenerationModel({ GENERATE_API_PROVIDER: "openrouter" })).toBe(DEFAULT_OPENROUTER_MODEL)
  })

  it("prefers GENERATE_MODEL over provider-specific defaults", () => {
    expect(
      resolveGenerationModel({
        GENERATE_API_PROVIDER: "openrouter",
        GENERATE_MODEL: "custom/model",
        OPENROUTER_MODEL: "ignored/model",
      }),
    ).toBe("custom/model")
  })

  it("reads the matching provider API key", () => {
    expect(resolveGenerationApiKey({ OPENAI_API_KEY: "sk-openai", GENERATE_API_PROVIDER: "openai" })).toBe("sk-openai")
    expect(
      resolveGenerationApiKey({
        OPENROUTER_API_KEY: "sk-or-test",
        GENERATE_API_PROVIDER: "openrouter",
      }),
    ).toBe("sk-or-test")
  })

  it("builds optional OpenRouter attribution headers", () => {
    expect(
      resolveOpenRouterHeaders({
        OPENROUTER_HTTP_REFERER: "https://localhost:3000",
        OPENROUTER_TITLE: "CAH QBank v2",
      }),
    ).toEqual({
      "HTTP-Referer": "https://localhost:3000",
      "X-OpenRouter-Title": "CAH QBank v2",
    })
  })
})
