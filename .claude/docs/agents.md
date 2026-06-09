# AI Layer — Hiểu Chữ Hán

## Provider
- OpenRouter via OpenAI-compatible API (`https://openrouter.ai/api/v1/chat/completions`)
- Default model: `openai/gpt-oss-120b:free` (user-selectable in UI; see `src/lib/aiModels.ts`)
- Stream: SSE, temperature: 0, max_tokens: 16384

## Entry point
`src/lib/groq.ts` — `streamWordAnalysis(simp, trad?, dictContext?, recentWords?, modelId?)` returns `AsyncGenerator<string>`, proxied via `POST /api/ai/stream`

Prompt template loaded server-side from `public/prompts/word-analysis.md` via `fs.readFile`.
Placeholders: `{{simp}}`, `{{trad}}`, `{{trad_line}}`, `{{dict_context}}`, `{{recent_words}}`

## Model selection
`src/lib/aiModels.ts` — list of allowed free OpenRouter models. Client sends `modelId`; server validates via `isAllowedModel()`.
Resolution order: `AI_MODEL` env var → validated `modelId` from client → `getDefaultModel()`.

## Rate limiting
IP-based daily cap (`IP_DAILY_LIMIT`) tracked in Turso `ai_usage_log`. No client-side limit.

## Usage tracking
`src/components/PWATracker.tsx` — tracks AI explanation calls via counterapi.dev (anonymous hit counter, no user data).

## Env vars
- `OPENROUTER_API_KEY` — server-side only; route returns 503 if unset
- `AI_MODEL` — server-side only; overrides client model selection
