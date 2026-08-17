import fs from "node:fs";
import path from "node:path";

/**
 * Minimalny loader .env dla procesów SPOZA Next.js
 * (drizzle-kit, skrypty importu, testy integracyjne).
 *
 * Celowo w osobnym pliku od lib/db/env.ts: tamten trafia do bundla aplikacji,
 * a ten korzysta z node:fs i nie powinien być do niego wciągany.
 *
 * Nigdy nie nadpisuje zmiennych już obecnych w process.env.
 */
export function loadEnvFile(cwd = process.cwd()) {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(cwd, fileName);
    if (!fs.existsSync(filePath)) continue;

    for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}
