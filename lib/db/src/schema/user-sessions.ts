import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userSessionsTable = pgTable(
  "user_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("user_sessions_user_id_idx").on(table.userId)],
);

export const insertUserSessionSchema = createInsertSchema(
  userSessionsTable,
).omit({ createdAt: true, lastSeenAt: true });

export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessionsTable.$inferSelect;
