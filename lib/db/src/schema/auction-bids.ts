import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { auctionsTable } from "./auctions";
import { usersTable } from "./users";

export const auctionBidsTable = pgTable(
  "auction_bids",
  {
    id: serial("id").primaryKey(),
    auctionId: integer("auction_id")
      .notNull()
      .references(() => auctionsTable.id, { onDelete: "cascade" }),
    bidNumber: integer("bid_number").notNull(),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    bidderName: text("bidder_name").notNull(),
    isAutomated: boolean("is_automated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("auction_bids_number_positive", sql`${table.bidNumber} > 0`),
    check(
      "auction_bids_identity_consistent",
      sql`(${table.isAutomated} = true AND ${table.userId} IS NULL) OR (${table.isAutomated} = false AND ${table.userId} IS NOT NULL)`,
    ),
    uniqueIndex("auction_bids_auction_number_unique").on(
      table.auctionId,
      table.bidNumber,
    ),
    index("auction_bids_user_auction_idx").on(table.userId, table.auctionId),
  ],
);

export const insertAuctionBidSchema = createInsertSchema(auctionBidsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAuctionBid = z.infer<typeof insertAuctionBidSchema>;
export type AuctionBidRecord = typeof auctionBidsTable.$inferSelect;
