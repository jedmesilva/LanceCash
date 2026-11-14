import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  lt,
  sql,
} from "drizzle-orm";
import {
  adminSettingsTable,
  auctionBidsTable,
  auctionPrizesTable,
  auctionsTable,
  bidPackagesTable,
  db,
  packagePurchasesTable,
  prizeRedemptionsTable,
  userBidBalancesTable,
  userBidTransactionsTable,
  usersTable,
} from "@workspace/db";
import { hashPassword, verifyPassword } from "./passwords";
import {
  publishAuctionUpdate,
  type AuctionRealtimeUpdate,
} from "./auction-realtime";

type AuctionStatus = "live" | "ended" | "upcoming";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const auctionDurationMs = 15_000;
const historyPageSize = 12;
const initialPreviousAuctionCount = 2;
const initialNextAuctionCount = 1;
const demoEmail = "vitor@exemplo.com";
const seedLockId = 58_416_039;
const auctionLifecycleLockId = 58_416_040;
const bidderNames = [
  "Marina S.",
  "Lucas P.",
  "Ana C.",
  "Rafael M.",
  "Bia T.",
  "João V.",
  "Camila R.",
  "Pedro H.",
  "Larissa F.",
  "Thiago B.",
  "Julia N.",
  "Gustavo L.",
  "Fernanda A.",
  "Diego K.",
  "Letícia O.",
  "Bruno D.",
];
const packageSeeds = [
  { id: "starter", baseBids: 15, bonusBids: 0, priceCents: 1500, label: "Para começar", sortOrder: 1 },
  { id: "value", baseBids: 50, bonusBids: 5, priceCents: 4500, label: null, sortOrder: 2 },
  { id: "popular", baseBids: 120, bonusBids: 20, priceCents: 9900, label: "Mais popular", sortOrder: 3 },
  { id: "best", baseBids: 300, bonusBids: 75, priceCents: 21000, label: "Melhor valor", sortOrder: 4 },
];
const upcomingPrizesCents = [50_000, 200_000, 100_000, 500_000, 100_000, 50_000, 200_000];

let demoDataReady = false;

function nameForBid(auctionId: number, bidNumber: number): string {
  const index =
    (Math.imul(bidNumber + auctionId * 977, 2654435761) >>> 0) %
    bidderNames.length;
  return bidderNames[index];
}

async function seedAuction(
  tx: Transaction,
  input: {
    prizeAmountCents: number;
    status: AuctionStatus;
    startedAt: Date | null;
    deadlineAt: Date | null;
    nextBotAt: Date | null;
    bidCount: number;
    bidStartAt: Date;
  },
): Promise<void> {
  const [auction] = await tx
    .insert(auctionsTable)
    .values({
      prizeAmountCents: input.prizeAmountCents,
      status: input.status,
      startedAt: input.startedAt,
      deadlineAt: input.deadlineAt,
      nextBotAt: input.nextBotAt,
      bidCount: input.bidCount,
      currentLeaderName: "",
    })
    .returning({ id: auctionsTable.id });

  if (!auction || input.bidCount === 0) return;

  const names = Array.from({ length: input.bidCount }, (_, index) =>
    nameForBid(auction.id, index + 1),
  );
  await tx
    .update(auctionsTable)
    .set({ currentLeaderName: names.at(-1) ?? "" })
    .where(eq(auctionsTable.id, auction.id));

  const createdAt = input.bidStartAt.getTime();
  await tx.insert(auctionBidsTable).values(
    names.map((bidderName, index) => ({
      auctionId: auction.id,
      bidNumber: index + 1,
      bidderName,
      isAutomated: true,
      createdAt: new Date(
        createdAt + ((index + 1) / input.bidCount) * 60_000,
      ),
    })),
  );
}

