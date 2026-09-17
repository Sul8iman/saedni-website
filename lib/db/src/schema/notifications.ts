import { pgTable, serial, text, boolean, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const adminNotificationsTable = pgTable(
  "admin_notifications",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull().default("otp_request"),
    title: text("title").notNull(),
    userId: integer("user_id"),
    userName: text("user_name"),
    phone: text("phone").notNull(),
    userType: text("user_type"),
    eventKey: text("event_key"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventKeyUnique: uniqueIndex("admin_notifications_event_key_unique").on(table.eventKey),
  }),
);

export type AdminNotification = typeof adminNotificationsTable.$inferSelect;
