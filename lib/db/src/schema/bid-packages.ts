import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bidPackagesTable = pgTable(
  "bid_packages",
  {
    id: text("id").primaryKey(),
    baseBids: integer("base_bids").notNull(),
    bonusBids: integer("bonus_bids").notNull().default(0),
    priceCents: integer("price_cents").notNull(),
    label: text("label"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("bid_packages_base_bids_positive", sql`${table.baseBids} > 0`),
    check("bid_packages_bonus_bids_nonnegative", sql`${table.bonusBids} >= 0`),
    check("bid_packages_price_nonnegative", sql`${table.priceCents} >= 0`),
    index("bid_packages_active_order_idx").on(table.isActive, table.sortOrder),
  ],
);

export const insertBidPackageSchema = createInsertSchema(
  bidPackagesTable,
).omit({ createdAt: true, updatedAt: true });

export type InsertBidPackage = z.infer<typeof insertBidPackageSchema>;
export type BidPackage = typeof bidPackagesTable.$inferSelect;
