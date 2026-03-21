import { defineConfig } from "drizzle-kit";
import path from "node:path";

const dbPath = path.join(__dirname, "data", "clin.db");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: dbPath },
});
