export type AuctionStatus = "live" | "ended" | "upcoming";

export type Bid = {
  number: number;
  leader: string;
  createdAt: string;
};

type Auction = {
  id: number;
  prize: number;
  status: AuctionStatus;
  bidCount: number;
  leader: string;
  startedAt: number | null;
  deadlineAt: number | null;
  usedBids: number;
  bids: Bid[];
  nextBotAt: number | null;
};

type Prize = {
  auctionId: number;
  prize: number;
  wonAt: string;
  redeemed: boolean;
};

type DemoSession = {
  balance: number;
  currentAuctionId: number;
  user: { name: string; email: string };
  auctions: Auction[];
  prizes: Prize[];
  touchedAt: number;
};

const auctionDuration = 15_000;
const historyPageSize = 12;
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
const futurePrizes = [500, 2000, 1000, 5000, 1000, 500, 2000];
const packages = [
  { id: "starter", bids: 15, bonus: 0, price: 15, label: "Para começar" },
  { id: "value", bids: 50, bonus: 5, price: 45, label: null },
  { id: "popular", bids: 120, bonus: 20, price: 99, label: "Mais popular" },
  { id: "best", bids: 300, bonus: 75, price: 210, label: "Melhor valor" },
];

const sessions = new Map<string, DemoSession>();

function nameForBid(auctionId: number, bidNumber: number): string {
  const index =
    (Math.imul(bidNumber + auctionId * 977, 2654435761) >>> 0) %
    bidderNames.length;
  return bidderNames[index];
}

function makeBid(
  auctionId: number,
  number: number,
  leader: string,
  at: number,
): Bid {
  return { number, leader, createdAt: new Date(at).toISOString() };
}

function makeAuction(
  id: number,
  prize: number,
  status: AuctionStatus,
  bidCount = 0,
  referenceTime = Date.now(),
): Auction {
  const bids: Bid[] = [];
  for (let number = 1; number <= bidCount; number += 1) {
    bids.push(
      makeBid(
        id,
        number,
        nameForBid(id, number),
        referenceTime - (bidCount - number) * 3_700,
      ),
    );
  }

  return {
    id,
    prize,
    status,
    bidCount,
    leader: bidCount ? bids[bidCount - 1].leader : "",
    startedAt: status === "upcoming" ? null : referenceTime,
    deadlineAt: null,
    usedBids: 0,
    bids,
    nextBotAt: null,
  };
}

function beginAuction(auction: Auction, now = Date.now()): void {
  const bidCount = 400 + Math.floor(Math.random() * 900);
  auction.status = "live";
  auction.bidCount = bidCount;
  auction.leader = nameForBid(auction.id, bidCount);
  auction.startedAt = now;
  auction.deadlineAt = now + auctionDuration;
  auction.usedBids = 0;
  auction.bids = [];

  for (let number = 1; number <= bidCount; number += 1) {
    auction.bids.push(
      makeBid(
        auction.id,
        number,
        nameForBid(auction.id, number),
        now - (bidCount - number) * 3_700,
      ),
    );
  }

  auction.nextBotAt = now + 2_500 + Math.random() * 3_500;
}

function addBid(auction: Auction, leader: string, now = Date.now()): void {
  auction.bidCount += 1;
  auction.leader = leader;
  auction.deadlineAt = now + auctionDuration;
  auction.bids.push(makeBid(auction.id, auction.bidCount, leader, now));
}

function ensureUpcoming(session: DemoSession): void {
  const currentIndex = session.auctions.findIndex(
    (auction) => auction.id === session.currentAuctionId,
  );
  while (session.auctions.length - currentIndex < 4) {
    const last = session.auctions[session.auctions.length - 1];
    const id = last.id + 1;
    session.auctions.push(
      makeAuction(
        id,
        futurePrizes[(id + 1) % futurePrizes.length],
        "upcoming",
      ),
    );
  }
}

function createSession(): DemoSession {
  const now = Date.now();
  const baseId = 120 + Math.floor(Math.random() * 60);
  const pastPrizes = [500, 2000, 1000];
  const pastMinutes = [41, 24, 9];
  const auctions: Auction[] = [];

  for (let index = 0; index < 3; index += 1) {
    const id = baseId - 3 + index;
    const bidCount = 380 + Math.floor(Math.random() * 900);
    const startedAt = now - pastMinutes[index] * 60_000;
    auctions.push(
      makeAuction(id, pastPrizes[index], "ended", bidCount, startedAt),
    );
  }

  const current = makeAuction(baseId, 1000, "upcoming");
  beginAuction(current, now);
  auctions.push(current);
  auctions.push(makeAuction(baseId + 1, 5000, "upcoming"));
  auctions.push(makeAuction(baseId + 2, 500, "upcoming"));
  auctions.push(makeAuction(baseId + 3, 2000, "upcoming"));

  return {
    balance: 5,
    currentAuctionId: baseId,
    user: { name: "Vitor Almeida", email: "vitor@exemplo.com" },
    auctions,
    prizes: [],
    touchedAt: now,
  };
}

function getSession(sessionId: string): DemoSession {
  let session = sessions.get(sessionId);
  if (!session) {
    if (sessions.size >= 100) {
      const oldest = [...sessions.entries()].sort(
        (a, b) => a[1].touchedAt - b[1].touchedAt,
      )[0];
      if (oldest) sessions.delete(oldest[0]);
    }
    session = createSession();
    sessions.set(sessionId, session);
  }
  session.touchedAt = Date.now();
  return session;
}

