// The tables as Drizzle sees them, for typed queries. The SQL files in
// ../migrations are the source of truth for what exists in the database; an
// integration test fails when a column here and a column there disagree.

import { bigint, boolean, customType, date, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  emailVerifiedAt: at("email_verified_at"),
  arrivedAt: at("arrived_at").notNull().defaultNow(),
  createdAt: at("created_at").notNull().defaultNow(),
  deletedAt: at("deleted_at"),
  /** Fome and Energia, points of a 10 000 point bar (Task 4.4). */
  fome: integer("fome").notNull().default(10000),
  energia: integer("energia").notNull().default(10000),
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

// ------------------------------------------------------------------ talk

export const chatLines = pgTable("chat_lines", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: at("at").notNull().defaultNow(),
  playerId: uuid("player_id").notNull(),
  districtId: text("district_id").notNull(),
  channel: integer("channel").notNull(),
  text: text("text").notNull(),
  said: boolean("said").notNull(),
  heardBy: integer("heard_by").notNull().default(0),
});

export const playerBlocks = pgTable(
  "player_blocks",
  {
    playerId: uuid("player_id").notNull(),
    blockedId: uuid("blocked_id").notNull(),
    at: at("at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.blockedId] })],
);

export const reports = pgTable("reports", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: at("at").notNull().defaultNow(),
  reporterId: uuid("reporter_id").notNull(),
  reportedId: uuid("reported_id").notNull(),
  reason: text("reason").notNull(),
  note: text("note"),
  lines: jsonb("lines").notNull(),
  status: text("status").notNull().default("open"),
  closedAt: at("closed_at"),
  closedBy: uuid("closed_by"),
  outcome: text("outcome"),
});

// ------------------------------------------------------------------ staff

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: at("created_at").notNull().defaultNow(),
  passwordHash: text("password_hash"),
});

export const staffSessions = pgTable("staff_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
  expiresAt: at("expires_at").notNull(),
  revokedAt: at("revoked_at"),
});

export const sanctions = pgTable("sanctions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: at("at").notNull().defaultNow(),
  playerId: uuid("player_id").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull(),
  staffId: uuid("staff_id").notNull(),
  until: at("until"),
  reportId: bigint("report_id", { mode: "number" }),
  liftedAt: at("lifted_at"),
  liftedBy: uuid("lifted_by"),
  liftReason: text("lift_reason"),
});

export const items = pgTable("items", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  ownerId: uuid("owner_id").notNull(),
  place: text("place").notNull().default("mochila"),
  item: text("item").notNull(),
  quantity: integer("quantity").notNull(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

export const receipts = pgTable("receipts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: at("at").notNull().defaultNow(),
  playerId: uuid("player_id").notNull(),
  shop: text("shop").notNull(),
  lines: jsonb("lines").notNull(),
  total: bigint("total", { mode: "number" }).notNull(),
  transferId: uuid("transfer_id").notNull(),
  key: text("key").notNull(),
});

export const recadosFeitos = pgTable("recados_feitos", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  playerId: uuid("player_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  n: smallint("n").notNull(),
  kind: text("kind").notNull(),
  districtId: text("district_id"),
  transferId: uuid("transfer_id"),
  at: at("at").notNull().defaultNow(),
});

export const cartoesCheios = pgTable("cartoes_cheios", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  playerId: uuid("player_id").notNull(),
  shop: text("shop").notNull(),
  at: at("at").notNull().defaultNow(),
});

/** The games played at the tables of the street (migration 0012, Task 4B.1). */
export const partidas = pgTable("partidas", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  districtId: text("district_id").notNull(),
  mesa: smallint("mesa").notNull(),
  jogo: text("jogo").notNull(),
  rapida: boolean("rapida").notNull().default(false),
  porTempo: boolean("por_tempo").notNull().default(false),
  at: at("at").notNull().defaultNow(),
});

/** Each seat of a game: a player with their points before and after, or a kota of the bairro. */
export const partidaLugares = pgTable(
  "partida_lugares",
  {
    partidaId: bigint("partida_id", { mode: "number" }).notNull(),
    lugar: smallint("lugar").notNull(),
    playerId: uuid("player_id"),
    kota: smallint("kota"),
    resultado: text("resultado").notNull(),
    pontosAntes: integer("pontos_antes"),
    pontosDepois: integer("pontos_depois"),
  },
  (t) => [primaryKey({ columns: [t.partidaId, t.lugar] })],
);

/** Each player's points at each game, in each bairro: the ranking. */
export const classificacao = pgTable(
  "classificacao",
  {
    playerId: uuid("player_id").notNull(),
    jogo: text("jogo").notNull(),
    districtId: text("district_id").notNull(),
    pontos: integer("pontos").notNull(),
    jogos: integer("jogos").notNull().default(0),
    vitorias: integer("vitorias").notNull().default(0),
    empates: integer("empates").notNull().default(0),
    derrotas: integer("derrotas").notNull().default(0),
    atualizado: at("atualizado").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.jogo, t.districtId] })],
);

/** Who asked whom to be a kamba, waiting for a yes (Task 4B.2). */
export const kambaPedidos = pgTable(
  "kamba_pedidos",
  {
    de: uuid("de").notNull(),
    para: uuid("para").notNull(),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.de, t.para] })],
);

/** Kambas: one row each way. */
export const kambas = pgTable(
  "kambas",
  {
    playerId: uuid("player_id").notNull(),
    kambaId: uuid("kamba_id").notNull(),
    desde: at("desde").notNull().defaultNow(),
    calado: boolean("calado").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.kambaId] })],
);

/** What kambas write to each other: a line, or come and play. Kept thirty days. */
export const mensagens = pgTable("mensagens", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  de: uuid("de").notNull(),
  para: uuid("para").notNull(),
  kind: text("kind").notNull().default("texto"),
  texto: text("texto").notNull().default(""),
  jogo: text("jogo"),
  districtId: text("district_id"),
  at: at("at").notNull().defaultNow(),
  lidaAt: at("lida_at"),
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
  chatLines,
  playerBlocks,
  reports,
  staff,
  staffSessions,
  sanctions,
  items,
  receipts,
  recadosFeitos,
  cartoesCheios,
  partidas,
  partidaLugares,
  classificacao,
  kambaPedidos,
  kambas,
  mensagens,
  staffRoles,
  auditLog,
  featureFlags,
  ledgerAccounts,
  ledgerTransfers,
  balances,
};
