import { Router, type IRouter } from "express";
import healthRouter from "./health";
import lanceCashRouter from "./lance-cash";

const router: IRouter = Router();

router.use(healthRouter);
router.use(lanceCashRouter);

export default router;
