import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import {
  DeleteAdminSessionResponse,
  GetAdminAuctionBidsQueryParams,
  GetAdminAuctionBidsResponse,
  GetAdminAuctionsQueryParams,
  GetAdminAuctionsResponse,
  GetAdminOverviewResponse,
  GetAdminSessionResponse,
  PostAdminSessionBody,
  PostAdminSessionResponse,
  UpdateAdminSystemBidsSettingsBody,
  UpdateAdminSystemBidsSettingsResponse,
} from "@workspace/api-zod";
import {
  readAdminAuctionBids,
  readAdminAuctionPage,
  readAdminOverview,
  updateSystemBidsEnabled,
} from "../lib/admin-db";
import {
  clearAdminSessionCookie,
  isAdminSessionActive,
  matchesAdminAccessKey,
  requireAdminSession,
  setAdminSessionCookie,
} from "../lib/admin-session";
import { getActiveAuctionViewerCount } from "../lib/auction-realtime";

const router: IRouter = Router();
const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
});

router.get("/admin/session", (req, res): void => {
  const authenticated = isAdminSessionActive(req, res);
  res.json(GetAdminSessionResponse.parse({ authenticated }));
});

router.post(
  "/admin/session",
  adminLoginRateLimit,
  (req, res): void => {
    const parsed = PostAdminSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Informe uma chave de acesso válida." });
      return;
    }

    if (!matchesAdminAccessKey(parsed.data.accessKey)) {
      res.status(401).json({ error: "A chave de acesso está incorreta." });
      return;
    }

    setAdminSessionCookie(res);
    res.json(PostAdminSessionResponse.parse({ authenticated: true }));
  },
);

router.delete("/admin/session", (_req, res): void => {
  clearAdminSessionCookie(res);
  res.status(204).end();
});

router.get(
  "/admin/overview",
  requireAdminSession,
  async (_req, res): Promise<void> => {
    const overview = await readAdminOverview(getActiveAuctionViewerCount());
    res.json(GetAdminOverviewResponse.parse(overview));
  },
);

router.get(
  "/admin/auctions",
  requireAdminSession,
  async (req, res): Promise<void> => {
    const parsed = GetAdminAuctionsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Parâmetros da lista inválidos." });
      return;
    }

    const page = await readAdminAuctionPage(
      parsed.data.status,
      parsed.data.cursor,
      parsed.data.limit,
    );
    res.json(GetAdminAuctionsResponse.parse(page));
  },
);

router.get(
  "/admin/auction-bids",
  requireAdminSession,
  async (req, res): Promise<void> => {
    const parsed = GetAdminAuctionBidsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Parâmetros do histórico inválidos." });
      return;
    }

    const result = await readAdminAuctionBids({
      auctionId: parsed.data.auctionId,
      search: parsed.data.search,
      before: parsed.data.before,
      limit: parsed.data.limit,
    });
    if (!result) {
      res.status(404).json({ error: "Leilão não encontrado." });
      return;
    }
    res.json(GetAdminAuctionBidsResponse.parse(result));
  },
);

router.patch(
  "/admin/settings/system-bids",
  requireAdminSession,
  async (req, res): Promise<void> => {
    const parsed = UpdateAdminSystemBidsSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Configuração inválida." });
      return;
    }

    const settings = await updateSystemBidsEnabled(parsed.data.enabled);
    res.json(UpdateAdminSystemBidsSettingsResponse.parse(settings));
  },
);

export default router;
