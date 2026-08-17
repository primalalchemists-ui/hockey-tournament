import { defineConfig } from "drizzle-kit";

import { loadEnvFile } from "./lib/db/load-env";
import { requireDatabaseUrl } from "./lib/db/env";

loadEnvFile();

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: requireDatabaseUrl(),
  },
  strict: true,
  verbose: true,
});
