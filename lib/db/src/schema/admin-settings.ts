import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminSettingsTable = pgTable(
  "lance_cash_admin_settings",
  {
    id: integer("id").primaryKey().default(1),
    systemBidsEnabled: boolean("system_bids_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("lance_cash_admin_settings_singleton_id", sql`${table.id} = 1`),
  ],
);

export const insertAdminSettingsSchema = createInsertSchema(
  adminSettingsTable,
).omit({
  id: true,
  updatedAt: true,
});

export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type AdminSettings = typeof adminSettingsTable.$inferSelect;