export async function ensureDemoData(): Promise<string> {
  if (demoDataReady) {
    const [demoUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.isDemo, true))
      .limit(1);
    if (demoUser) return demoUser.id;
    demoDataReady = false;
  }

  const demoUserId = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${seedLockId})`);
    await tx
      .insert(usersTable)
      .values({ name: "Vitor Almeida", email: demoEmail, isDemo: true })
      .onConflictDoNothing();

    const [demoUser] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.isDemo, true))
      .limit(1);
    if (!demoUser) {
      throw new Error("Não foi possível criar a conta de demonstração.");
    }

    await tx.insert(bidPackagesTable).values(packageSeeds).onConflictDoNothing();

    const [existingAuction] = await tx
      .select({ id: auctionsTable.id })
      .from(auctionsTable)
      .limit(1);

    if (!existingAuction) {
      const now = new Date();
      const pastAuctions = [
        { prizeAmountCents: 50_000, minutesAgo: 41, bidCount: 40 },
        { prizeAmountCents: 200_000, minutesAgo: 24, bidCount: 32 },
        { prizeAmountCents: 100_000, minutesAgo: 9, bidCount: 24 },
      ];

      for (const item of pastAuctions) {
        const startedAt = new Date(now.getTime() - item.minutesAgo * 60_000);
        await seedAuction(tx, {
          prizeAmountCents: item.prizeAmountCents,
          status: "ended",
          startedAt,
          deadlineAt: null,
          nextBotAt: null,
          bidCount: item.bidCount,
          bidStartAt: startedAt,
        });
      }

      const liveStartedAt = new Date(now.getTime() - 60_000);
      await seedAuction(tx, {
        prizeAmountCents: 100_000,
        status: "live",
        startedAt: liveStartedAt,
        deadlineAt: new Date(now.getTime() + auctionDurationMs),
        nextBotAt: new Date(now.getTime() + 3_000),
        bidCount: 40,
        bidStartAt: new Date(now.getTime() - 60_000),
      });

      await seedAuction(tx, {
        prizeAmountCents: upcomingPrizesCents[4],
        status: "upcoming",
        startedAt: null,
        deadlineAt: null,
        nextBotAt: null,
        bidCount: 0,
        bidStartAt: now,
      });
    }

    return demoUser.id;
  });

  demoDataReady = true;
  return demoUserId;
}

async function getCurrentAuction(tx: Transaction) {
  const [liveAuction] = await tx
    .select()
    .from(auctionsTable)
    .where(eq(auctionsTable.status, "live"))
    .orderBy(desc(auctionsTable.id))
    .limit(1);
  if (liveAuction) return liveAuction;

  const [latestEndedAuction] = await tx
    .select()
    .from(auctionsTable)
    .where(eq(auctionsTable.status, "ended"))
    .orderBy(desc(auctionsTable.id))
    .limit(1);
  return latestEndedAuction;
}

function createAuctionRealtimeUpdate(
  auction: typeof auctionsTable.$inferSelect,
  options: Partial<Omit<AuctionRealtimeUpdate, "type" | "auctionId" | "prize">> = {},
): AuctionRealtimeUpdate {
  return {
    type: "auction:update",
    auctionId: auction.id,
    prize: Math.round(auction.prizeAmountCents / 100),
    currentAuctionId: options.currentAuctionId ?? auction.id,
    status: options.status ?? auction.status,
    bidCount: options.bidCount ?? auction.bidCount,
    leader: options.leader ?? auction.currentLeaderName,
    startedAt: options.startedAt !== undefined ? options.startedAt : toIso(auction.startedAt),
    deadlineAt: options.deadlineAt !== undefined ? options.deadlineAt : toIso(auction.deadlineAt),
    serverTime: options.serverTime ?? new Date().toISOString(),
    bid: options.bid ?? null,
  };
}

async function advanceCurrentAuction(
  tx: Transaction,
): Promise<AuctionRealtimeUpdate | null> {
  const [auction] = await tx
    .select()
    .from(auctionsTable)
    .where(eq(auctionsTable.status, "live"))
    .orderBy(desc(auctionsTable.id))
    .limit(1)
    .for("update");
  if (!auction) return null;

  const now = new Date();
  if (auction.bidCount === 0) return null;

  if (auction.deadlineAt && now >= auction.deadlineAt) {
    await tx
      .update(auctionsTable)
      .set({ status: "ended", deadlineAt: null, nextBotAt: null })
      .where(eq(auctionsTable.id, auction.id));

    if (auction.currentLeaderUserId) {
      await tx
        .insert(auctionPrizesTable)
        .values({
          auctionId: auction.id,
          userId: auction.currentLeaderUserId,
          prizeAmountCents: auction.prizeAmountCents,
          wonAt: now,
        })
        .onConflictDoNothing();
    }
    return createAuctionRealtimeUpdate(auction, {
      status: "ended",
      deadlineAt: null,
      serverTime: now.toISOString(),
    });
  }

  const [settings] = await tx
    .select({ systemBidsEnabled: adminSettingsTable.systemBidsEnabled })
    .from(adminSettingsTable)
    .where(eq(adminSettingsTable.id, 1))
    .limit(1);
  if (settings?.systemBidsEnabled === false) {
    if (auction.nextBotAt) {
      await tx
        .update(auctionsTable)
        .set({ nextBotAt: null })
        .where(eq(auctionsTable.id, auction.id));
    }
    return null;
  }
  if (!auction.nextBotAt || now < auction.nextBotAt) return null;

  const bidNumber = auction.bidCount + 1;
  const bidderName =
    bidderNames[Math.floor(Math.random() * bidderNames.length)] ?? "Participante";
  const nextBotAt = new Date(
    now.getTime() + 2_500 + Math.random() * 18_500,
  );

  await tx.insert(auctionBidsTable).values({
    auctionId: auction.id,
    bidNumber,
    bidderName,
    isAutomated: true,
    createdAt: now,
  });
  const deadlineAt = new Date(now.getTime() + auctionDurationMs);
  await tx
    .update(auctionsTable)
    .set({
      bidCount: bidNumber,
      currentLeaderName: bidderName,
      currentLeaderUserId: null,
      deadlineAt,
      nextBotAt,
    })
    .where(eq(auctionsTable.id, auction.id));

  return createAuctionRealtimeUpdate(auction, {
    status: "live",
    bidCount: bidNumber,
    leader: bidderName,
    deadlineAt: deadlineAt.toISOString(),
    serverTime: now.toISOString(),
    bid: {
      number: bidNumber,
      leader: bidderName,
      createdAt: now.toISOString(),
    },
  });
}

async function ensureUpcomingAuction(
  tx: Transaction,
  currentAuctionId?: number,
): Promise<AuctionRealtimeUpdate | null> {
  const [upcomingAuction] = await tx
    .select({ id: auctionsTable.id })
    .from(auctionsTable)
    .where(eq(auctionsTable.status, "upcoming"))
    .limit(1);
  if (upcomingAuction) return null;

  const [latestAuction] = await tx
    .select({ id: auctionsTable.id })
    .from(auctionsTable)
    .orderBy(desc(auctionsTable.id))
    .limit(1);
  const nextId = (latestAuction?.id ?? 0) + 1;
  const prizeAmountCents =
    upcomingPrizesCents[nextId % upcomingPrizesCents.length] ?? 100_000;
  const [createdAuction] = await tx
    .insert(auctionsTable)
    .values({
      prizeAmountCents,
      status: "upcoming",
      bidCount: 0,
      currentLeaderName: "",
    })
    .returning();
  if (!createdAuction) return null;

  const activeId =
    currentAuctionId ?? (await getCurrentAuction(tx))?.id ?? createdAuction.id;
  return createAuctionRealtimeUpdate(createdAuction, {
    currentAuctionId: activeId,
  });
}

async function openNextAuction(
  tx: Transaction,
): Promise<AuctionRealtimeUpdate | null> {
  const current = await getCurrentAuction(tx);
  if (!current || current.status !== "ended") return null;

  const [nextAuction] = await tx
    .select()
    .from(auctionsTable)
    .where(eq(auctionsTable.status, "upcoming"))
    .orderBy(asc(auctionsTable.id))
    .limit(1)
    .for("update");
  if (!nextAuction) return null;

  const now = new Date();
  const startedAt = now;
  // The database requires timestamps for live auctions. While there are no bids,
  // this deadline is a placeholder and is hidden from clients until the first bid.
  const deadlineAt = new Date(now.getTime() + auctionDurationMs);
  await tx
    .update(auctionsTable)
    .set({
      status: "live",
      startedAt,
      deadlineAt,
      nextBotAt: null,
    })
    .where(eq(auctionsTable.id, nextAuction.id));

  return createAuctionRealtimeUpdate(nextAuction, {
    currentAuctionId: nextAuction.id,
    status: "live",
    bidCount: 0,
    leader: "",
    startedAt: startedAt.toISOString(),
    deadlineAt: null,
    serverTime: now.toISOString(),
  });
}

export async function lockAuctionLifecycle(tx: Transaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${auctionLifecycleLockId})`);
}

