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
  "tunables.set": "Mudou os números do jogo",
  "economy.read": "Viu a economia",
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
  nothing_changed: "Nenhum número mudou: não há nada para guardar.",
};

/** The game's numbers (Task 4.6), as the Afinar page names them: the section, then each number, with its unit. */
export const SECTIONS: Readonly<Record<string, string>> = {
  player: "Quem chega",
  fares: "Corridas",
  transfers: "Dinheiro em mão",
  stakes: "Apostas nas mesas",
  needs: "Fome e Energia",
  crime: "Crime",
  heat: "Calor do bairro",
  channels: "Canais",
};

export const TUNABLES: Readonly<Record<string, string>> = {
  "player.startingFloor": "O mínimo com que alguém chega (Mk)",
  "fares.candongueiroLocal": "Uma corrida de candongueiro no bairro (Mk)",
  "fares.motoTaxi": "Uma corrida de moto-táxi no bairro (Mk)",
  "fares.kupapata": "Uma corrida de kupapata no bairro (Mk)",
  "fares.taxi": "Uma corrida de táxi no bairro (Mk)",
  "fares.entreBairros": "O candongueiro de um bairro para outro (Mk)",
  "servicos.corte": "Um corte na barbearia (Mk)",
  "transfers.noSendDays": "Dias em que uma conta nova não pode dar dinheiro",
  "transfers.newAccountDays": "Dias em que uma conta é nova",
  "transfers.newAccountDailyCap": "O máximo que uma conta nova dá por dia (Mk)",
  "transfers.dailyCap": "O máximo que uma conta dá por dia (Mk)",
  "stakes.perGameCap": "O máximo apostado num jogo (Mk)",
  "stakes.houseCutPermille": "A parte da casa numa aposta (por mil)",
  "needs.fomePerHour": "Fome perdida por hora de jogo (de 10 000)",
  "needs.energiaPerHour": "Energia perdida por hora de jogo (de 10 000)",
  "needs.energiaPerRunHour": "Energia a mais por hora a correr",
  "needs.energiaPerJump": "Energia de cada salto",
  "needs.energiaPerHungryHour": "Energia a mais por hora com fome",
  "needs.energiaPerRestHour": "Energia ganha por hora sentado ou na carrinha",
  "needs.hospitalEnergia": "Energia com que se acorda no hospital",
  "needs.hospitalFome": "Fome mínima com que se acorda no hospital",
  "needs.hospitalBill": "A conta do hospital (Mk)",
  "needs.tiredBelow": "Abaixo disto, ninguém corre nem salta",
  "crime.shieldPlayHours": "Horas de jogo com o escudo de novato",
  "crime.shieldAccountDays": "Dias de conta com o escudo de novato",
  "crime.assaltoPermilleOfCash": "O que um assalto leva da Carteira (por mil)",
  "crime.assaltoCeiling": "O máximo que um assalto leva (Mk)",
  "crime.burglaryCooldownHours": "Horas entre dois assaltos à mesma casa",
  "crime.burglaryPermilleOfMovableValue": "O que um assalto leva de uma casa (por mil)",
  "crime.hotGoodsHours": "Horas em que o roubado está quente",
  "crime.maxSentenceMinutes": "O máximo de minutos na cadeia",
  "heat.darkness": "Peso do escuro",
  "heat.lighting": "Peso da luz",
  "heat.crowd": "Peso da multidão",
  "heat.police": "Peso da polícia",
  "heat.recentOffences": "Peso dos crimes recentes",
  "channels.fillTo": "Pessoas num canal antes de abrir outro",
  "channels.cap": "O máximo de pessoas num canal",
};

/** Where money comes into the game and where it leaves it, by the ledger's names. */
export const FLOWS: Readonly<Record<string, string>> = {
  wage: "Biscatos",
  npc_customer: "Clientes da rua",
  insurance_payout: "Seguros pagos",
  grant: "Famílias (cartão de origem)",
  errand: "Recados",
  family: "Dinheiro para o táxi",
  npc_shop: "Cantinas e bancas",
  fare: "Corridas",
  rent: "Rendas",
  tax: "Impostos",
  fuel: "Combustível",
  utilities: "Água e luz",
  fine: "Multas",
  hospital: "Hospital",
  insurance_premium: "Seguros",
  fee: "Taxas",
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
