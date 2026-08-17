/**
 * Diagnostyka zawartości bazy PostgreSQL.
 * Uruchomienie: npm run db:stats
 */

import { sql } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";
import { getDb } from "@/lib/db/client";

loadEnvFile();

async function main() {
  const db = getDb();

  const counts = await db.execute(sql`
    select 'tournaments' as t, count(*)::int as n from tournaments
    union all select 'tournament_assets', count(*)::int from tournament_assets
    union all select 'groups', count(*)::int from groups
    union all select 'teams', count(*)::int from teams
    union all select 'matches', count(*)::int from matches
    union all select 'scorers', count(*)::int from scorers
    union all select 'brackets', count(*)::int from brackets
    union all select 'bracket_rounds', count(*)::int from bracket_rounds
    union all select 'standings_snapshots', count(*)::int from standings_snapshots
    union all select 'standings_snapshot_rows', count(*)::int from standings_snapshot_rows
    order by 1
  `);

  console.log("liczba wierszy:");
  for (const row of counts.rows as Array<{ t: string; n: number }>) {
    console.log(`  ${row.t.padEnd(26)} ${row.n}`);
  }

  const tournamentRows = await db.execute(sql`
    select id, slug, title, format, is_active, legacy_airtable_id
    from tournaments order by created_at
  `);

  console.log("\nturnieje:");
  for (const row of tournamentRows.rows as Array<Record<string, unknown>>) {
    console.log(
      `  uuid=${row.id} slug=${row.slug} title="${row.title}" ` +
        `format=${row.format} active=${row.is_active} legacy=${row.legacy_airtable_id ?? "-"}`
    );
  }

  const perGroup = await db.execute(sql`
    select g.key,
           count(distinct t.id)::int as teams,
           count(distinct m.id)::int as matches
    from groups g
    left join teams t on t.group_id = g.id
    left join matches m on m.group_id = g.id
    group by g.key order by g.key
  `);

  console.log("\nper grupa:");
  for (const row of perGroup.rows as Array<Record<string, unknown>>) {
    console.log(`  ${row.key}: ${row.teams} drużyn, ${row.matches} meczów`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
