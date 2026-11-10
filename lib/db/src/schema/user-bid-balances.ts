import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userBidBalancesTable = pgTable(
  "user_bid_balances",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    balance: integer("balance").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("user_bid_balances_nonnegative", sql`${table.balance} >= 0`),
  ],
);

export const insertUserBidBalanceSchema = createInsertSchema(
  userBidBalancesTable,
).omit({ updatedAt: true });

export type InsertUserBidBalance = z.infer<typeof insertUserBidBalanceSchema>;
export type UserBidBalance = typeof userBidBalancesTable.$inferSelect;
