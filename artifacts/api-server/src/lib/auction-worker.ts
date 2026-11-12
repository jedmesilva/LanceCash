import { advanceAuctions } from "./lance-cash-db";
import { logger } from "./logger";

const tickIntervalMs = 1_000;
const retryIntervalMs = 5_000;

export function startAuctionWorker(): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => void tick(), delay);
    timer.unref();
  };

  const tick = async () => {
    try {
      await advanceAuctions();
      schedule(tickIntervalMs);
    } catch (error) {
      logger.error({ err: error }, "Auction worker tick failed");
      schedule(retryIntervalMs);
    }
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
