export type GenerationProvider = "openai" | "openrouter"

type EnvLike = Record<string, string | undefined>

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"
export const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"
export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

export function resolveGenerationProvider(env: EnvLike = process.env): GenerationProvider {
  const raw = env.GENERATE_API_PROVIDER?.trim().toLowerCase() ?? "openai"
  if (raw === "openai" || raw === "openrouter") {
    return raw
  }

  throw new Error(`Unsupported GENERATE_API_PROVIDER: ${raw}`)
}

export function resolveGenerationModel(env: EnvLike = process.env) {
  const explicitModel = env.GENERATE_MODEL?.trim()
  if (explicitModel) {
    return explicitModel
  }

  const provider = resolveGenerationProvider(env)
  if (provider === "openrouter") {
    return env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
  }

  return env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
}

export function resolveGenerationApiKey(env: EnvLike = process.env) {
  const provider = resolveGenerationProvider(env)
  if (provider === "openrouter") {
    const apiKey = env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required when GENERATE_API_PROVIDER=openrouter")
    }
    return apiKey
  }

  const apiKey = env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when GENERATE_API_PROVIDER=openai")
  }
  return apiKey
}

export function resolveOpenRouterHeaders(env: EnvLike = process.env) {
  const headers: Record<string, string> = {}
  const referer = env.OPENROUTER_HTTP_REFERER?.trim()
  const title = env.OPENROUTER_TITLE?.trim()

  if (referer) headers["HTTP-Referer"] = referer
  if (title) headers["X-OpenRouter-Title"] = title

  return headers
}
