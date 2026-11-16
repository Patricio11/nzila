// The tables as Drizzle sees them, for typed queries. The SQL files in
// ../migrations are the source of truth for what exists in the database; an
// integration test fails when a column here and a column there disagree.

import { bigint, boolean, customType, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true });
const bytea = customType<{ data: Uint8Array }>({ dataType: () => "bytea" });

// ------------------------------------------------------------------ world

export const provinces = pgTable("provinces", {
  id: text("id").primaryKey(),
  nameKey: text("name_key").notNull(),
  open: boolean("open").notNull().default(false),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const districts = pgTable("districts", {
  id: text("id").primaryKey(),
  provinceId: text("province_id").notNull(),
  nameKey: text("name_key").notNull(),
  open: boolean("open").notNull().default(false),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const packs = pgTable("packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  provinceId: text("province_id").notNull(),
  districtId: text("district_id").notNull(),
  version: integer("version").notNull(),
  contentHash: text("content_hash").notNull(),
  artPass: smallint("art_pass").notNull(),
  bytesPoupanca: integer("bytes_poupanca").notNull(),
  bytesNormal: integer("bytes_normal").notNull(),
  bytesAlta: integer("bytes_alta").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: at("created_at").notNull().defaultNow(),
  publishedAt: at("published_at"),
});

// ---------------------------------------------------------------- players

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull().default("guest"),
  status: text("status").notNull().default("active"),
  name: text("name"),
  // The plain form of the name: what must be unique (packages/protocol/src/name.ts).
  nameKey: text("name_key"),
  nameChanges: integer("name_changes").notNull().default(0),
  biNumber: text("bi_number"),
  ageBand: text("age_band"),
  homeDistrictId: text("home_district_id"),
  provinceId: text("province_id"),
  districtId: text("district_id"),
  x: integer("x"),
  y: integer("y"),
  z: integer("z"),
  // Never the number itself: see privacy.ts.
  phoneEnc: bytea("phone_enc"),
  phoneHash: text("phone_hash"),
  // The same for an email address, and the salted hash of the password that goes with it.
  emailEnc: bytea("email_enc"),
  emailHash: text("email_hash"),
  passwordHash: text("password_hash"),
  signinFailures: integer("signin_failures").notNull().default(0),
  signinLockedUntil: at("signin_locked_until"),
  arrivedAt: at("arrived_at").notNull().defaultNow(),
  createdAt: at("created_at").notNull().defaultNow(),
  deletedAt: at("deleted_at"),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id").notNull(),
  deviceHash: text("device_hash").notNull(),
  platform: text("platform"),
  firstSeenAt: at("first_seen_at").notNull().defaultNow(),
  lastSeenAt: at("last_seen_at").notNull().defaultNow(),
});

export const playerSessions = pgTable("player_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id").notNull(),
  deviceId: uuid("device_id"),
  tokenHash: text("token_hash").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
  lastSeenAt: at("last_seen_at").notNull().defaultNow(),
  expiresAt: at("expires_at").notNull(),
  revokedAt: at("revoked_at"),
});

export const avatars = pgTable("avatars", {
  playerId: uuid("player_id").primaryKey(),
  spec: jsonb("spec").notNull(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

export const playerOrigins = pgTable("player_origins", {
  playerId: uuid("player_id").primaryKey(),
  family: text("family").notNull(),
  province: text("province").notNull(),
  bairro: text("bairro").notNull(),
  makuta: bigint("makuta", { mode: "number" }).notNull(),
  tableVersion: integer("table_version").notNull(),
  paidTransferId: uuid("paid_transfer_id"),
  drawnAt: at("drawn_at").notNull().defaultNow(),
});

export const loginCodes = pgTable("login_codes", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  phoneHash: text("phone_hash").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: at("created_at").notNull().defaultNow(),
  expiresAt: at("expires_at").notNull(),
  usedAt: at("used_at"),
});

export const consents = pgTable("consents", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  playerId: uuid("player_id").notNull(),
  purpose: text("purpose").notNull(),
  version: integer("version").notNull(),
  granted: boolean("granted").notNull(),
  at: at("at").notNull().defaultNow(),
});

// ------------------------------------------------------------------ staff

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const staffRoles = pgTable(
  "staff_roles",
  {
    staffId: uuid("staff_id").notNull(),
    role: text("role").notNull(),
    grantedBy: uuid("granted_by"),
    grantedAt: at("granted_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.staffId, table.role] })],
);

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: at("at").notNull().defaultNow(),
  actorKind: text("actor_kind").notNull(),
  actorId: text("actor_id").notNull(),
  kind: text("kind").notNull(),
  subjectKind: text("subject_kind").notNull(),
  subjectId: text("subject_id").notNull(),
  reason: text("reason").notNull(),
  meta: jsonb("meta"),
  provinceId: text("province_id"),
  districtId: text("district_id"),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  value: jsonb("value"),
  provinceId: text("province_id"),
  districtId: text("district_id"),
  updatedAt: at("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

// ----------------------------------------------------------------- ledger

export const ledgerAccounts = pgTable("ledger_accounts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  ref: text("ref").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const ledgerTransfers = pgTable("ledger_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  debitAccount: text("debit_account").notNull(),
  creditAccount: text("credit_account").notNull(),
  // Makuta fit an exact JavaScript integer with room to spare (MAX_TRANSFER in packages/economy).
  amount: bigint("amount", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  ref: text("ref"),
  actionId: text("action_id").notNull(),
  provinceId: text("province_id"),
  districtId: text("district_id"),
  reverses: uuid("reverses"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const balances = pgTable("balances", {
  accountId: text("account_id").primaryKey(),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

/** Every table, for the test that compares this file with the database. */
export const tables = {
  provinces,
  districts,
  packs,
  players,
  devices,
  playerSessions,
  avatars,
  playerOrigins,
  loginCodes,
  consents,
  staff,
  staffRoles,
  auditLog,
  featureFlags,
  ledgerAccounts,
  ledgerTransfers,
  balances,
};
