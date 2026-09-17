import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const serviceAreasTable = pgTable("service_areas", {
  name: text("name").primaryKey(),
  governorate: text("governorate").notNull().default("مسقط"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceArea = typeof serviceAreasTable.$inferSelect;
