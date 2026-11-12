import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import lanceCashRouter from "./lance-cash";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(lanceCashRouter);

export default router;
