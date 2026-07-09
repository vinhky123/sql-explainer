import OpenAI from 'openai'

export type LlmProvider = 'groq' | 'openai' | 'openrouter'

export interface ProviderConfig {
  label: string
  baseURL: string
  models: string[]
  keyUrl: string
  hint: string
}

export const PROVIDERS: Record<LlmProvider, ProviderConfig> = {
  groq: {
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    keyUrl: 'https://console.groq.com/keys',
    hint: 'Fast + generous free tier. Recommended.',
  },
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
    keyUrl: 'https://platform.openai.com/api-keys',
    hint: 'Highest quality, paid only.',
  },
  openrouter: {
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'google/gemini-flash-1.5'],
    keyUrl: 'https://openrouter.ai/keys',
    hint: 'Many models, some free.',
  },
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamParams {
  provider: LlmProvider
  model: string
  apiKey: string
  messages: ChatMessage[]
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

export async function streamChat({ provider, model, apiKey, messages, onDelta, signal }: StreamParams): Promise<string> {
  if (!apiKey.trim()) throw new Error('No API key set. Open Settings (gear icon) to add one.')
  const cfg = PROVIDERS[provider]
  const client = new OpenAI({
    apiKey,
    baseURL: cfg.baseURL,
    dangerouslyAllowBrowser: true,
  })
  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    max_tokens: 1500,
  }, { signal })

  let full = ''
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      full += delta
      onDelta(delta)
    }
  }
  return full
}

export function friendlyError(e: unknown): string {
  if (e instanceof Error && e.name === 'AbortError') return ''
  const msg = e instanceof Error ? e.message : String(e)
  if (/abort|this operation was aborted|signal aborted/i.test(msg)) return ''
  if (/401|invalid_api_key|incorrect api key/i.test(msg)) return 'Invalid API key — check it in Settings.'
  if (/403|forbidden/i.test(msg)) return 'Access forbidden — this key may lack permission for that model.'
  if (/429|rate limit/i.test(msg)) return 'Rate limited — wait a moment and try again.'
  if (/model.*not|does not exist/i.test(msg)) return `Model not available for this provider. Pick another in Settings. (${msg})`
  if (/failed to fetch|networkError|load failed/i.test(msg)) return 'Network error — check your connection or the provider URL (CORS).'
  return msg
}
