import { Router, type IRouter } from "express";
import {
  GetLanceCashAuctionBidsQueryParams,
  GetLanceCashAuctionBidsResponse,
  GetLanceCashStateQueryParams,
  GetLanceCashStateResponse,
  PlaceLanceCashBidBody,
  PurchaseLancePackageBody,
  RedeemLanceCashPrizeBody,
  RedeemLanceCashPrizeParams,
  UpdateLanceCashProfileBody,
} from "@workspace/api-zod";
import {
  placeBid,
  purchasePackage,
  readOlderBids,
  readState,
  redeemPrize,
  updateProfile,
} from "../lib/lance-cash-db";

const router: IRouter = Router();

router.get("/lance-cash/state", async (req, res): Promise<void> => {
  const parsed = GetLanceCashStateQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Sessão inválida." });
    return;
  }

  res.json(
    GetLanceCashStateResponse.parse(await readState(parsed.data.sessionId)),
  );
});

router.get("/lance-cash/bids/history", async (req, res): Promise<void> => {
  const parsed = GetLanceCashAuctionBidsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros do histórico inválidos." });
    return;
  }

  const page = await readOlderBids(
    parsed.data.sessionId,
    parsed.data.auctionId,
    parsed.data.before,
  );
  if (!page) {
    res.status(404).json({ error: "Leilão não encontrado." });
    return;
  }
  res.json(GetLanceCashAuctionBidsResponse.parse(page));
});

router.post("/lance-cash/bids", async (req, res): Promise<void> => {
  const parsed = PlaceLanceCashBidBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados do lance inválidos." });
    return;
  }

  const result = await placeBid(parsed.data.sessionId, parsed.data.auctionId);
  if (!("state" in result)) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(GetLanceCashStateResponse.parse(result.state));
});

router.post(
  "/lance-cash/packages/purchase",
  async (req, res): Promise<void> => {
    const parsed = PurchaseLancePackageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Pacote inválido." });
      return;
    }

    const result = await purchasePackage(
      parsed.data.sessionId,
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

router.patch("/lance-cash/profile", async (req, res): Promise<void> => {
  const parsed = UpdateLanceCashProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados da conta inválidos." });
    return;
  }

  const result = await updateProfile(parsed.data);
  if (!("state" in result)) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(GetLanceCashStateResponse.parse(result.state));
});

router.post(
  "/lance-cash/prizes/:auctionId/redeem",
  async (req, res): Promise<void> => {
    const params = RedeemLanceCashPrizeParams.safeParse(req.params);
    const body = RedeemLanceCashPrizeBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Dados do resgate inválidos." });
      return;
    }

    const result = await redeemPrize(
      body.data.sessionId,
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
