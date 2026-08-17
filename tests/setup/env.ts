import { loadEnvFile } from "@/lib/db/load-env";

// Vitest nie ładuje .env samodzielnie (robi to Next.js).
// Testy integracyjne potrzebują DATABASE_URL i kluczy Airtable.
loadEnvFile();
