import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import {
  DeleteAdminSessionResponse,
  GetAdminAuctionBidsQueryParams,
  GetAdminAuctionBidsResponse,
  GetAdminCashQueryParams,
  GetAdminCashResponse,
  GetAdminRedemptionsQueryParams,
  GetAdminRedemptionsResponse,
  GetAdminAuctionsQueryParams,
  GetAdminAuctionsResponse,
  GetAdminOverviewResponse,
  GetAdminSessionResponse,
  PostAdminSessionBody,
  PostAdminSessionResponse,
  UpdateAdminRedemptionBody,
  UpdateAdminRedemptionParams,
  UpdateAdminRedemptionResponse,
} from "@workspace/admin-api-zod";
import {
  readAdminCash,
  readAdminRedemptions,
  readAdminAuctionBids,
  readAdminAuctionPage,
  readAdminOverview,
  updateAdminRedemption,
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

router.get(
  "/admin/cash",
  requireAdminSession,
  async (req, res): Promise<void> => {
    const parsed = GetAdminCashQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Parâmetros do caixa inválidos." });
      return;
    }

    const result = await readAdminCash({
      offset: parsed.data.offset,
      limit: parsed.data.limit,
    });
    res.json(GetAdminCashResponse.parse(result));
  },
);

router.get(
  "/admin/redemptions",
  requireAdminSession,
  async (req, res): Promise<void> => {
    const parsed = GetAdminRedemptionsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Parâmetros da lista de resgates inválidos." });
      return;
    }

    const result = await readAdminRedemptions({
      status: parsed.data.status,
      search: parsed.data.search,
      offset: parsed.data.offset,
      limit: parsed.data.limit,
    });
    res.json(GetAdminRedemptionsResponse.parse(result));
  },
);

router.patch(
  "/admin/redemptions/:redemptionId",
  requireAdminSession,
  async (req, res): Promise<void> => {
    const parsedParams = UpdateAdminRedemptionParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "Identificador de resgate inválido." });
      return;
    }
    const parsedBody = UpdateAdminRedemptionBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "Atualização de resgate inválida." });
      return;
    }

    const result = await updateAdminRedemption(
      parsedParams.data.redemptionId,
      parsedBody.data.status,
    );
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Resgate não encontrado." });
      return;
    }
    if (result.kind === "conflict") {
      res.status(409).json({ error: "Este resgate não pode mudar para esse status." });
      return;
    }

    res.json(UpdateAdminRedemptionResponse.parse(result.redemption));
  },
);

export default router;
