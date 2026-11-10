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
import { bidPackagesTable } from "./bid-packages";
import { packagePurchaseStatusEnum } from "./enums";
import { usersTable } from "./users";

export const packagePurchasesTable = pgTable(
  "package_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    packageId: text("package_id")
      .notNull()
      .references(() => bidPackagesTable.id, { onDelete: "restrict" }),
    baseBids: integer("base_bids").notNull(),
    bonusBids: integer("bonus_bids").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paymentProvider: text("payment_provider").notNull(),
    status: packagePurchaseStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    check("package_purchases_base_bids_positive", sql`${table.baseBids} > 0`),
    check(
      "package_purchases_bonus_bids_nonnegative",
      sql`${table.bonusBids} >= 0`,
    ),
    check(
      "package_purchases_amount_nonnegative",
      sql`${table.amountCents} >= 0`,
    ),
    uniqueIndex("package_purchases_idempotency_unique").on(
      table.idempotencyKey,
    ),
    index("package_purchases_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("package_purchases_package_id_idx").on(table.packageId),
  ],
);

export const insertPackagePurchaseSchema = createInsertSchema(
  packagePurchasesTable,
).omit({ id: true, createdAt: true, paidAt: true });

export type InsertPackagePurchase = z.infer<
  typeof insertPackagePurchaseSchema
>;
export type PackagePurchase = typeof packagePurchasesTable.$inferSelect;
