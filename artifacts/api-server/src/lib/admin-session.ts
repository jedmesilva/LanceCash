import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Request, RequestHandler, Response } from "express";

const adminCookieName = "lance_cash_admin";
const adminSessionLifetimeMs = 8 * 60 * 60 * 1000;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured for admin sessions.");
  }
  return secret;
}

export function matchesAdminAccessKey(candidate: string): boolean {
  const configuredKey = process.env.ADMIN_ACCESS_KEY;
  if (!configuredKey || configuredKey.length < 32) return false;

  const candidateHash = createHash("sha256").update(candidate).digest();
  const configuredHash = createHash("sha256").update(configuredKey).digest();
  return timingSafeEqual(candidateHash, configuredHash);
}

function signAdminSession(payload: string): string {
  const accessKey = process.env.ADMIN_ACCESS_KEY;
  if (!accessKey || accessKey.length < 32) {
    throw new Error("ADMIN_ACCESS_KEY must be configured for admin sessions.");
  }
  return createHmac("sha256", getSessionSecret())
    .update(`lance-cash-admin:${accessKey}:${payload}`)
    .digest("base64url");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/admin",
  };
}

export function setAdminSessionCookie(res: Response): void {
  const expiresAt = Date.now() + adminSessionLifetimeMs;
  const payload = `${expiresAt}.${randomBytes(32).toString("base64url")}`;
  const token = `${payload}.${signAdminSession(payload)}`;
  res.cookie(adminCookieName, token, {
    ...cookieOptions(),
    maxAge: adminSessionLifetimeMs,
  });
}

export function clearAdminSessionCookie(res: Response): void {
  res.clearCookie(adminCookieName, cookieOptions());
}

function hasValidAdminSession(req: Request): boolean {
  const accessKey = process.env.ADMIN_ACCESS_KEY;
  if (!accessKey || accessKey.length < 32) return false;
  const token: unknown = req.cookies?.[adminCookieName];
  if (typeof token !== "string" || token.length > 256) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiresAtText, nonce, providedSignature] = parts;
  if (!expiresAtText || !nonce || !providedSignature) return false;

  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
  if (expiresAt > Date.now() + adminSessionLifetimeMs + 60_000) return false;

  const payload = `${expiresAtText}.${nonce}`;
  const expectedSignature = signAdminSession(payload);
  const providedHash = createHash("sha256").update(providedSignature).digest();
  const expectedHash = createHash("sha256").update(expectedSignature).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export function isAdminSessionActive(req: Request, res: Response): boolean {
  const token = req.cookies?.[adminCookieName];
  const valid = hasValidAdminSession(req);
  if (!valid && token !== undefined) clearAdminSessionCookie(res);
  return valid;
}

export const requireAdminSession: RequestHandler = (req, res, next) => {
  if (!isAdminSessionActive(req, res)) {
    res.status(401).json({ error: "Acesso administrativo necessário." });
    return;
  }

  next();
};
