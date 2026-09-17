import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const requestLifecycleEventsTable = pgTable(
  "request_lifecycle_events",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id").notNull(),
    action: text("action").notNull(),
    actorUserId: integer("actor_user_id"),
    actorRole: text("actor_role"),
    reason: text("reason"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestCreatedAtIndex: index("request_lifecycle_events_request_created_at_idx").on(
      table.requestId,
      table.createdAt,
    ),
  }),
);

export const insertRequestLifecycleEventSchema = createInsertSchema(requestLifecycleEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRequestLifecycleEvent = z.infer<typeof insertRequestLifecycleEventSchema>;
export type RequestLifecycleEvent = typeof requestLifecycleEventsTable.$inferSelect;