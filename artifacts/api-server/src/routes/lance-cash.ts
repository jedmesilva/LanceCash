import { Router, type IRouter } from "express";
import {
  GetLanceCashAuctionBidsQueryParams,
  GetLanceCashAuctionBidsResponse,
  GetLanceCashStateResponse,
  PlaceLanceCashBidBody,
  PurchaseLancePackageBody,
  RedeemLanceCashPrizeParams,
  UpdateLanceCashProfileBody,
} from "@workspace/api-zod";
import { requireAuth, resolveAuthSession } from "../lib/auth-session";
import {
  placeBid,
  purchasePackage,
  readPublicState,
  readOlderBids,
  readState,
  redeemPrize,
  updateProfile,
} from "../lib/lance-cash-db";

const router: IRouter = Router();

router.get("/lance-cash/state", async (req, res): Promise<void> => {
  const session = await resolveAuthSession(req, res);
  const state = session
    ? await readState(session.userId)
    : await readPublicState();
  res.json(GetLanceCashStateResponse.parse(state));
});

router.get("/lance-cash/bids/history", async (req, res): Promise<void> => {
  const parsed = GetLanceCashAuctionBidsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros do histórico inválidos." });
    return;
  }

  const session = await resolveAuthSession(req, res);
  const page = await readOlderBids(
    session?.userId ?? null,
    parsed.data.auctionId,
    parsed.data.before,
  );
  if (!page) {
    res.status(404).json({ error: "Leilão não encontrado." });
    return;
  }
  res.json(GetLanceCashAuctionBidsResponse.parse(page));
});

router.post("/lance-cash/bids", requireAuth, async (req, res): Promise<void> => {
  const parsed = PlaceLanceCashBidBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados do lance inválidos." });
    return;
  }

  const result = await placeBid(
    res.locals.authUserId as string,
    parsed.data.auctionId,
  );
  if (!("state" in result)) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(GetLanceCashStateResponse.parse(result.state));
});

router.post(
  "/lance-cash/packages/purchase",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = PurchaseLancePackageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Pacote inválido." });
      return;
    }

    const result = await purchasePackage(
      res.locals.authUserId as string,
      parsed.data.packageId,
      parsed.data.requestId,
    );
    if (!("state" in result)) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(GetLanceCashStateResponse.parse(result.state));
  },
);

router.patch(
  "/lance-cash/profile",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = UpdateLanceCashProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados da conta inválidos." });
      return;
    }

    const result = await updateProfile(
      res.locals.authUserId as string,
      parsed.data,
    );
    if (!("state" in result)) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(GetLanceCashStateResponse.parse(result.state));
  },
);

router.post(
  "/lance-cash/prizes/:auctionId/redeem",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = RedeemLanceCashPrizeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Dados do resgate inválidos." });
      return;
    }

    const result = await redeemPrize(
      res.locals.authUserId as string,
      params.data.auctionId,
    );
    if (!("state" in result)) {
      const status = result.error === "Prêmio não encontrado." ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json(GetLanceCashStateResponse.parse(result.state));
  },
);

export default router;
