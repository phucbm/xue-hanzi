# Database (Turso)

One libSQL database on Turso, reached with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (`.env.local`, Vercel). `src/lib/turso.ts` only opens the client; nothing creates or changes the schema at run time.

## Migrations

- `db/migrations/NNN-name.sql`, applied in order and recorded in `schema_migrations (version, name, applied_at)`.
- `npm run db:migrate -- --dry` lists the pending ones; `npm run db:migrate` applies them. Before each one it saves a full dump (schema and every row) to `db/dumps/` (git-ignored, mode 600). Each migration runs in one write batch with its `schema_migrations` row: whole or not at all.
- `npm run db:dump` saves a dump only. Restore one into an empty database with `turso db shell <db> < db/dumps/<file>.sql`.
- Run the migration before deploying code that needs it. A migration only adds (tables, columns with a default, indexes); it never drops or renames a column another reader uses.
- libSQL has no `ADD COLUMN IF NOT EXISTS`: a migration runs once, so a plain `ALTER TABLE ... ADD COLUMN` is right.
- `001-baseline.sql` is the schema as it was on 2026-11-10, when `initSchema()` still created it on each cold start. It is all `IF NOT EXISTS`, so a new database gets everything from it.
- A new clone with its own Turso database: set the two variables in `.env.local`, then `npm run db:migrate`.

## Who owns which table

| Table | Owner | Others that use it |
| --- | --- | --- |
| `user_history`, `user_words`, `flashcard_*`, `notebook_*`, `ai_*`, `word_etymology_links`, `schema_migrations` | this app (`db/migrations/`) | the OUC connector (`phucbm/ouc-mcp`) reads lookups and cards and writes reviews and cards (plan 002, step 5): the columns it uses are pinned by a test there |
| `material_words` | the study repo `phucbm/ou-chinese-language` (`pnpm db:material` creates and rebuilds it) | this app reads it (where a word was met, course and lesson decks) |

A change to a column the connector uses: add the new column first, deploy both, drop nothing.

## Login

The owner's passphrase (`HISTORY_PASSPHRASE`) is typed once per device; `/api/auth/login` sets an httpOnly cookie signed with it (`src/lib/session.ts`). Every `/api/history*` route and every flashcard server action checks it; `/flashcards` redirects home without it. Word pages stay public: for a visitor, the flashcard reads return nothing and the auto-add on view does nothing.
