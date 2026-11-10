import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bidTransactionTypeEnum } from "./enums";
import { usersTable } from "./users";

export const userBidTransactionsTable = pgTable(
  "user_bid_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    type: bidTransactionTypeEnum("type").notNull(),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("user_bid_transactions_amount_nonzero", sql`${table.amount} <> 0`),
    check(
      "user_bid_transactions_balance_nonnegative",
      sql`${table.balanceAfter} >= 0`,
    ),
    index("user_bid_transactions_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    uniqueIndex("user_bid_transactions_reference_unique").on(
      table.referenceType,
      table.referenceId,
    ),
  ],
);

export const insertUserBidTransactionSchema = createInsertSchema(
  userBidTransactionsTable,
).omit({ id: true, createdAt: true });

export type InsertUserBidTransaction = z.infer<
  typeof insertUserBidTransactionSchema
>;
export type UserBidTransaction =
  typeof userBidTransactionsTable.$inferSelect;
