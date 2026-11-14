// The audit log and consents: who did what to whom and why, and what each
// player agreed to. Both are histories. The audit log cannot be changed or
// emptied (a trigger refuses); a consent is withdrawn by adding a row.

import { type Sql } from "postgres";

export interface AuditEntry {
  readonly actorKind: "staff" | "player" | "system";
  readonly actorId: string;
  /** What was done, as "thing.verb": "player.read", "player.ban", "tunables.change". */
  readonly kind: string;
  readonly subjectKind: string;
  readonly subjectId: string;
  /** Why. Required: a staff member who reads a player's data says what for (Rule 16). */
  readonly reason: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly provinceId?: string;
  readonly districtId?: string;
}

export const audit = {
  /** Writes one row. Throws when no reason is given: the action it guards must then not happen. */
  async log(sql: Sql, entry: AuditEntry): Promise<void> {
    if (entry.reason.trim() === "") throw new Error(`audit: ${entry.kind} needs a reason`);
    await sql`
      INSERT INTO audit_log (actor_kind, actor_id, kind, subject_kind, subject_id, reason, meta, province_id, district_id)
      VALUES (${entry.actorKind}, ${entry.actorId}, ${entry.kind}, ${entry.subjectKind}, ${entry.subjectId}, ${entry.reason.trim()},
              ${entry.meta ? sql.json(entry.meta as never) : null}, ${entry.provinceId ?? null}, ${entry.districtId ?? null})`;
  },
};

/**
 * What a player can be asked to agree to. `version` goes up when the words
 * shown to the player change, and they are then asked again.
 */
export const CONSENT_PURPOSES = {
  /** Playing at all: the terms and the privacy notice. Cannot be withdrawn, only ended by deleting the account. */
  play: { required: true, version: 1 },
  /** Anonymous measurements of how the game is used. Off until the player says yes. */
  analytics: { required: false, version: 1 },
  /** Messages when the game is closed. Off until the player says yes. */
  notifications: { required: false, version: 1 },
} as const;
export type ConsentPurpose = keyof typeof CONSENT_PURPOSES;

/** Records that a player agreed to, or withdrew from, a purpose. */
export async function recordConsent(sql: Sql, playerId: string, purpose: ConsentPurpose, granted: boolean): Promise<void> {
  const { required, version } = CONSENT_PURPOSES[purpose];
  if (required && !granted) throw new Error(`consent: "${purpose}" cannot be withdrawn; the player deletes the account instead`);
  await sql`INSERT INTO consents (player_id, purpose, version, granted) VALUES (${playerId}, ${purpose}, ${version}, ${granted})`;
}

/**
 * What a player agrees to now. A purpose counts only if its latest row says
 * yes and was given for the current version of the words; anything else,
 * including never having been asked, is a no.
 */
export async function consentsOf(sql: Sql, playerId: string): Promise<Record<ConsentPurpose, boolean>> {
  const rows = await sql<{ purpose: ConsentPurpose; version: number; granted: boolean }[]>`
    SELECT DISTINCT ON (purpose) purpose, version, granted FROM consents
    WHERE player_id = ${playerId} ORDER BY purpose, at DESC, id DESC`;
  const result = { play: false, analytics: false, notifications: false };
  for (const row of rows) result[row.purpose] = row.granted && row.version === CONSENT_PURPOSES[row.purpose].version;
  return result;
}
