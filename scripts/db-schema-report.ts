import { sql } from "drizzle-orm";
import { loadEnvFile } from "@/lib/db/load-env";
import { getDb } from "@/lib/db/client";

loadEnvFile();

async function main() {
  const db = getDb();
  const rows = await db.execute(sql`
    select tc.table_name, tc.constraint_type, tc.constraint_name
    from information_schema.table_constraints tc
    where tc.table_schema='public' and tc.constraint_type in ('PRIMARY KEY','UNIQUE','FOREIGN KEY','CHECK')
      and tc.constraint_name not like '%_not_null'
    order by tc.table_name, tc.constraint_type, tc.constraint_name
  `);
  const byTable: Record<string, Record<string, string[]>> = {};
  for (const r of rows.rows as Array<Record<string, string>>) {
    byTable[r.table_name] ??= {};
    byTable[r.table_name][r.constraint_type] ??= [];
    byTable[r.table_name][r.constraint_type].push(r.constraint_name);
  }
  for (const [t, kinds] of Object.entries(byTable)) {
    console.log(`\n${t}`);
    for (const [kind, names] of Object.entries(kinds)) {
      console.log(`  ${kind}: ${names.length}`);
      if (kind === "UNIQUE" || kind === "CHECK") names.forEach((n) => console.log(`     - ${n}`));
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
