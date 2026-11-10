import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { auctionsTable } from "./auctions";
import { usersTable } from "./users";

export const auctionPrizesTable = pgTable(
  "auction_prizes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auctionId: integer("auction_id")
      .notNull()
      .references(() => auctionsTable.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    prizeAmountCents: integer("prize_amount_cents").notNull(),
    wonAt: timestamp("won_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "auction_prizes_amount_positive",
      sql`${table.prizeAmountCents} > 0`,
    ),
    uniqueIndex("auction_prizes_auction_unique").on(table.auctionId),
    index("auction_prizes_user_won_idx").on(table.userId, table.wonAt),
  ],
);

export const insertAuctionPrizeSchema = createInsertSchema(
  auctionPrizesTable,
).omit({ id: true, wonAt: true });

export type InsertAuctionPrize = z.infer<typeof insertAuctionPrizeSchema>;
export type AuctionPrize = typeof auctionPrizesTable.$inferSelect;
