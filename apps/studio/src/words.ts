// The Estúdio's words. Staff read Portuguese of Angola like the players do;
// these are kept apart from the game's own (packages/i18n) because no player
// ever downloads them.

export const REASONS: Readonly<Record<string, string>> = {
  insults: "Insultos",
  harassment: "Assédio",
  sexual: "Conteúdo sexual",
  scam: "Burla",
  cheating: "Batota",
  name: "Nome impróprio",
  other: "Outra coisa",
};

export const KINDS: Readonly<Record<string, string>> = {
  mute: "Silenciado",
  suspend: "Suspenso",
  ban: "Banido",
  kick: "Tirado do canal",
};

export const ROLES: Readonly<Record<string, string>> = {
  moderador: "Moderação",
  live_ops: "Mundo",
  economy: "Economia",
  world_builder: "Packs",
  support: "Apoio",
  platform_admin: "Plataforma",
};

/** What was done, as the log says it. */
export const DEEDS: Readonly<Record<string, string>> = {
  "staff.signin": "Entrou no Estúdio",
  "player.read": "Viu um jogador",
  "player.mute": "Silenciou",
  "player.suspend": "Suspendeu",
  "player.ban": "Baniu",
  "player.kick": "Tirou do canal",
  "player.mute.lift": "Devolveu a palavra",
  "player.suspend.lift": "Levantou a suspensão",
  "player.ban.lift": "Levantou o banimento",
  "report.close": "Fechou uma denúncia",
};

export const ERRORS: Readonly<Record<string, string>> = {
  wrong: "O endereço ou a palavra-passe não estão certos.",
  forbidden: "Isso não é do teu serviço.",
  unauthenticated: "A sessão acabou. Entra de novo.",
  not_found: "Não há ninguém com esse BI nem com esse nome.",
  invalid: "Falta dizer porquê, com pelo menos quatro letras.",
  slow_down: "Devagar. Tenta daqui a um minuto.",
  offline: "Sem rede. Tenta de novo.",
  failed: "Não deu. Tenta de novo.",
};

const DAY = new Intl.DateTimeFormat("pt-AO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const when = (iso: string): string => DAY.format(new Date(iso));

/** "há 5 min", "há 3 h", "há 2 dias": how long a report has waited. */
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 48) return `há ${Math.round(minutes / 60)} h`;
  return `há ${Math.round(minutes / 1440)} dias`;
}

/** A district's room is a code (province, dot, district): its name lives in its pack, so it is shown as the code it is, plainly. */
export const roomName = (room: string): string => room.replace(".", " / ").toUpperCase();
