/**
 * db.ts — the app's database, by hand (never on a cold start).
 *
 *   npm run db:migrate             apply db/migrations/NNN-name.sql not yet in schema_migrations, in order;
 *                                  a full dump is saved first (db/dumps/, git-ignored)
 *   npm run db:migrate -- --dry    list the pending migrations, change nothing
 *   npm run db:dump                a full dump only
 *
 * Reads TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (.env.local). A migration runs in one write batch (a transaction)
 * with its schema_migrations row, so it is applied whole or not at all. Restore a dump with
 * `turso db shell <db> < db/dumps/<file>.sql` into an empty database.
 *
 * Tables the app does not own are left alone: `material_words` belongs to the study repo
 * (phucbm/ou-chinese-language, `pnpm db:material`).
 */
import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIGRATIONS = path.join(ROOT, "db/migrations");
const DUMPS = path.join(ROOT, "db/dumps");

function client(): Client {
  const url = process.env.TURSO_DATABASE_URL, authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are needed (.env.local)");
  return createClient({ url, authToken });
}

const quote = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (v instanceof ArrayBuffer) return `X'${Buffer.from(v).toString("hex")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

/** Every table's schema and rows as SQL, to db/dumps/<time>-<label>.sql (mode 600). Returns the file and row counts. */
export async function dump(db: Client, label: string): Promise<{ file: string; rows: Record<string, number> }> {
  fs.mkdirSync(DUMPS, { recursive: true });
  const file = path.join(DUMPS, `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.sql`);
  const objects = await db.execute("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%' ORDER BY type = 'index', name");
  const out: string[] = ["PRAGMA foreign_keys=OFF;", "BEGIN TRANSACTION;"];
  const rows: Record<string, number> = {};
  for (const o of objects.rows) {
    out.push(`${o.sql};`);
    if (o.type !== "table") continue;
    const r = await db.execute(`SELECT * FROM "${o.name}"`);
    rows[o.name as string] = r.rows.length;
    for (const row of r.rows) out.push(`INSERT INTO "${o.name}" (${r.columns.map((c) => `"${c}"`).join(", ")}) VALUES (${r.columns.map((c) => quote(row[c])).join(", ")});`);
  }
  out.push("COMMIT;");
  fs.writeFileSync(file, `${out.join("\n")}\n`, { mode: 0o600 });
  return { file: path.relative(ROOT, file), rows };
}

/** A migration file as statements: split on `;` at a line's end, comments dropped. */
export function statements(sql: string): string[] {
  return sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
}

async function migrate(db: Client, dry: boolean) {
  await db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const applied = new Set((await db.execute("SELECT version FROM schema_migrations")).rows.map((r) => r.version as string));
  const files = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{3}-[a-z0-9-]+\.sql$/.test(f)).sort();
  const pending = files.filter((f) => !applied.has(f.slice(0, 3)));
  if (!pending.length) return console.log(`✓ up to date (${applied.size} applied)`);
  for (const f of pending) console.log(`${dry ? "pending" : "apply"}  ${f}`);
  if (dry) return;
  for (const f of pending) {
    const d = await dump(db, `before-${f.slice(0, -4)}`);
    console.log(`  dump ${d.file} (${Object.values(d.rows).reduce((a, b) => a + b, 0)} rows in ${Object.keys(d.rows).length} tables)`);
    const stmts = statements(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
    await db.batch([...stmts, { sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", args: [f.slice(0, 3), f.slice(4, -4), new Date().toISOString()] }], "write");
    console.log(`✓ ${f} (${stmts.length} statements)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...flags] = process.argv.slice(2);
  const db = client();
  try {
    if (cmd === "dump") {
      const d = await dump(db, "manual");
      console.log(`✓ ${d.file}`);
      for (const [t, n] of Object.entries(d.rows)) console.log(`  ${t.padEnd(24)} ${n}`);
    } else if (cmd === "migrate") await migrate(db, flags.includes("--dry"));
    else { console.log("tsx scripts/db.mts dump | migrate [--dry]"); process.exitCode = 2; }
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
