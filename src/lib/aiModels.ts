export type AiModel = {
  id: string;
  label: string;
  provider: string;
  contextWindow: number;
  default?: true;
};

export const AI_MODELS: AiModel[] = [
  // https://openrouter.ai/google/gemini-2.0-flash-exp:free
  {
    id: "google/gemini-2.0-flash-exp:free",
    label: "Gemini 2.0 Flash",
    provider: "Google",
    contextWindow: 1_048_576,
    default: true,
  },
  // https://openrouter.ai/qwen/qwen3-235b-a22b:free
  {
    id: "qwen/qwen3-235b-a22b:free",
    label: "Qwen3 235B",
    provider: "Qwen",
    contextWindow: 131_072,
  },
  // https://openrouter.ai/meta-llama/llama-3.3-70b-instruct:free
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B",
    provider: "Meta",
    contextWindow: 131_072,
  },
  // https://openrouter.ai/deepseek/deepseek-r1-0528:free
  {
    id: "deepseek/deepseek-r1-0528:free",
    label: "DeepSeek R1 0528",
    provider: "DeepSeek",
    contextWindow: 163_840,
  },
  // https://openrouter.ai/mistralai/mistral-nemo:free
  {
    id: "mistralai/mistral-nemo:free",
    label: "Mistral Nemo",
    provider: "Mistral",
    contextWindow: 131_072,
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
