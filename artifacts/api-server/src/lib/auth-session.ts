import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Request, RequestHandler, Response } from "express";
import { db, userSessionsTable } from "@workspace/db";

const cookieName = "lance_cash_session";
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function sessionKey(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET must be configured to use account sessions.");
  }
  return value;
}

function hashToken(token: string): string {
  return createHmac("sha256", sessionKey()).update(token).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(cookieName, token, {
    ...cookieOptions(),
    maxAge: sessionLifetimeMs,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(cookieName, cookieOptions());
}

export async function createAuthSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const sessionId = hashToken(token);
  await db.insert(userSessionsTable).values({ sessionId, userId });
  return { token, sessionId };
}

export async function resolveAuthSession(
  req: Request,
  res: Response,
): Promise<{ sessionId: string; userId: string } | null> {
  const token: unknown = req.cookies?.[cookieName];
  if (typeof token !== "string" || token.length < 40 || token.length > 100) {
    return null;
  }

  const sessionId = hashToken(token);
  const cutoff = new Date(Date.now() - sessionLifetimeMs);
  const [session] = await db
    .select({
      sessionId: userSessionsTable.sessionId,
      userId: userSessionsTable.userId,
    })
    .from(userSessionsTable)
    .where(
      and(
        eq(userSessionsTable.sessionId, sessionId),
        gt(userSessionsTable.lastSeenAt, cutoff),
      ),
    )
    .limit(1);

  if (!session) {
    clearAuthCookie(res);
    return null;
  }

  await db
    .update(userSessionsTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(userSessionsTable.sessionId, session.sessionId));

  return session;
}

export async function revokeAuthSession(
  req: Request,
  res: Response,
): Promise<void> {
  const token: unknown = req.cookies?.[cookieName];
  if (typeof token === "string" && token.length >= 40 && token.length <= 100) {
    const sessionId = hashToken(token);
    await db
      .delete(userSessionsTable)
      .where(eq(userSessionsTable.sessionId, sessionId));
  }
  clearAuthCookie(res);
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const session = await resolveAuthSession(req, res);
  if (!session) {
    res.status(401).json({ error: "Entre na sua conta para continuar." });
    return;
  }

  res.locals.authSessionId = session.sessionId;
  res.locals.authUserId = session.userId;
  next();
};
