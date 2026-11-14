import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be configured to apply the bid-source migration.");
}

const migration = await readFile(
  new URL("../migrations/0002_auction_bid_source.sql", import.meta.url),
  "utf8",
);
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(migration);

  const result = await client.query(
    `SELECT source, count(*)::int AS bid_count
     FROM public.auction_bids
     GROUP BY source
     ORDER BY source`,
  );
  console.log(JSON.stringify({ sourceCounts: result.rows }));
} catch (error) {
  console.error("Could not apply the targeted bid-source migration.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
