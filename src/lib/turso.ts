import { createClient } from "@libsql/client";

function createTursoClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return null;
  return createClient({ url, authToken });
}

/**
 * The Turso client, or null without TURSO_DATABASE_URL / TURSO_AUTH_TOKEN. The schema is not created here: it lives in
 * db/migrations/ and is applied by hand with `npm run db:migrate` (a dump is saved first), before deploying code that
 * needs it. See .claude/docs/database.md.
 */
export const db = createTursoClient();
