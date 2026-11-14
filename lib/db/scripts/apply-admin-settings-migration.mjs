import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be configured to apply the admin settings migration.");
}

const migration = await readFile(
  new URL("../migrations/0001_lance_cash_admin_settings.sql", import.meta.url),
  "utf8",
);
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(migration);
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'lance_cash_admin_settings'
     ORDER BY ordinal_position`,
  );
  const columns = result.rows.map((row) => row.column_name);
  const expectedColumns = ["id", "system_bids_enabled", "updated_at"];
  if (expectedColumns.some((column) => !columns.includes(column))) {
    throw new Error("The admin settings table does not match the expected schema.");
  }
  console.log("Admin settings table is ready.");
} catch {
  console.error("Could not apply the targeted admin settings migration.");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