function advanceSession(session: DemoSession, now = Date.now()): void {
  const current = session.auctions.find(
    (auction) => auction.id === session.currentAuctionId,
  );
  if (!current || current.status !== "live") return;

  if (current.deadlineAt !== null && now >= current.deadlineAt) {
    current.status = "ended";
    current.deadlineAt = null;
    if (
      current.leader === "Você" &&
      !session.prizes.some((prize) => prize.auctionId === current.id)
    ) {
      session.prizes.push({
        auctionId: current.id,
        prize: current.prize,
        wonAt: new Date(now).toISOString(),
        redeemed: false,
      });
    }
    return;
  }

  if (current.nextBotAt !== null && now >= current.nextBotAt) {
    addBid(current, bidderNames[Math.floor(Math.random() * bidderNames.length)], now);
    current.nextBotAt = now + 2_500 + Math.random() * 3_500;
  }
}

function toState(session: DemoSession) {
  advanceSession(session);
  return {
    balance: session.balance,
    currentAuctionId: session.currentAuctionId,
    serverTime: new Date().toISOString(),
    user: session.user,
    auctions: session.auctions.map((auction) => ({
      id: auction.id,
      prize: auction.prize,
      status: auction.status,
      bidCount: auction.bidCount,
      leader: auction.leader,
      startedAt:
        auction.startedAt === null
          ? null
          : new Date(auction.startedAt).toISOString(),
      deadlineAt:
        auction.deadlineAt === null
          ? null
          : new Date(auction.deadlineAt).toISOString(),
      usedBids: auction.usedBids,
      bids: auction.bids.slice(-historyPageSize).reverse(),
      historyHasMore: auction.bidCount > historyPageSize,
    })),
    packages,
    prizes: session.prizes,
  };
}

export function readState(sessionId: string) {
  return toState(getSession(sessionId));
}

export function readOlderBids(
  sessionId: string,
  auctionId: number,
  before: number,
) {
  const session = getSession(sessionId);
  advanceSession(session);
  const auction = session.auctions.find((item) => item.id === auctionId);
  if (!auction) return null;

  const bids = auction.bids
    .filter((bid) => bid.number < before)
    .slice(-historyPageSize)
    .reverse();
  const hasMore = bids.length > 0 && bids[bids.length - 1].number > 1;
  return {
    bids,
    nextBefore: hasMore ? bids[bids.length - 1].number : null,
    hasMore,
  };
}

export function placeBid(sessionId: string, auctionId: number) {
  const session = getSession(sessionId);
  advanceSession(session);
  let current = session.auctions.find(
    (auction) => auction.id === session.currentAuctionId,
  );

  if (current?.status === "ended") {
    const target =
      session.auctions.find((auction) => auction.id === auctionId) ??
      session.auctions.find((auction) => auction.status === "upcoming");
    if (target?.status === "upcoming") {
      beginAuction(target);
      session.currentAuctionId = target.id;
      ensureUpcoming(session);
      return { state: toState(session) };
    }
  }

  current = session.auctions.find(
    (auction) => auction.id === session.currentAuctionId,
  );
  if (!current || current.id !== auctionId || current.status !== "live") {
    return { error: "Este leilão não está ao vivo." } as const;
  }
  if (current.leader === "Você") {
    return { error: "Você deu o último lance." } as const;
  }
  if (session.balance < 1) {
    return { error: "Seu saldo acabou. Compre lances para continuar." } as const;
  }

  session.balance -= 1;
  current.usedBids += 1;
  addBid(current, "Você");
  current.nextBotAt = Date.now() + 2_500 + Math.random() * 3_500;
  return { state: toState(session) };
}

export function purchasePackage(
  sessionId: string,
  packageId: string,
) {
  const session = getSession(sessionId);
  const pack = packages.find((item) => item.id === packageId);
  if (!pack) return { error: "Pacote inválido." } as const;
  session.balance += pack.bids + pack.bonus;
  return { state: toState(session) };
}

export function updateProfile(input: {
  sessionId: string;
  name: string;
  email: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}) {
  const changingPassword = Boolean(
    input.currentPassword || input.newPassword || input.confirmPassword,
  );
  if (changingPassword && !input.currentPassword) {
    return { error: "Informe a senha atual." } as const;
  }
  if (changingPassword && (input.newPassword?.length ?? 0) < 8) {
    return { error: "A nova senha precisa ter ao menos 8 caracteres." } as const;
  }
  if (
    changingPassword &&
    input.newPassword === input.currentPassword
  ) {
    return { error: "A nova senha deve ser diferente da atual." } as const;
  }
  if (
    changingPassword &&
    input.confirmPassword !== input.newPassword
  ) {
    return { error: "As senhas não coincidem." } as const;
  }

  const session = getSession(input.sessionId);
  session.user = { name: input.name.trim(), email: input.email.trim() };
  return { state: toState(session), passwordUpdated: changingPassword };
}

export function redeemPrize(sessionId: string, auctionId: number) {
  const session = getSession(sessionId);
  const prize = session.prizes.find((item) => item.auctionId === auctionId);
  if (!prize) return { error: "Prêmio não encontrado." } as const;
  if (prize.redeemed) return { error: "Este prêmio já foi resgatado." } as const;
  prize.redeemed = true;
  return { state: toState(session) };
}
