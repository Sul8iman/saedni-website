import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { requestsTable } from "./requests";
import { usersTable } from "./users";

export const helperRatingsTable = pgTable(
  "helper_ratings",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id").notNull().unique().references(() => requestsTable.id, {
      onDelete: "cascade",
    }),
    customerId: integer("customer_id").notNull().references(() => usersTable.id, {
      onDelete: "restrict",
    }),
    helperId: integer("helper_id").notNull().references(() => usersTable.id, {
      onDelete: "restrict",
    }),
    stars: integer("stars").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("helper_ratings_stars_check", sql`${table.stars} BETWEEN 1 AND 5`),
  ],
);

export type HelperRating = typeof helperRatingsTable.$inferSelect;
