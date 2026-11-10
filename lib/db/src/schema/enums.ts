import { pgEnum } from "drizzle-orm/pg-core";

export const auctionStatusEnum = pgEnum("auction_status", [
  "upcoming",
  "live",
  "ended",
]);

export const bidTransactionTypeEnum = pgEnum("bid_transaction_type", [
  "initial_credit",
  "bid_spent",
  "package_purchase",
  "refund",
  "adjustment",
]);

export const packagePurchaseStatusEnum = pgEnum(
  "package_purchase_status",
  ["pending", "paid", "failed", "refunded"],
);

export const redemptionStatusEnum = pgEnum("redemption_status", [
  "requested",
  "processing",
  "fulfilled",
  "rejected",
]);
