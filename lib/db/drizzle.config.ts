import { defineConfig } from "drizzle-kit";
import path from "path";
import {
  assertSafeDevelopmentDatabaseEnvironment,
  getTestDatabaseUrl,
} from "./src/test-safety";

const databaseUrl =
  process.env.APP_ENV === "test"
    ? getTestDatabaseUrl()
    : assertSafeDevelopmentDatabaseEnvironment();

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
