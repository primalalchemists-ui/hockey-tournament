import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Odwzorowanie aliasu "@/..." z tsconfig.json.
      "@": projectRoot,
      // Testy działają w zwykłym Node — marker "server-only" musi być no-opem.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    // .tsx: testy kontraktu renderu (react-dom/server) dla komponentów
    // publicznych — bez DOM, bez jsdom, zwykły Node.
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: false,
    setupFiles: ["./tests/setup/env.ts"],
    // Testy integracyjne dzielą jedną bazę Neon — równoległe pliki
    // deptałyby sobie po danych.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
