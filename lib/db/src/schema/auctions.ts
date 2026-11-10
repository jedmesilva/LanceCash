import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  text,
  uniqueIndex,
  uuid,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { auctionStatusEnum } from "./enums";
import { usersTable } from "./users";

export const auctionsTable = pgTable(
  "auctions",
  {
    id: serial("id").primaryKey(),
    prizeAmountCents: integer("prize_amount_cents").notNull(),
    status: auctionStatusEnum("status").notNull().default("upcoming"),
    bidCount: integer("bid_count").notNull().default(0),
    currentLeaderName: text("current_leader_name").notNull().default(""),
    currentLeaderUserId: uuid("current_leader_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    startedAt: timestamp("started_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    nextBotAt: timestamp("next_bot_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("auctions_prize_positive", sql`${table.prizeAmountCents} > 0`),
    check("auctions_bid_count_nonnegative", sql`${table.bidCount} >= 0`),
    check(
      "auctions_timing_consistent",
      sql`(${table.status} = 'live' AND ${table.startedAt} IS NOT NULL AND ${table.deadlineAt} IS NOT NULL) OR (${table.status} = 'ended' AND ${table.deadlineAt} IS NULL) OR (${table.status} = 'upcoming' AND ${table.startedAt} IS NULL AND ${table.deadlineAt} IS NULL)`,
    ),
    index("auctions_status_id_idx").on(table.status, table.id),
    uniqueIndex("auctions_single_live_idx")
      .on(table.status)
      .where(sql`${table.status} = 'live'`),
  ],
);

export const insertAuctionSchema = createInsertSchema(auctionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAuction = z.infer<typeof insertAuctionSchema>;
export type Auction = typeof auctionsTable.$inferSelect;
