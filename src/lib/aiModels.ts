export type AiModel = {
  id: string;
  label: string;
  provider: string;
  contextWindow: number;
  default?: true;
};

export const AI_MODELS: AiModel[] = [
  // https://openrouter.ai/openai/gpt-oss-120b:free
  {
    id: "openai/gpt-oss-120b:free",
    label: "gpt-oss-120b",
    provider: "OpenAI",
    contextWindow: 131_000,
    default: true,
  },
  // https://openrouter.ai/poolside/laguna-m.1:free
  {
    id: "poolside/laguna-m.1:free",
    label: "Laguna M.1",
    provider: "Poolside",
    contextWindow: 262_000,
  },
  // https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "Nemotron 3 Ultra",
    provider: "NVIDIA",
    contextWindow: 1_000_000,
  },
  // https://openrouter.ai/nvidia/nemotron-3.5-content-safety:free
  {
    id: "nvidia/nemotron-3.5-content-safety:free",
    label: "Nemotron 3.5 Content Safety",
    provider: "NVIDIA",
    contextWindow: 128_000,
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
