// Applies every SQL file in supabase/migrations/ to the live Postgres
// database, in lexicographic order. Designed for the hackathon path where
// the CLI's `supabase db push` is not yet configured.
//
// Usage:
//   SUPABASE_DB_URL='postgres://postgres:[YOUR-DB-PASSWORD]@db.zsrxnxjjgsiahlhtcshy.supabase.co:5432/postgres' \
//     node scripts/apply_migrations.mjs
//
//   # Or with the pooler (works from networks that block 5432):
//   SUPABASE_DB_URL='postgres://postgres.zsrxnxjjgsiahlhtcshy:[YOUR-DB-PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres' \
//     node scripts/apply_migrations.mjs
//
// Get the connection string from:
//   Supabase Studio → Project Settings → Database → Connection string
//
// Each migration file is executed inside its own transaction so a syntax
// error in one file doesn't leave the database half-migrated.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is required.");
  console.error(
    "Find the connection string in Supabase Studio → Settings → Database.",
  );
  process.exit(1);
}

let pg;
try {
  pg = await import("pg");
} catch {
  console.error(
    "The 'pg' package is not installed. Run: npm install --no-save pg",
  );
  process.exit(1);
}
const { Client } = pg.default ?? pg;

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.error("No .sql files found in supabase/migrations/.");
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("Connected.");

for (const file of files) {
  const sql = await readFile(join(migrationsDir.pathname, file), "utf8");
  console.log(`\n--- Applying ${file} ---`);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`✓ ${file}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(`✗ ${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("\nAll migrations applied.");