export async function advanceAuctions(): Promise<void> {
  const updates = await db.transaction(async (tx) => {
    await lockAuctionLifecycle(tx);
    const events: AuctionRealtimeUpdate[] = [];
    const currentUpdate = await advanceCurrentAuction(tx);
    if (currentUpdate) events.push(currentUpdate);
    const scheduledUpdate = await ensureUpcomingAuction(
      tx,
      currentUpdate?.currentAuctionId,
    );
    if (scheduledUpdate) events.push(scheduledUpdate);
    const openedUpdate = await openNextAuction(tx);
    if (openedUpdate) events.push(openedUpdate);
    const currentAuction = await getCurrentAuction(tx);
    const nextScheduledUpdate = await ensureUpcomingAuction(
      tx,
      currentAuction?.id,
    );
    if (nextScheduledUpdate) events.push(nextScheduledUpdate);
    return events;
  });
  for (const update of updates) publishAuctionUpdate(update);
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

async function mapAuctionStates(
  tx: Transaction,
  auctions: (typeof auctionsTable.$inferSelect)[],
  userId: string | null,
  currentAuctionId: number,
) {
  return Promise.all(
    auctions.map(async (auction) => {
      const bidRecords = await tx
        .select()
        .from(auctionBidsTable)
        .where(eq(auctionBidsTable.auctionId, auction.id))
        .orderBy(desc(auctionBidsTable.bidNumber))
        .limit(historyPageSize);
      let usedBids = 0;
      if (userId && auction.id === currentAuctionId) {
        const [usedBidsResult] = await tx
          .select({ value: count() })
          .from(auctionBidsTable)
          .where(
            and(
              eq(auctionBidsTable.auctionId, currentAuctionId),
              eq(auctionBidsTable.userId, userId),
            ),
          );
        usedBids = usedBidsResult?.value ?? 0;
      }

      return {
        id: auction.id,
        prize: Math.round(auction.prizeAmountCents / 100),
        status: auction.status,
        bidCount: auction.bidCount,
        leader:
          userId !== null && auction.currentLeaderUserId === userId
            ? "Você"
            : auction.currentLeaderName,
        startedAt: toIso(auction.startedAt),
        deadlineAt:
          auction.status === "live" && auction.bidCount === 0
            ? null
            : toIso(auction.deadlineAt),
        usedBids,
        bids: bidRecords.map((bid) => ({
          number: bid.bidNumber,
          leader:
            userId !== null && bid.userId === userId ? "Você" : bid.bidderName,
          createdAt: bid.createdAt.toISOString(),
        })),
        historyHasMore: auction.bidCount > bidRecords.length,
      };
    }),
  );
}

export async function readState(userId: string) {
  return db.transaction(async (tx) => {
    const currentAuction = await getCurrentAuction(tx);
    if (!currentAuction) {
      throw new Error("Nenhum leilão está cadastrado.");
    }

    const [user] = await tx
      .select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const [wallet] = await tx
      .select({ balance: userBidBalancesTable.balance })
      .from(userBidBalancesTable)
      .where(eq(userBidBalancesTable.userId, userId))
      .limit(1);
    const previousAuctions = await tx
      .select()
      .from(auctionsTable)
      .where(lt(auctionsTable.id, currentAuction.id))
      .orderBy(desc(auctionsTable.id))
      .limit(initialPreviousAuctionCount + 1);
    const nextAuctions = await tx
      .select()
      .from(auctionsTable)
      .where(gt(auctionsTable.id, currentAuction.id))
      .orderBy(asc(auctionsTable.id))
      .limit(initialNextAuctionCount + 1);
    const previousWindow = previousAuctions
      .slice(0, initialPreviousAuctionCount)
      .reverse();
    const nextWindow = nextAuctions.slice(0, initialNextAuctionCount);
    const auctionRows = [...previousWindow, currentAuction, ...nextWindow];
    const auctionStates = await mapAuctionStates(
      tx,
      auctionRows,
      userId,
      currentAuction.id,
    );
    const packages = await tx
      .select()
      .from(bidPackagesTable)
      .where(eq(bidPackagesTable.isActive, true))
      .orderBy(asc(bidPackagesTable.sortOrder));
    const prizeRecords = await tx
      .select({
        auctionId: auctionPrizesTable.auctionId,
        prizeAmountCents: auctionPrizesTable.prizeAmountCents,
        wonAt: auctionPrizesTable.wonAt,
        redemptionId: prizeRedemptionsTable.id,
      })
      .from(auctionPrizesTable)
      .leftJoin(
        prizeRedemptionsTable,
        eq(prizeRedemptionsTable.prizeId, auctionPrizesTable.id),
      )
      .where(eq(auctionPrizesTable.userId, userId))
      .orderBy(asc(auctionPrizesTable.wonAt));

    return {
      balance: wallet?.balance ?? 0,
      currentAuctionId: currentAuction.id,
      serverTime: new Date().toISOString(),
      user: user ?? null,
      auctions: auctionStates,
      auctionPagination: {
        previousCursor: auctionRows[0]?.id ?? null,
        nextCursor: auctionRows.at(-1)?.id ?? null,
        hasPrevious: previousAuctions.length > initialPreviousAuctionCount,
        hasNext: nextAuctions.length > initialNextAuctionCount,
      },
      packages: packages.map((pack) => ({
        id: pack.id,
        bids: pack.baseBids,
        bonus: pack.bonusBids,
        price: Math.round(pack.priceCents / 100),
        label: pack.label,
      })),
      prizes: prizeRecords.map((prize) => ({
        auctionId: prize.auctionId,
        prize: Math.round(prize.prizeAmountCents / 100),
        wonAt: prize.wonAt.toISOString(),
        redeemed: prize.redemptionId !== null,
      })),
    };
  }, { isolationLevel: "repeatable read" });
}

export async function readAuctionPage(
  userId: string | null,
  direction: "previous" | "next",
  cursor: number,
  limit: number,
) {
  return db.transaction(async (tx) => {
    const currentAuction = await getCurrentAuction(tx);
    if (!currentAuction) {
      throw new Error("Nenhum leilão está cadastrado.");
    }

    const rows = direction === "previous"
      ? await tx
        .select()
        .from(auctionsTable)
        .where(lt(auctionsTable.id, cursor))
        .orderBy(desc(auctionsTable.id))
        .limit(limit + 1)
      : await tx
        .select()
        .from(auctionsTable)
        .where(gt(auctionsTable.id, cursor))
        .orderBy(asc(auctionsTable.id))
        .limit(limit + 1);
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    if (direction === "previous") pageRows.reverse();
    const auctions = await mapAuctionStates(
      tx,
      pageRows,
      userId,
      currentAuction.id,
    );
    const nextCursor = direction === "previous"
      ? pageRows[0]?.id
      : pageRows.at(-1)?.id;

    return {
      auctions,
      direction,
      cursor: nextCursor ?? null,
      hasMore,
    };
  });
}

export async function readPublicState() {
  const [demoUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isDemo, true))
    .limit(1);
  if (!demoUser) {
    throw new Error("A conta de demonstração não foi inicializada.");
  }
  const state = await readState(demoUser.id);
  return {
    ...state,
    balance: 0,
    user: null,
    prizes: [],
    auctions: state.auctions.map((auction) => ({
      ...auction,
      leader: auction.leader === "Você" ? "Participante" : auction.leader,
      usedBids: 0,
      bids: auction.bids.map((bid) => ({
        ...bid,
        leader: bid.leader === "Você" ? "Participante" : bid.leader,
      })),
    })),
  };
}

