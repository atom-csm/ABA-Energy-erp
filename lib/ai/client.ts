// SERVER-ONLY. Importing this from a Client Component (or a vitest node test)
// throws — that guard keeps the provider SDK/API key out of the browser bundle
// and off the test path. The pure prompt/parse modules deliberately do NOT
// import this file, so they stay unit-testable with no key and no network.
import "server-only"

/**
 * OpenRouter model used for production AI features.
 * Override with OPENROUTER_MODEL when a cheaper/faster Claude-compatible model is desired.
 */
export const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

/**
 * Thrown when no OPENROUTER_API_KEY is configured. Callers catch this and return
 * a friendly `{ notConfigured: true }` result instead of surfacing an error —
 * the app must never crash or hit the network when the key is absent.
 */
export class AINotConfiguredError extends Error {
  constructor() {
    super("AI is not configured — OPENROUTER_API_KEY is not set.")
    this.name = "AINotConfiguredError"
  }
}

/** True only when an API key is present in the server environment. */
export function isAIConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

type OpenRouterTextBlock = {
  type?: string
  text?: string
}

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | OpenRouterTextBlock[]
    }
  }>
  error?: {
    message?: string
  }
}

function extractContent(content: string | OpenRouterTextBlock[] | undefined): string {
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((block) => (block.type === "text" || !block.type ? block.text ?? "" : ""))
      .join("")
      .trim()
  }
  return ""
}

/**
 * Run a single-shot text generation through OpenRouter's OpenAI-compatible API.
 * Throws AINotConfiguredError BEFORE any network call when the key is missing.
 * Returns the assistant text content.
 */
export async function generateText({
  system,
  prompt,
  maxTokens = 1024,
}: {
  system: string
  prompt: string
  maxTokens?: number
}): Promise<string> {
  if (!isAIConfigured()) {
    throw new AINotConfiguredError()
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://aba-energy-os.vercel.app",
      "X-Title": "ABA Energy OS",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  })

  let json: OpenRouterResponse | null = null
  try {
    json = (await res.json()) as OpenRouterResponse
  } catch {
    json = null
  }

  if (!res.ok) {
    throw new Error(json?.error?.message ?? `OpenRouter request failed (${res.status})`)
  }

  const text = extractContent(json?.choices?.[0]?.message?.content)
  if (!text) throw new Error("OpenRouter returned an empty response")
  return text
}
