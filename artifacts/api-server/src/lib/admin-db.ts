import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  lt,
  or,
} from "drizzle-orm";
import {
  adminSettingsTable,
  auctionBidsTable,
  auctionsTable,
  db,
} from "@workspace/db";
import { lockAuctionLifecycle } from "./lance-cash-db";

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

async function readSystemBidsEnabled(): Promise<boolean> {
  const [settings] = await db
    .select({ enabled: adminSettingsTable.systemBidsEnabled })
    .from(adminSettingsTable)
    .where(eq(adminSettingsTable.id, 1))
    .limit(1);
  return settings?.enabled ?? true;
}

export async function readAdminOverview(watcherCount: number) {
  const [currentAuction] = await db
    .select()
    .from(auctionsTable)
    .where(eq(auctionsTable.status, "live"))
    .orderBy(desc(auctionsTable.id))
    .limit(1);

  const [previousRows, upcomingRows, automatedCount, systemBidsEnabled] =
    await Promise.all([
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
      currentAuction
        ? db
            .select({ value: count() })
            .from(auctionBidsTable)
            .where(
              and(
                eq(auctionBidsTable.auctionId, currentAuction.id),
                eq(auctionBidsTable.isAutomated, true),
              ),
            )
        : Promise.resolve([{ value: 0 }]),
      readSystemBidsEnabled(),
    ]);

  return {
    currentAuction: currentAuction ? mapAuction(currentAuction) : null,
    automatedBidCount: automatedCount[0]?.value ?? 0,
    watcherCount,
    systemBidsEnabled,
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
  search?: string;
  before?: number;
  limit: number;
}) {
  const [auction] = await db
    .select()
    .from(auctionsTable)
    .where(eq(auctionsTable.id, input.auctionId))
    .limit(1);
  if (!auction) return null;

  const filters = [eq(auctionBidsTable.auctionId, input.auctionId)];
  if (input.before !== undefined) {
    filters.push(lt(auctionBidsTable.bidNumber, input.before));
  }

  const search = input.search?.trim();
  if (search) {
    const matches = [ilike(auctionBidsTable.bidderName, `%${search}%`)];
    if (/^\d+$/.test(search)) {
      const bidNumber = Number(search);
      if (Number.isSafeInteger(bidNumber)) {
        matches.push(eq(auctionBidsTable.bidNumber, bidNumber));
      }
    }
    if (/^(sistema|autom[aá]tico|automated)$/i.test(search)) {
      matches.push(eq(auctionBidsTable.isAutomated, true));
    }
    filters.push(or(...matches)!);
  }

  const rows = await db
    .select()
    .from(auctionBidsTable)
    .where(and(...filters))
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
      isSystem: bid.isAutomated,
      createdAt: bid.createdAt.toISOString(),
    })),
    nextBefore: hasMore ? (bids.at(-1)?.bidNumber ?? null) : null,
    hasMore,
  };
}

function nextAutomatedBidAt(now: Date): Date {
  return new Date(now.getTime() + 2_500 + Math.random() * 18_500);
}

export async function updateSystemBidsEnabled(enabled: boolean) {
  return db.transaction(async (tx) => {
    await lockAuctionLifecycle(tx);

    const now = new Date();
    const [settings] = await tx
      .insert(adminSettingsTable)
      .values({ systemBidsEnabled: enabled, updatedAt: now })
      .onConflictDoUpdate({
        target: adminSettingsTable.id,
        set: { systemBidsEnabled: enabled, updatedAt: now },
      })
      .returning();

    const [currentAuction] = await tx
      .select({
        id: auctionsTable.id,
        bidCount: auctionsTable.bidCount,
        nextBotAt: auctionsTable.nextBotAt,
      })
      .from(auctionsTable)
      .where(eq(auctionsTable.status, "live"))
      .orderBy(desc(auctionsTable.id))
      .limit(1)
      .for("update");

    if (currentAuction) {
      const nextBotAt =
        enabled && currentAuction.bidCount > 0
          ? currentAuction.nextBotAt ?? nextAutomatedBidAt(now)
          : null;
      await tx
        .update(auctionsTable)
        .set({ nextBotAt })
        .where(eq(auctionsTable.id, currentAuction.id));
    }

    if (!settings) {
      throw new Error("Não foi possível salvar a configuração de lances.");
    }
    return {
      enabled: settings.systemBidsEnabled,
      updatedAt: settings.updatedAt.toISOString(),
    };
  });
}
