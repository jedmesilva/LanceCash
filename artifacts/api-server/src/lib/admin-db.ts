import {
  and,
  asc,
  desc,
  eq,
  gt,
  lt,
} from "drizzle-orm";
import {
  auctionBidsTable,
  auctionsTable,
  db,
} from "@workspace/db";

type AuctionRow = typeof auctionsTable.$inferSelect;
type AuctionStatus = "ended" | "upcoming";

function mapAuction(auction: AuctionRow) {
  return {
    id: auction.id,
    prize: Math.round(auction.prizeAmountCents / 100),
    status: auction.status,
    bidCount: auction.bidCount,
    leader: auction.currentLeaderName,
    startedAt: auction.startedAt?.toISOString() ?? null,
    endedAt: auction.status === "ended" ? auction.updatedAt.toISOString() : null,
  };
}

export async function readAdminOverview(watcherCount: number) {
  const [currentAuction] = await db
    .select()
    .from(auctionsTable)
    .where(eq(auctionsTable.status, "live"))
    .orderBy(desc(auctionsTable.id))
    .limit(1);

  const [previousRows, upcomingRows] = await Promise.all([
    db
      .select()
      .from(auctionsTable)
      .where(eq(auctionsTable.status, "ended"))
      .orderBy(desc(auctionsTable.id))
      .limit(5),
    db
      .select()
      .from(auctionsTable)
      .where(eq(auctionsTable.status, "upcoming"))
      .orderBy(asc(auctionsTable.id))
      .limit(5),
  ]);

  return {
    currentAuction: currentAuction ? mapAuction(currentAuction) : null,
    watcherCount,
    previousAuctions: previousRows.map(mapAuction),
    upcomingAuctions: upcomingRows.map(mapAuction),
  };
}

export async function readAdminAuctionPage(
  status: AuctionStatus,
  cursor: number | undefined,
  limit: number,
) {
  const rows =
    status === "ended"
      ? await db
          .select()
          .from(auctionsTable)
          .where(
            cursor === undefined
              ? eq(auctionsTable.status, "ended")
              : and(
                  eq(auctionsTable.status, "ended"),
                  lt(auctionsTable.id, cursor),
                ),
          )
          .orderBy(desc(auctionsTable.id))
          .limit(limit + 1)
      : await db
          .select()
          .from(auctionsTable)
          .where(
            cursor === undefined
              ? eq(auctionsTable.status, "upcoming")
              : and(
                  eq(auctionsTable.status, "upcoming"),
                  // Upcoming auctions are ordered from nearest to latest.
                  // The cursor stores the last ID from the preceding page.
                  // IDs increase with creation order.
                  gt(auctionsTable.id, cursor),
                ),
          )
          .orderBy(asc(auctionsTable.id))
          .limit(limit + 1);

  const hasMore = rows.length > limit;
  const auctions = rows.slice(0, limit);
  return {
    auctions: auctions.map(mapAuction),
    nextCursor: hasMore ? (auctions.at(-1)?.id ?? null) : null,
    hasMore,
  };
}

export async function readAdminAuctionBids(input: {
  auctionId: number;
  before?: number;
  limit: number;
}) {
  const [auction] = await db
    .select()
    .from(auctionsTable)
    .where(eq(auctionsTable.id, input.auctionId))
    .limit(1);
  if (!auction) return null;

  const rows = await db
    .select()
    .from(auctionBidsTable)
    .where(
      and(
        eq(auctionBidsTable.auctionId, input.auctionId),
        ...(input.before === undefined
          ? []
          : [lt(auctionBidsTable.bidNumber, input.before)]),
      ),
    )
    .orderBy(desc(auctionBidsTable.bidNumber))
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const bids = rows.slice(0, input.limit);

  return {
    auction: mapAuction(auction),
    bids: bids.map((bid) => ({
      id: bid.id,
      number: bid.bidNumber,
      leader: bid.bidderName,
      source: bid.source,
      createdAt: bid.createdAt.toISOString(),
    })),
    nextBefore: hasMore ? (bids.at(-1)?.bidNumber ?? null) : null,
    hasMore,
  };
}
