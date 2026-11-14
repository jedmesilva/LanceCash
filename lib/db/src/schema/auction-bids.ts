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

export const auctionBidSources = [
  "user_manual",
  "user_automation",
  "system_automation",
  "system_admin",
] as const;
export type AuctionBidSource = (typeof auctionBidSources)[number];

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
    source: text("source").$type<AuctionBidSource>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("auction_bids_number_positive", sql`${table.bidNumber} > 0`),
    check(
      "auction_bids_source_valid",
      sql`${table.source} IN ('user_manual', 'user_automation', 'system_automation', 'system_admin')`,
    ),
    check(
      "auction_bids_source_identity_consistent",
      sql`(
        (${table.source} = 'user_manual' AND ${table.isAutomated} = false AND ${table.userId} IS NOT NULL)
        OR (${table.source} = 'user_automation' AND ${table.isAutomated} = true AND ${table.userId} IS NOT NULL)
        OR (${table.source} = 'system_automation' AND ${table.isAutomated} = true AND ${table.userId} IS NULL)
        OR (${table.source} = 'system_admin' AND ${table.isAutomated} = false AND ${table.userId} IS NULL)
      )`,
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
