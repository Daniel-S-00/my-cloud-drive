import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: ".env.local" });

export default {
  schema: "./src/server/db/schema",
  out: "./src/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;