export type Kind = 'correction' | 'summary' | 'step_by_step' | 'infographic'
export type AiProvider = 'lovable' | 'openrouter' | 'ollama'

export interface AiModelOption {
  id: string // canonical model id sent to backend (e.g. "google/gemini-2.5-pro", "ollama:qwen2.5:7b")
  label: string
  provider: AiProvider
  /** If set, only these kinds can use this model. Defaults to non-image kinds. */
  supportsKinds?: Kind[]
}

const TEXT_KINDS: Kind[] = ['correction', 'summary', 'step_by_step']
const IMAGE_KINDS: Kind[] = ['infographic']

export const AI_MODELS: AiModelOption[] = [
  // Lovable AI Gateway (default, no extra key required)
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', provider: 'lovable', supportsKinds: TEXT_KINDS },
  { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'lovable', supportsKinds: TEXT_KINDS },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'lovable', supportsKinds: TEXT_KINDS },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'lovable', supportsKinds: TEXT_KINDS },
  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'lovable', supportsKinds: TEXT_KINDS },
  { id: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', provider: 'lovable', supportsKinds: IMAGE_KINDS },
  { id: 'openai/gpt-5', label: 'GPT-5', provider: 'lovable', supportsKinds: TEXT_KINDS },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', provider: 'lovable', supportsKinds: TEXT_KINDS },
  { id: 'openai/gpt-5-nano', label: 'GPT-5 Nano', provider: 'lovable', supportsKinds: TEXT_KINDS },

  // OpenRouter (requires OPENROUTER_API_KEY on the backend)
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', provider: 'openrouter', supportsKinds: TEXT_KINDS },
  { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B', provider: 'openrouter', supportsKinds: TEXT_KINDS },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', provider: 'openrouter', supportsKinds: TEXT_KINDS },

  // Local Ollama (requires OLLAMA_BASE_URL on the backend)
  { id: 'ollama:qwen2.5:7b', label: 'Ollama · Qwen 2.5 7B', provider: 'ollama', supportsKinds: TEXT_KINDS },
  { id: 'ollama:deepseek-r1:8b', label: 'Ollama · DeepSeek R1 8B', provider: 'ollama', supportsKinds: TEXT_KINDS },
  { id: 'ollama:gpt-oss:20b', label: 'Ollama · GPT-OSS 20B', provider: 'ollama', supportsKinds: TEXT_KINDS },
]

export const DEFAULT_MODELS = ['google/gemini-3-flash-preview']

export function modelsForKind(kind: Kind): AiModelOption[] {
  return AI_MODELS.filter((m) => !m.supportsKinds || m.supportsKinds.includes(kind))
}

export function isImageKind(kind: Kind): boolean {
  return kind === 'infographic'
}

export function getModel(id: string): AiModelOption | undefined {
  return AI_MODELS.find((m) => m.id === id)
}

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  lovable: 'Lovable AI',
  openrouter: 'OpenRouter',
  ollama: 'Ollama (local)',
}