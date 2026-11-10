import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { redemptionStatusEnum } from "./enums";
import { auctionPrizesTable } from "./auction-prizes";
import { usersTable } from "./users";

export const prizeRedemptionsTable = pgTable(
  "prize_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prizeId: uuid("prize_id")
      .notNull()
      .references(() => auctionPrizesTable.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    status: redemptionStatusEnum("status").notNull().default("requested"),
    notes: text("notes"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("prize_redemptions_prize_unique").on(table.prizeId),
    index("prize_redemptions_user_status_idx").on(table.userId, table.status),
  ],
);

export const insertPrizeRedemptionSchema = createInsertSchema(
  prizeRedemptionsTable,
).omit({ id: true, requestedAt: true, processedAt: true });

export type InsertPrizeRedemption = z.infer<
  typeof insertPrizeRedemptionSchema
>;
export type PrizeRedemption = typeof prizeRedemptionsTable.$inferSelect;
