import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  lt,
  sql,
} from "drizzle-orm";
import {
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

type AuctionStatus = "live" | "ended" | "upcoming";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const auctionDurationMs = 15_000;
const historyPageSize = 12;
const demoEmail = "vitor@exemplo.com";
const seedLockId = 58_416_039;
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

async function advanceCurrentAuction(tx: Transaction): Promise<void> {
  const [auction] = await tx
    .select()
    .from(auctionsTable)
    .where(eq(auctionsTable.status, "live"))
    .orderBy(desc(auctionsTable.id))
    .limit(1)
    .for("update");
  if (!auction) return;

  const now = new Date();
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
    return;
  }

  if (!auction.nextBotAt || now < auction.nextBotAt) return;

  const bidNumber = auction.bidCount + 1;
  const bidderName =
    bidderNames[Math.floor(Math.random() * bidderNames.length)] ?? "Participante";
  const nextBotAt = new Date(
    now.getTime() + 2_500 + Math.random() * 3_500,
  );

  await tx.insert(auctionBidsTable).values({
    auctionId: auction.id,
    bidNumber,
    bidderName,
    isAutomated: true,
    createdAt: now,
  });
  await tx
    .update(auctionsTable)
    .set({
      bidCount: bidNumber,
      currentLeaderName: bidderName,
      currentLeaderUserId: null,
      deadlineAt: new Date(now.getTime() + auctionDurationMs),
      nextBotAt,
    })
    .where(eq(auctionsTable.id, auction.id));
}

async function ensureUpcomingAuction(tx: Transaction): Promise<void> {
  const [upcomingAuction] = await tx
    .select({ id: auctionsTable.id })
    .from(auctionsTable)
    .where(eq(auctionsTable.status, "upcoming"))
    .limit(1);
  if (upcomingAuction) return;

  const [latestAuction] = await tx
    .select({ id: auctionsTable.id })
    .from(auctionsTable)
    .orderBy(desc(auctionsTable.id))
    .limit(1);
  const nextId = (latestAuction?.id ?? 0) + 1;
  const prizeAmountCents =
    upcomingPrizesCents[nextId % upcomingPrizesCents.length] ?? 100_000;
  await tx.insert(auctionsTable).values({
    prizeAmountCents,
    status: "upcoming",
    bidCount: 0,
    currentLeaderName: "",
  });
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function readState(userId: string) {
  return db.transaction(async (tx) => {
    await advanceCurrentAuction(tx);
    await ensureUpcomingAuction(tx);
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
    const auctions = await tx
      .select()
      .from(auctionsTable)
      .orderBy(asc(auctionsTable.id));
    const packages = await tx
      .select()
      .from(bidPackagesTable)
      .where(eq(bidPackagesTable.isActive, true))
      .orderBy(asc(bidPackagesTable.sortOrder));
    const [usedBidsResult] = await tx
      .select({ value: count() })
      .from(auctionBidsTable)
      .where(
        and(
          eq(auctionBidsTable.auctionId, currentAuction.id),
          eq(auctionBidsTable.userId, userId),
        ),
      );
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

    const auctionStates = [];
    for (const auction of auctions) {
      const bidRecords = await tx
        .select()
        .from(auctionBidsTable)
        .where(eq(auctionBidsTable.auctionId, auction.id))
        .orderBy(desc(auctionBidsTable.bidNumber))
        .limit(historyPageSize);
      auctionStates.push({
        id: auction.id,
        prize: Math.round(auction.prizeAmountCents / 100),
        status: auction.status,
        bidCount: auction.bidCount,
        leader:
          auction.currentLeaderUserId === userId
            ? "Você"
            : auction.currentLeaderName,
        startedAt: toIso(auction.startedAt),
        deadlineAt: toIso(auction.deadlineAt),
        usedBids:
          auction.id === currentAuction.id ? (usedBidsResult?.value ?? 0) : 0,
        bids: bidRecords.map((bid) => ({
          number: bid.bidNumber,
          leader: bid.userId === userId ? "Você" : bid.bidderName,
          createdAt: bid.createdAt.toISOString(),
        })),
        historyHasMore: auction.bidCount > bidRecords.length,
      });
    }

    return {
      balance: wallet?.balance ?? 0,
      currentAuctionId: currentAuction.id,
      serverTime: new Date().toISOString(),
      user: user ?? null,
      auctions: auctionStates,
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
  });
}

export async function readPublicState() {
  const demoUserId = await ensureDemoData();
  const state = await readState(demoUserId);
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
    await advanceCurrentAuction(tx);
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
    await advanceCurrentAuction(tx);
    let current = await getCurrentAuction(tx);
    if (current?.status === "ended") {
      const [target] = await tx
        .select()
        .from(auctionsTable)
        .where(eq(auctionsTable.id, auctionId))
        .limit(1)
        .for("update");

      if (target?.status === "upcoming") {
        const now = new Date();
        await tx
          .update(auctionsTable)
          .set({
            status: "live",
            startedAt: now,
            deadlineAt: new Date(now.getTime() + auctionDurationMs),
            nextBotAt: new Date(now.getTime() + 3_000),
          })
          .where(eq(auctionsTable.id, target.id));
        await ensureUpcomingAuction(tx);
        return { ok: true as const };
      }
    }

    current = await getCurrentAuction(tx);
    if (!current || current.id !== auctionId || current.status !== "live") {
      return { error: "Este leilão não está ao vivo." } as const;
    }
    if (current.currentLeaderUserId === userId) {
      return { error: "Você deu o último lance." } as const;
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
      } as const;
    }

    const bidNumber = current.bidCount + 1;
    const now = new Date();
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
        bidCount: bidNumber,
        currentLeaderName: "Você",
        currentLeaderUserId: userId,
        deadlineAt: new Date(now.getTime() + auctionDurationMs),
        nextBotAt: new Date(now.getTime() + 2_500 + Math.random() * 3_500),
      })
      .where(eq(auctionsTable.id, current.id));

    return { ok: true as const };
  });

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