export async function readOlderBids(
  userId: string | null,
  auctionId: number,
  before: number,
) {
  return db.transaction(async (tx) => {
    const [auction] = await tx
      .select({ id: auctionsTable.id, bidCount: auctionsTable.bidCount })
      .from(auctionsTable)
      .where(eq(auctionsTable.id, auctionId))
      .limit(1);
    if (!auction) return null;

    const bids = await tx
      .select()
      .from(auctionBidsTable)
      .where(
        and(
          eq(auctionBidsTable.auctionId, auctionId),
          lt(auctionBidsTable.bidNumber, before),
        ),
      )
      .orderBy(desc(auctionBidsTable.bidNumber))
      .limit(historyPageSize);
    const lastBid = bids.at(-1);
    const hasMore = Boolean(lastBid && lastBid.bidNumber > 1);

    return {
      bids: bids.map((bid) => ({
        number: bid.bidNumber,
        leader: userId !== null && bid.userId === userId ? "Você" : bid.bidderName,
        createdAt: bid.createdAt.toISOString(),
      })),
      nextBefore: hasMore ? (lastBid?.bidNumber ?? null) : null,
      hasMore,
    };
  });
}

export async function placeBid(userId: string, auctionId: number) {
  const result = await db.transaction(async (tx) => {
    await lockAuctionLifecycle(tx);
    const events: AuctionRealtimeUpdate[] = [];
    const lifecycleUpdate = await advanceCurrentAuction(tx);
    if (lifecycleUpdate) events.push(lifecycleUpdate);
    let current = await getCurrentAuction(tx);
    if (current?.status === "ended") {
      const openedUpdate = await openNextAuction(tx);
      if (openedUpdate) {
        events.push(openedUpdate);
        const scheduledUpdate = await ensureUpcomingAuction(
          tx,
          openedUpdate.currentAuctionId,
        );
        if (scheduledUpdate) events.push(scheduledUpdate);
      }
      current = await getCurrentAuction(tx);
    }

    current = await getCurrentAuction(tx);
    if (!current || current.id !== auctionId || current.status !== "live") {
      return { error: "Este leilão não está ao vivo.", events } as const;
    }
    if (current.currentLeaderUserId === userId) {
      return { error: "Você deu o último lance.", events } as const;
    }

    const [wallet] = await tx
      .update(userBidBalancesTable)
      .set({
        balance: sql`${userBidBalancesTable.balance} - 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userBidBalancesTable.userId, userId),
          gte(userBidBalancesTable.balance, 1),
        ),
      )
      .returning({ balance: userBidBalancesTable.balance });
    if (!wallet) {
      return {
        error: "Seu saldo acabou. Compre lances para continuar.",
        events,
      } as const;
    }

    const bidNumber = current.bidCount + 1;
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + auctionDurationMs);
    const [systemBidSettings] = await tx
      .select({ enabled: adminSettingsTable.systemBidsEnabled })
      .from(adminSettingsTable)
      .where(eq(adminSettingsTable.id, 1))
      .limit(1);
    const [bid] = await tx
      .insert(auctionBidsTable)
      .values({
        auctionId: current.id,
        bidNumber,
        userId,
        bidderName: "Você",
        isAutomated: false,
        createdAt: now,
      })
      .returning({ id: auctionBidsTable.id });

    await tx.insert(userBidTransactionsTable).values({
      userId,
      type: "bid_spent",
      amount: -1,
      balanceAfter: wallet.balance,
      referenceType: "auction_bid",
      referenceId: String(bid?.id ?? `${current.id}:${bidNumber}`),
      description: `Lance ${bidNumber} no leilão ${current.id}`,
    });
    await tx
      .update(auctionsTable)
      .set({
        startedAt: current.startedAt ?? now,
        bidCount: bidNumber,
        currentLeaderName: "Você",
        currentLeaderUserId: userId,
        deadlineAt,
        nextBotAt:
          systemBidSettings?.enabled === false
            ? null
            : new Date(now.getTime() + 2_500 + Math.random() * 18_500),
      })
      .where(eq(auctionsTable.id, current.id));

    events.push(createAuctionRealtimeUpdate(current, {
      currentAuctionId: current.id,
      status: "live",
      bidCount: bidNumber,
      leader: "Você",
      startedAt: current.startedAt?.toISOString() ?? now.toISOString(),
      deadlineAt: deadlineAt.toISOString(),
      serverTime: now.toISOString(),
      bid: {
        number: bidNumber,
        leader: "Você",
        createdAt: now.toISOString(),
      },
    }));

    return { ok: true as const, events };
  });

  for (const event of result.events) publishAuctionUpdate(event);
  if ("error" in result) return result;
  return { state: await readState(userId) };
}

export async function purchasePackage(
  userId: string,
  packageId: string,
  requestId?: string,
) {
  const idempotencyKey = requestId ?? randomUUID();
  const result = await db.transaction(async (tx) => {
    const [pack] = await tx
      .select()
      .from(bidPackagesTable)
      .where(
        and(
          eq(bidPackagesTable.id, packageId),
          eq(bidPackagesTable.isActive, true),
        ),
      )
      .limit(1);
    if (!pack) return { error: "Pacote inválido." } as const;

    const [existingPurchase] = await tx
      .select()
      .from(packagePurchasesTable)
      .where(eq(packagePurchasesTable.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existingPurchase) {
      if (
        existingPurchase.userId !== userId ||
        existingPurchase.packageId !== packageId
      ) {
        return { error: "Esta solicitação de compra já foi utilizada." } as const;
      }
      return { ok: true as const };
    }

    const now = new Date();
    const [purchase] = await tx
      .insert(packagePurchasesTable)
      .values({
        userId,
        packageId: pack.id,
        baseBids: pack.baseBids,
        bonusBids: pack.bonusBids,
        amountCents: pack.priceCents,
        paymentProvider: "simulated_pix",
        status: "paid",
        idempotencyKey,
        paidAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: packagePurchasesTable.id });

    if (!purchase) {
      const [racedPurchase] = await tx
        .select()
        .from(packagePurchasesTable)
        .where(eq(packagePurchasesTable.idempotencyKey, idempotencyKey))
        .limit(1);
      if (
        !racedPurchase ||
        racedPurchase.userId !== userId ||
        racedPurchase.packageId !== packageId
      ) {
        return { error: "Esta solicitação de compra já foi utilizada." } as const;
      }
      return { ok: true as const };
    }

    const credit = pack.baseBids + pack.bonusBids;
    const [wallet] = await tx
      .update(userBidBalancesTable)
      .set({
        balance: sql`${userBidBalancesTable.balance} + ${credit}`,
        updatedAt: now,
      })
      .where(eq(userBidBalancesTable.userId, userId))
      .returning({ balance: userBidBalancesTable.balance });
    if (!wallet) {
      throw new Error("O saldo de lances da conta não foi encontrado.");
    }

    await tx.insert(userBidTransactionsTable).values({
      userId,
      type: "package_purchase",
      amount: credit,
      balanceAfter: wallet.balance,
      referenceType: "package_purchase",
      referenceId: purchase.id,
      description: `Compra do pacote ${pack.id} via Pix simulado`,
    });
    return { ok: true as const };
  });

  if ("error" in result) return result;
  return { state: await readState(userId) };
}

export async function updateProfile(
  userId: string,
  input: { name: string },
) {
  const name = input.name.trim();
  if (name.length < 2) {
    return { error: "Informe um nome com pelo menos 2 caracteres." } as const;
  }
  if (name.length > 120) {
    return { error: "O nome deve ter no máximo 120 caracteres." } as const;
  }

  await db
    .update(usersTable)
    .set({ name, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  return { state: await readState(userId) };
}

export async function changePassword(
  userId: string,
  input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
) {
  if (!input.currentPassword) {
    return { error: "Informe a senha atual." } as const;
  }
  if (input.newPassword.length < 8) {
    return {
      error: "A nova senha precisa ter ao menos 8 caracteres.",
    } as const;
  }
  if (input.newPassword.length > 200) {
    return { error: "A nova senha deve ter no máximo 200 caracteres." } as const;
  }
  if (input.newPassword === input.currentPassword) {
    return { error: "A nova senha deve ser diferente da atual." } as const;
  }
  if (input.confirmPassword !== input.newPassword) {
    return { error: "As senhas não coincidem." } as const;
  }

  const [account] = await db
    .select({ passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!account?.passwordHash) {
    return {
      error: "Esta conta não possui uma senha para alterar.",
    } as const;
  }
  if (!(await verifyPassword(input.currentPassword, account.passwordHash))) {
    return { error: "A senha atual está incorreta." } as const;
  }
  await db
    .update(usersTable)
    .set({
      passwordHash: await hashPassword(input.newPassword),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));

  return { state: await readState(userId) };
}

export async function redeemPrize(userId: string, auctionId: number) {
  const result = await db.transaction(async (tx) => {
    await lockAuctionLifecycle(tx);
    await advanceCurrentAuction(tx);
    const [prize] = await tx
      .select()
      .from(auctionPrizesTable)
      .where(
        and(
          eq(auctionPrizesTable.auctionId, auctionId),
          eq(auctionPrizesTable.userId, userId),
        ),
      )
      .limit(1)
      .for("update");
    if (!prize) return { error: "Prêmio não encontrado." } as const;

    const [existingRedemption] = await tx
      .select({ id: prizeRedemptionsTable.id })
      .from(prizeRedemptionsTable)
      .where(eq(prizeRedemptionsTable.prizeId, prize.id))
      .limit(1);
    if (existingRedemption) {
      return { error: "Este prêmio já foi resgatado." } as const;
    }

    const now = new Date();
    await tx.insert(prizeRedemptionsTable).values({
      prizeId: prize.id,
      userId,
      status: "fulfilled",
      notes: "Resgate confirmado no protótipo",
      processedAt: now,
    });
    return { ok: true as const };
  });

  if ("error" in result) return result;
  return { state: await readState(userId) };
}
