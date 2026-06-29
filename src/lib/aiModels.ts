// Model metadata fetched from https://openrouter.ai/api/v1/models
// To update: curl -s https://openrouter.ai/api/v1/models | jq '[.data[] | select(.id == "<id>") | {id, name, context_length, pricing, top_provider}]'
// Pricing unit: USD per token (multiply by 1_000_000 to get per-1M rate)

export type AiModelPricing = {
  promptPerToken: number;    // USD per input token
  completionPerToken: number; // USD per output token
};

export type AiModel = {
  id: string;
  label: string;
  provider: string;
  contextWindow: number;
  maxCompletionTokens: number;
  pricing: AiModelPricing;
  default?: true;
  paid?: true;
};

export const AI_MODELS: AiModel[] = [
  // --- Free models ---
  // fetched: 2025-06-29 | context: 131072 | max_completion: 131072 | prompt: $0 | completion: $0
  {
    id: "openai/gpt-oss-120b:free",
    label: "gpt-oss-120b",
    provider: "OpenAI",
    contextWindow: 131_072,
    maxCompletionTokens: 131_072,
    pricing: { promptPerToken: 0, completionPerToken: 0 },
    default: true,
  },
  // fetched: 2025-06-29 | context: 262144 | max_completion: 32768 | prompt: $0 | completion: $0
  {
    id: "poolside/laguna-m.1:free",
    label: "Laguna M.1",
    provider: "Poolside",
    contextWindow: 262_144,
    maxCompletionTokens: 32_768,
    pricing: { promptPerToken: 0, completionPerToken: 0 },
  },
  // fetched: 2025-06-29 | context: 262144 | max_completion: 8192 | prompt: $0 | completion: $0
  {
    id: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B",
    provider: "Google",
    contextWindow: 262_144,
    maxCompletionTokens: 8_192,
    pricing: { promptPerToken: 0, completionPerToken: 0 },
  },
  // fetched: 2025-06-29 | context: 1048576 | max_completion: 262000 | prompt: $0 | completion: $0
  {
    id: "qwen/qwen3-coder:free",
    label: "Qwen3 Coder 480B",
    provider: "Qwen",
    contextWindow: 1_048_576,
    maxCompletionTokens: 262_000,
    pricing: { promptPerToken: 0, completionPerToken: 0 },
  },
  // --- Paid models (requires passphrase) ---
  // fetched: 2025-06-29 | context: 131072 | max_completion: 131072 | prompt: $0.03/1M | completion: $0.15/1M
  {
    id: "openai/gpt-oss-120b",
    label: "gpt-oss-120b",
    provider: "OpenAI",
    contextWindow: 131_072,
    maxCompletionTokens: 131_072,
    pricing: { promptPerToken: 0.00000003, completionPerToken: 0.00000015 },
    paid: true,
  },
  // fetched: 2025-06-29 | context: 400000 | max_completion: 128000 | prompt: $0.75/1M | completion: $4.50/1M
  {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    provider: "OpenAI",
    contextWindow: 400_000,
    maxCompletionTokens: 128_000,
    pricing: { promptPerToken: 0.00000075, completionPerToken: 0.0000045 },
    paid: true,
  },
  // fetched: 2025-06-29 | context: 1048576 | max_completion: 65536 | prompt: $0.25/1M | completion: $1.50/1M
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    provider: "Google",
    contextWindow: 1_048_576,
    maxCompletionTokens: 65_536,
    pricing: { promptPerToken: 0.00000025, completionPerToken: 0.0000015 },
    paid: true,
  },
  // fetched: 2025-06-29 | context: 1000000 | max_completion: 65536 | prompt: $0.32/1M | completion: $1.28/1M
  {
    id: "qwen/qwen3.7-plus",
    label: "Qwen3.7 Plus",
    provider: "Qwen",
    contextWindow: 1_000_000,
    maxCompletionTokens: 65_536,
    pricing: { promptPerToken: 0.00000032, completionPerToken: 0.00000128 },
    paid: true,
  },
  // fetched: 2025-06-29 | context: 1048576 | max_completion: 512000 | prompt: $0.30/1M | completion: $1.20/1M
  {
    id: "minimax/minimax-m3",
    label: "MiniMax M3",
    provider: "MiniMax",
    contextWindow: 1_048_576,
    maxCompletionTokens: 512_000,
    pricing: { promptPerToken: 0.0000003, completionPerToken: 0.0000012 },
    paid: true,
  },
];

export function getDefaultModel(): AiModel {
  return AI_MODELS.find((m) => m.default) ?? AI_MODELS[0];
}

export function getModelById(id: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

export function isAllowedModel(id: string | undefined): boolean {
  if (!id) return false;
  return AI_MODELS.some((m) => m.id === id);
}

export function isPaidModel(id: string | undefined): boolean {
  if (!id) return false;
  return AI_MODELS.some((m) => m.id === id && m.paid);
}

export function calcCost(modelId: string, tokensIn: number, tokensOut: number): number {
  const model = getModelById(modelId);
  if (!model) return 0;
  return tokensIn * model.pricing.promptPerToken + tokensOut * model.pricing.completionPerToken;
}
