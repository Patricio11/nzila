// The base catalog. Every word a player reads lives here, in Portuguese of
// Angola, written against glossary.md. First drafts only: the founder is the
// first reviewer of every line, then two more Luandans (Rule 10).
//
// Keys are grouped by where the words appear. Two groups have rules a test
// enforces: "action.*" labels fit the gold context button (14 characters),
// and only "chat.quick.*" may carry an exclamation mark, because those are
// words the player says, not the game.
export const ptAO = {
  "app.name": "Nzila",

  // The front door.
  "frontdoor.tagline": "O teu caminho começa aqui.",
  "frontdoor.enter": "Entrar em Luanda",
  "frontdoor.building": "Ainda estamos a construir. Volta em breve.",
  "frontdoor.download": "{done} de {total}",
  "frontdoor.poupanca": "Entrar em Modo Poupança ({size})",

  // The context action: one or two words that say what the button will do.
  "action.enter": "Entrar",
  "action.talk": "Falar",
  "action.board": "Apanhar",
  "action.sit": "Sentar",
  "action.stand": "Levantar",
  "action.buy": "Comprar",
  "action.withPrice": "{label} · {price}",

  // States every surface has.
  "state.soon": "Em breve",
  "state.saving": "A guardar",
  "state.saved": "Guardado",
  "state.reconnecting": "A ligar de novo…",
  "state.offline": "Sem rede. Guardámos onde estavas.",
  "state.retry": "Tentar de novo",
  "state.refresh": "Há uma versão nova do jogo. Actualiza a página para continuar.",

  // Time and quantities.
  "time.minutes": "{n, plural, one {# minuto} other {# minutos}}",
  "time.hours": "{n, plural, one {# hora} other {# horas}}",
  "route.nextVan": "{n, plural, =0 {A chegar} one {Chega em # minuto} other {Chega em # minutos}}",

  // The HUD.
  "hud.wallet": "Carteira",
  "hud.poupanca": "Modo Poupança",
  "hud.phone": "Telemóvel",
  "hud.run": "Correr",
  "hud.emotes": "Gestos",
  "hud.compass": "Bússola",
  "emote.acenar": "Acenar",
  "emote.rir": "Rir",
  "emote.aplaudir": "Aplaudir",
  "emote.chamar": "Chamar",
  "emote.dancar": "Dançar",
  "chat.placeholder": "Escreve aqui…",
  "needs.fome": "Fome",
  "needs.energia": "Energia",
  "heat.line": "Zona quente agora. Fica atento.",
  "chat.typing": "A escrever",
  "data.session": "{size} nesta sessão",
  "data.month": "{size} este mês",
  "data.label": "Dados usados",
  "route.next": "Próxima",
  "route.atStop": "Estamos em",

  // Paper: the receipt and the BI.
  "receipt.line": "{qty} × {label}",
  "receipt.total": "Total",
  "receipt.foot": "{at} · {place} · ref. {reference}",
  "bi.number": "Número",
  "bi.bairro": "Bairro",
  "bi.arrived": "Chegada",
  "bi.novato": "Novato: protegido",

  // Quick phrases: said by the player with one tap.
  "chat.quick.goodMorning": "Bom dia!",
  "chat.quick.allGood": "Tudo fixe?",
  "chat.quick.letsGo": "Bora!",
} as const;

export type MessageKey = keyof typeof ptAO;
