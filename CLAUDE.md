# Hiểu Chữ Hán

## Commands
- Dev: `npm run dev`
- Build: `npm run build`
- Build dictionary: `npm run build:dict` (only when source data changes)

## Rules
- Next.js 16 has breaking changes vs 13–15. Read `node_modules/next/dist/docs/` before writing any Next.js code; heed deprecation notices.
- App has full server runtime (API routes, Clerk auth, Turso). The `output: 'export'` note is outdated — do not add static export.
- `chinese-lexicon` is Node.js-only (CommonJS). Never import it client-side. All dictionary access goes through `src/core/client-dictionary.ts`.
- `public/data/dictionary.json` (28 MB, 116K entries) is pre-built and committed. Do not regenerate unless source data changes.
- Serwist SW (`src/app/sw.ts`): requires `disable: process.env.NODE_ENV === 'development'` in next.config to avoid SW interference in dev.
- `kVietnamese` values in `src/data/kVietnamese.json` are raw Unicode Unihan — space-separated readings per codepoint key (e.g. `"U+4E2D": "trung"`).
- AI (OpenRouter) is opt-in, enabled only when `OPENROUTER_API_KEY` is set (server-side). Rate limits in Turso `ai_usage_log`. Constants in `src/lib/aiConstants.ts`. Both `/api/ai/stream` (word analysis) and `/api/ai/recognize` (handwriting) share the same pool and `AI_MODEL` env var.
- `"use server"` files can only export async functions — never export plain constants from them, put shared constants in a separate non-server file.
- Dexie has been removed. No client-side DB — all persistence is Turso (server) or localStorage.
- Always show the full error message in the UI. Never swallow errors into generic strings like "Có lỗi xảy ra". In catch blocks: `toast.error(e instanceof Error ? e.message : String(e))`.
- libSQL (`@libsql/client`) does NOT support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Use `PRAGMA table_info` to check column existence before any ALTER TABLE migration.
- `AddToGroupButton` and any component using `@base-ui/react` Popover/Menu triggers: use the `render` prop instead of `asChild` (base-ui does not support Radix-style `asChild`).

@.claude/docs/architecture.md
@.claude/docs/agents.md
