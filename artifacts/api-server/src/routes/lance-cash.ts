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
} from "../lib/lance-cash";

const router: IRouter = Router();

router.get("/lance-cash/state", (req, res): void => {
  const parsed = GetLanceCashStateQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Sessão inválida." });
    return;
  }

  res.json(GetLanceCashStateResponse.parse(readState(parsed.data.sessionId)));
});

router.get("/lance-cash/bids/history", (req, res): void => {
  const parsed = GetLanceCashAuctionBidsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros do histórico inválidos." });
    return;
  }

  const page = readOlderBids(
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

router.post("/lance-cash/bids", (req, res): void => {
  const parsed = PlaceLanceCashBidBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados do lance inválidos." });
    return;
  }

  const result = placeBid(parsed.data.sessionId, parsed.data.auctionId);
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(GetLanceCashStateResponse.parse(result.state));
});

router.post("/lance-cash/packages/purchase", (req, res): void => {
  const parsed = PurchaseLancePackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pacote inválido." });
    return;
  }

  const result = purchasePackage(parsed.data.sessionId, parsed.data.packageId);
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(GetLanceCashStateResponse.parse(result.state));
});

router.patch("/lance-cash/profile", (req, res): void => {
  const parsed = UpdateLanceCashProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados da conta inválidos." });
    return;
  }

  const result = updateProfile(parsed.data);
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(GetLanceCashStateResponse.parse(result.state));
});

router.post(
  "/lance-cash/prizes/:auctionId/redeem",
  (req, res): void => {
    const params = RedeemLanceCashPrizeParams.safeParse(req.params);
    const body = RedeemLanceCashPrizeBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Dados do resgate inválidos." });
      return;
    }

    const result = redeemPrize(body.data.sessionId, params.data.auctionId);
    if ("error" in result) {
      const status = result.error === "Prêmio não encontrado." ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json(GetLanceCashStateResponse.parse(result.state));
  },
);

export default router;
