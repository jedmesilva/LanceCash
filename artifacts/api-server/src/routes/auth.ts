import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import {
  GetAuthMeResponse,
  PostAuthLoginBody,
  PostAuthLoginResponse,
  PostAuthRegisterBody,
  PostAuthRegisterResponse,
} from "@workspace/api-zod";
import {
  db,
  userBidBalancesTable,
  userSessionsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearAuthCookie,
  createAuthSession,
  generateAuthSessionToken,
  requireAuth,
  revokeAuthSession,
  setAuthCookie,
} from "../lib/auth-session";
import { hashPassword, verifyPassword } from "../lib/passwords";

const router: IRouter = Router();
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
});

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

router.get("/auth/me", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.authUserId as string;
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      isDemo: usersTable.isDemo,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    clearAuthCookie(res);
    res.status(401).json({ error: "Entre na sua conta para continuar." });
    return;
  }

  res.json(GetAuthMeResponse.parse({ user }));
});

router.post("/auth/register", authRateLimit, async (req, res): Promise<void> => {
  const parsed = PostAuthRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Confira seu nome, e-mail e senha." });
    return;
  }

  const name = parsed.data.name.trim();
  const email = parsed.data.email.trim().toLowerCase();
  if (name.length < 2) {
    res.status(400).json({ error: "Informe seu nome completo." });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const authSession = generateAuthSessionToken();

  try {
    const user = await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(usersTable)
        .values({ name, email, passwordHash, isDemo: false })
        .returning({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          isDemo: usersTable.isDemo,
        });

      if (!createdUser) {
        throw new Error("Não foi possível criar sua conta.");
      }

      await tx.insert(userBidBalancesTable).values({
        userId: createdUser.id,
        balance: 0,
      });
      await tx.insert(userSessionsTable).values({
        sessionId: authSession.sessionId,
        userId: createdUser.id,
      });
      return createdUser;
    });

    setAuthCookie(res, authSession.token);
    res.status(201).json(PostAuthRegisterResponse.parse({ user }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Este e-mail já está cadastrado." });
      return;
    }
    throw error;
  }
});

router.post("/auth/login", authRateLimit, async (req, res): Promise<void> => {
  const parsed = PostAuthLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Informe um e-mail e uma senha válidos." });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      isDemo: usersTable.isDemo,
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "E-mail ou senha incorretos." });
    return;
  }

  await revokeAuthSession(req, res);
  const authSession = await createAuthSession(user.id);
  setAuthCookie(res, authSession.token);
  res.json(
    PostAuthLoginResponse.parse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isDemo: user.isDemo,
      },
    }),
  );
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  await revokeAuthSession(req, res);
  res.status(204).end();
});

export default router;