export async function updateProfile(userId: string, input: {
  name: string;
  email: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}) {
  if (input.name.trim().length < 2) {
    return { error: "Informe um nome com pelo menos 2 caracteres." } as const;
  }

  const changingPassword = Boolean(
    input.currentPassword || input.newPassword || input.confirmPassword,
  );
  if (changingPassword && !input.currentPassword) {
    return { error: "Informe a senha atual." } as const;
  }
  if (changingPassword && (input.newPassword?.length ?? 0) < 8) {
    return {
      error: "A nova senha precisa ter ao menos 8 caracteres.",
    } as const;
  }
  if (changingPassword && input.newPassword === input.currentPassword) {
    return { error: "A nova senha deve ser diferente da atual." } as const;
  }
  if (changingPassword && input.confirmPassword !== input.newPassword) {
    return { error: "As senhas não coincidem." } as const;
  }

  if (changingPassword) {
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
    if (!(await verifyPassword(input.currentPassword ?? "", account.passwordHash))) {
      return { error: "A senha atual está incorreta." } as const;
    }
  }

  const email = input.email.trim().toLowerCase();
  const [emailOwner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (emailOwner && emailOwner.id !== userId) {
    return { error: "Este e-mail já está em uso." } as const;
  }

  try {
    await db
      .update(usersTable)
      .set({
        name: input.name.trim(),
        email,
        ...(changingPassword
          ? { passwordHash: await hashPassword(input.newPassword ?? "") }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Este e-mail já está em uso." } as const;
    }
    throw error;
  }

  return {
    state: await readState(userId),
    passwordUpdated: changingPassword,
  };
}

export async function redeemPrize(userId: string, auctionId: number) {
  const result = await db.transaction(async (tx) => {
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
