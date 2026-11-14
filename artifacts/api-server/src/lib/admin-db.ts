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
  auctionPrizesTable,
  auctionsTable,
  bidPackagesTable,
  db,
  packagePurchasesTable,
  pool,
  prizeRedemptionsTable,
  usersTable,
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

type CashTransactionRow = {
  id: string;
  kind: "package_purchase" | "prize_redemption";
  direction: "inflow" | "outflow" | "pending" | "excluded";
  status:
    | "pending"
    | "paid"
    | "failed"
    | "refunded"
    | "requested"
    | "processing"
    | "fulfilled"
    | "rejected";
  amountCents: number;
  description: string;
  customerName: string;
  paymentProvider: string | null;
  createdAt: Date;
  settledAt: Date | null;
  packageId: string | null;
  packageBids: number | null;
  auctionId: number | null;
};

function safeCashCents(value: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Cash total is outside the safe integer range.");
  }
  return amount;
}

export async function readAdminCash(input: { offset: number; limit: number }) {
  const [{ rows: totalsRows }, { rows }] = await Promise.all([
    pool.query<{
      inflowCents: string;
      refundCents: string;
      prizeOutflowCents: string;
      pendingInflowCents: string;
      pendingOutflowCents: string;
      transactionCount: number;
    }>(`
      SELECT
        COALESCE((
          SELECT SUM(amount_cents)
          FROM public.package_purchases
          WHERE status = 'paid'
        ), 0)::text AS "inflowCents",
        COALESCE((
          SELECT SUM(amount_cents)
          FROM public.package_purchases
          WHERE status = 'refunded'
        ), 0)::text AS "refundCents",
        COALESCE((
          SELECT SUM(prize.prize_amount_cents)
          FROM public.prize_redemptions AS redemption
          INNER JOIN public.auction_prizes AS prize
            ON prize.id = redemption.prize_id
          WHERE redemption.status = 'fulfilled'
        ), 0)::text AS "prizeOutflowCents",
        COALESCE((
          SELECT SUM(amount_cents)
          FROM public.package_purchases
          WHERE status = 'pending'
        ), 0)::text AS "pendingInflowCents",
        COALESCE((
          SELECT SUM(prize.prize_amount_cents)
          FROM public.prize_redemptions AS redemption
          INNER JOIN public.auction_prizes AS prize
            ON prize.id = redemption.prize_id
          WHERE redemption.status IN ('requested', 'processing')
        ), 0)::text AS "pendingOutflowCents",
        (
          (SELECT COUNT(*) FROM public.package_purchases) +
          (SELECT COUNT(*) FROM public.prize_redemptions)
        )::int AS "transactionCount"
    `),
    pool.query<CashTransactionRow>(
      `
        SELECT *
        FROM (
          SELECT
            purchase.id::text AS id,
            'package_purchase'::text AS kind,
            CASE purchase.status::text
              WHEN 'paid' THEN 'inflow'
              WHEN 'refunded' THEN 'outflow'
              WHEN 'pending' THEN 'pending'
              ELSE 'excluded'
            END::text AS direction,
            purchase.status::text AS status,
            purchase.amount_cents AS "amountCents",
            'Compra do pacote ' || COALESCE(NULLIF(package.label, ''), purchase.package_id) AS description,
            customer.name AS "customerName",
            purchase.payment_provider AS "paymentProvider",
            purchase.created_at AS "createdAt",
            purchase.paid_at AS "settledAt",
            purchase.package_id AS "packageId",
            purchase.base_bids + purchase.bonus_bids AS "packageBids",
            NULL::integer AS "auctionId"
          FROM public.package_purchases AS purchase
          INNER JOIN public.users AS customer
            ON customer.id = purchase.user_id
          LEFT JOIN public.bid_packages AS package
            ON package.id = purchase.package_id

          UNION ALL

          SELECT
            redemption.id::text AS id,
            'prize_redemption'::text AS kind,
            CASE redemption.status::text
              WHEN 'fulfilled' THEN 'outflow'
              WHEN 'requested' THEN 'pending'
              WHEN 'processing' THEN 'pending'
              ELSE 'excluded'
            END::text AS direction,
            redemption.status::text AS status,
            prize.prize_amount_cents AS "amountCents",
            'Resgate do prêmio do leilão #' || prize.auction_id AS description,
            customer.name AS "customerName",
            NULL::text AS "paymentProvider",
            redemption.requested_at AS "createdAt",
            redemption.processed_at AS "settledAt",
            NULL::text AS "packageId",
            NULL::integer AS "packageBids",
            prize.auction_id AS "auctionId"
          FROM public.prize_redemptions AS redemption
          INNER JOIN public.auction_prizes AS prize
            ON prize.id = redemption.prize_id
          INNER JOIN public.users AS customer
            ON customer.id = redemption.user_id
        ) AS transaction_rows
        ORDER BY "createdAt" DESC, id DESC
        LIMIT $1 OFFSET $2
      `,
      [input.limit, input.offset],
    ),
  ]);

  const totals = totalsRows[0];
  if (!totals) throw new Error("Cash summary could not be loaded.");
  const inflowCents = safeCashCents(totals.inflowCents);
  const refundCents = safeCashCents(totals.refundCents);
  const prizeOutflowCents = safeCashCents(totals.prizeOutflowCents);
  const outflowCents = refundCents + prizeOutflowCents;
  const totalCount = totals.transactionCount;
  const hasMore = input.offset + rows.length < totalCount;

  return {
    summary: {
      inflowCents,
      refundCents,
      prizeOutflowCents,
      outflowCents,
      netCents: inflowCents - outflowCents,
      pendingInflowCents: safeCashCents(totals.pendingInflowCents),
      pendingOutflowCents: safeCashCents(totals.pendingOutflowCents),
      transactionCount: totalCount,
    },
    transactions: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      settledAt: row.settledAt?.toISOString() ?? null,
    })),
    totalCount,
    nextOffset: hasMore ? input.offset + rows.length : null,
    hasMore,
  };
}
