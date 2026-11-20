// The game's numbers, live (Task 4.6, D-4.24): every version kept whole in `tunables_versions`, the first being the
// file the code ships (tunables/base.json); the zone and the API play by the newest that reads as valid and look for
// a newer one every quarter of a minute, so that a change made in the Estúdio is in play everywhere within half a
// minute, without a restart. A version the code of today cannot read as valid is never played by: the last good
// one stays.

import { BASE_TUNABLES, fillTunables, validateTunables, type Tunables } from "@nzila/economy";
import { type Sql } from "postgres";
import { audit } from "./audit.ts";

/** A recorded version: its number, its numbers, when, who (null for the file) and why. */
export interface TunablesVersion {
  readonly version: number;
  readonly tunables: Tunables;
  readonly at: string;
  readonly by: string | null;
  readonly reason: string;
}

type Row = { version: number; tunables: unknown; at: Date; by: string | null; reason: string };

/** A row as the code reads it, or null when it cannot be read as valid even with the file's numbers for what it lacks. */
function readRow(row: Row, base: Tunables): TunablesVersion | null {
  const checked = validateTunables({ ...(fillTunables(row.tunables, base) as object), version: row.version });
  return checked.ok ? { version: row.version, tunables: checked.tunables, at: row.at.toISOString(), by: row.by, reason: row.reason } : null;
}

/**
 * The file is recorded as a version when no version is as new as it: on a fresh database, and when the code ships a
 * file whose version is newer than every change made since (whoever raised the file's number meant it to win).
 */
export async function recordFile(sql: Sql, base: Tunables = BASE_TUNABLES): Promise<void> {
  await sql`
    INSERT INTO tunables_versions (version, tunables, reason)
    SELECT ${base.version}, ${sql.json(base as never)}, ${"o ficheiro tunables/base.json"}
    WHERE NOT EXISTS (SELECT 1 FROM tunables_versions WHERE version >= ${base.version})`;
}

/** The newest version that reads as valid, the file when there is none. */
export async function latestTunables(sql: Sql, base: Tunables = BASE_TUNABLES): Promise<TunablesVersion> {
  const rows = await sql<Row[]>`
    SELECT v.version, v.tunables, v.at, s.name AS by, v.reason FROM tunables_versions v LEFT JOIN staff s ON s.id = v.staff_id
    ORDER BY v.version DESC LIMIT 20`;
  for (const row of rows) {
    const read = readRow(row, base);
    if (read) return read;
  }
  return { version: base.version, tunables: base, at: new Date(0).toISOString(), by: null, reason: "o ficheiro tunables/base.json" };
}

/** The record: the newest versions first, each with when, who and why. */
export async function tunablesHistory(sql: Sql, limit = 30): Promise<{ version: number; at: string; by: string | null; reason: string }[]> {
  const rows = await sql<Row[]>`
    SELECT v.version, v.at, s.name AS by, v.reason FROM tunables_versions v LEFT JOIN staff s ON s.id = v.staff_id
    ORDER BY v.version DESC LIMIT ${limit}`;
  return rows.map((row) => ({ version: row.version, at: row.at.toISOString(), by: row.by, reason: row.reason }));
}

/**
 * A change made in the Estúdio, kept as the next version, whole, with who and why, and written to the audit log. The
 * numbers are checked first; refused, nothing is kept and every fault is said.
 */
export async function saveTunables(sql: Sql, change: { tunables: unknown; staffId: string; reason: string }, base: Tunables = BASE_TUNABLES): Promise<{ ok: true; version: number } | { ok: false; errors: string[] }> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    // One change at a time: two staff keeping changes at once make two versions, in turn.
    await t`LOCK TABLE tunables_versions IN SHARE ROW EXCLUSIVE MODE`;
    const [last] = await t<{ version: number }[]>`SELECT coalesce(max(version), 0) AS version FROM tunables_versions`;
    const version = Math.max(last!.version, base.version) + 1;
    const checked = validateTunables({ ...(fillTunables(change.tunables, base) as object), version });
    if (!checked.ok) return { ok: false as const, errors: checked.errors };
    await t`INSERT INTO tunables_versions (version, tunables, staff_id, reason) VALUES (${version}, ${t.json(checked.tunables as never)}, ${change.staffId}, ${change.reason})`;
    await audit.log(t, { actorKind: "staff", actorId: change.staffId, kind: "tunables.set", subjectKind: "tunables", subjectId: String(version), reason: change.reason });
    return { ok: true as const, version };
  });
}

/** The numbers a server plays by, kept fresh: `now()` is always a valid set; a newer version is looked for every `everyMs`. */
export interface LiveTunables {
  now(): Tunables;
  /** Looks for a newer version at once (and is what the timer calls). */
  refresh(): Promise<void>;
  stop(): void;
}

export async function liveTunables(sql: Sql, options: { base?: Tunables; everyMs?: number; log?: (line: string) => void } = {}): Promise<LiveTunables> {
  const base = options.base ?? BASE_TUNABLES;
  await recordFile(sql, base);
  let current = (await latestTunables(sql, base)).tunables;
  const refresh = async (): Promise<void> => {
    try {
      const latest = await latestTunables(sql, base);
      if (latest.version !== current.version) {
        current = latest.tunables;
        options.log?.(`tunables: now playing version ${latest.version} (${latest.reason})`);
      }
    } catch (error) {
      options.log?.(`tunables: could not look for a newer version: ${String(error)}`);
    }
  };
  const timer = setInterval(() => void refresh(), options.everyMs ?? 15_000);
  timer.unref?.();
  return { now: () => current, refresh, stop: () => clearInterval(timer) };
}
