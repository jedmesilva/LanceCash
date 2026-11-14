import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be configured to apply the package purchase source migration.",
  );
}

const migration = await readFile(
  new URL("../migrations/0003_package_purchase_source.sql", import.meta.url),
  "utf8",
);
const client = new pg.Client({ connectionString });

try {
  await client.connect();

  const tableCheck = await client.query(
    `SELECT to_regclass('public.package_purchases') AS table_name`,
  );
  if (!tableCheck.rows[0]?.table_name) {
    throw new Error("The public.package_purchases table does not exist.");
  }

  await client.query(migration);

  const verification = await client.query(
    `SELECT source, count(*)::int AS purchase_count
     FROM public.package_purchases
     GROUP BY source
     ORDER BY source`,
  );
  console.log(JSON.stringify({ sourceCounts: verification.rows }));
} catch (error) {
  console.error("Could not apply the package purchase source migration.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
