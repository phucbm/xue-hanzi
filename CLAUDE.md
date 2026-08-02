# Hiểu Chữ Hán

## Commands
- Dev: `npm run dev`
- Build: `npm run build`
- Build dictionary: `npm run build:dict` (only when source data changes)
- Backfill flashcards from history: `npm run backfill:flashcards` (idempotent, safe to re-run)

## Rules
- Next.js 16 has breaking changes vs 13–15. Read `node_modules/next/dist/docs/` before writing any Next.js code; heed deprecation notices.
- App has full server runtime (API routes, Turso). The `output: 'export'` note is outdated — do not add static export. There is no user auth (Clerk was removed) — every server-side feature (history sync, flashcards, AI usage) is single-guest, keyed on `GUEST_USER_ID` from `src/lib/aiConstants.ts`, designed to not require rework if real multi-user auth returns.
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
- Base UI `Button` with `render={<Link .../>}` needs `nativeButton={false}` too, or it logs a console warning (it renders an `<a>`, not a real `<button>`).
- Base UI `Menu`/`DropdownMenu` items default to `closeOnClick={true}` and the open popup runs its own keydown handler for type-ahead — both will steal focus/keystrokes from any `<input>` you render inside a menu (e.g. an inline "create new item" field). Pass `closeOnClick={false}` on the triggering item and `onKeyDown={(e) => e.stopPropagation()}` on the input.
- `DropdownMenuLabel` (and any other `Menu.Group*` part) must be wrapped in `DropdownMenuGroup` — using it bare throws `MenuGroupRootContext is missing` at runtime, not at build time.

@.claude/docs/architecture.md
@.claude/docs/agents.md
@.claude/docs/flashcards.md
