import app from "./app";
import { advanceAuctions, ensureDemoData } from "./lib/lance-cash-db";
import { startAuctionWorker } from "./lib/auction-worker";
import { attachAuctionRealtime } from "./lib/auction-realtime";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  await ensureDemoData();
  await advanceAuctions();

  const server = app.listen(port, () => {
    const stopAuctionRealtime = attachAuctionRealtime(server);
    const stopAuctionWorker = startAuctionWorker();
    const shutdown = () => {
      stopAuctionWorker();
      stopAuctionRealtime();
      server.close(() => logger.info("Server stopped"));
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    logger.info({ port }, "Server listening");
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

void startServer().catch((err: unknown) => {
  logger.error({ err }, "Error initializing server");
  process.exit(1);
});
