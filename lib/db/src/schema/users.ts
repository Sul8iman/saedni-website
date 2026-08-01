import { pgTable, text, serial, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  userType: text("user_type").notNull().default("customer"),
  roles: text("roles"),                                         // JSON: string[] e.g. ["customer","helper"]
  area: text("area"),
  rating: real("rating"),
  isVerified: boolean("is_verified").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  otpCode: text("otp_code"),
  otpCreatedAt: timestamp("otp_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  helperInterests: text("helper_interests"),
  preferredAreas:  text("preferred_areas"),
  authToken: text("auth_token").unique(),
  expoPushToken: text("expo_push_token"),
  // Helper-specific activation code (non-expiring, hashed)
  helperActivationCodeHash: text("helper_activation_code_hash"),
  helperActivationCodeCreatedAt: timestamp("helper_activation_code_created_at", { withTimezone: true }),
  helperActivationCodeUsedAt: timestamp("helper_activation_code_used_at", { withTimezone: true }),
  helperActivationCodeActive: boolean("helper_activation_code_active").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
