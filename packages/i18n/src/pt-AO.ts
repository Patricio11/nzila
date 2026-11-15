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
  "action.getOff": "Descer aqui",
  "action.askStop": "Paragem",
  "action.stopAsked": "Vai parar",
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
  "hud.jump": "Saltar",
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
  // The Telemóvel and its nine apps.
  "phone.title": "Telemóvel",
  "phone.back": "Voltar",
  "phone.close": "Fechar",
  "app.mapa": "Mapa",
  "app.mensagens": "Mensagens",
  "app.banco": "Banco",
  "app.biscatos": "Biscatos",
  "app.casa": "Casa",
  "app.garagem": "Garagem",
  "app.negocio": "Negócio",
  "app.bi": "BI",
  "app.definicoes": "Definições",
  // What an app that is not here yet says, honestly.
  "app.mapa.soon": "O mapa está a chegar.",
  "app.mensagens.soon": "Ainda não podes escrever aos teus kambas. Está quase.",
  "app.banco.soon": "O banco ainda não abriu. O teu dinheiro está contigo.",
  "app.biscatos.soon": "Ainda não há biscatos. Dá uma volta e conhece a zona.",
  "app.casa.soon": "Ainda não tens casa. Os quartos para alugar vêm a seguir.",
  "app.garagem.soon": "Ainda não tens carro nem mota. Por agora, anda de candongueiro.",
  "app.negocio.soon": "Ainda não podes abrir negócio. Primeiro o trabalho, depois a banca.",
  "app.bi.soon": "O teu BI ainda está a ser passado.",
  "app.definicoes.soon": "As definições estão a chegar.",
  // Mapa
  "map.none": "Ainda não chegaste a lado nenhum.",
  "map.you": "Tu",
  "map.paragens": "Paragens",
  "map.pontos": "Lugares",
  "map.linhas": "Linhas",
  "map.hint": "Toca num lugar para saber o que é.",
  "map.mark": "Marcar",
  "map.unmark": "Desmarcar",
  // Definições
  "settings.quality": "Qualidade",
  "settings.quality.poupanca": "Poupança",
  "settings.quality.normal": "Normal",
  "settings.quality.alta": "Alta",
  "settings.poupanca.note": "Gasta menos dados e menos bateria. A imagem fica mais simples e o som desliga.",
  "settings.sound": "Som",
  "settings.hand": "Mão",
  "settings.hand.right": "Direita",
  "settings.hand.left": "Esquerda",
  // What a candongueiro has written across its back window: each van its own. Invented, in the manner of the
  // real ones; drafts for the founder to cross out and add to. None is the name of a brand, a film or a song.
  "van.phrase.0": "Tá Cromado",
  "van.phrase.1": "Sem Maka",
  "van.phrase.2": "Calma, Mano",
  "van.phrase.3": "Filho da Mutamba",
  "van.phrase.4": "Kota do Volante",
  "van.phrase.5": "Só na Paz",
  "van.phrase.6": "Mamã Confia",
  "van.phrase.7": "Rei da Marginal",
  // The house's own advert, on the back window of a van whose slot nobody has bought.
  "van.ad.house": "O teu anúncio aqui",
  // What the cobrador says. Drafts for the founder: {linha} is the line, {paragem} the place with its own preposition.
  "ride.cobrador.call": "{linha}. Há lugar, há lugar.",
  "ride.cobrador.asked": "Paragem na próxima, motorista.",
  "ride.cobrador.arrived": "Estamos {paragem}. Quem fica?",
  // Followed by the place with its own preposition, which the place brings: "na Marginal", "no Kilamba", "em Cazenga".
  "route.atStop": "Estamos",

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
