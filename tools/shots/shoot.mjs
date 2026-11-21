// pnpm shots <label>
//
// Builds nothing: it serves the client as it was last built (run `pnpm build`
// first), opens each page below in a real browser at phone and desktop size,
// and saves what it sees under screenshots/<label>/. The folder is not in
// git: it is for the founder and the team to look at.
//
//   screenshots/
//     0.7-styleguide/            one folder per task or occasion
//       styleguide_phone.png     <page>_<size>.png
//       styleguide_desktop.png
//       frontdoor_phone.png
//       ...
//       report.txt               what was checked on each page
//       index.html               every picture on one page
//       todas_1.png ...          the same, as pictures: look at ALL of them before calling a task done
//
// It also fails when a page scrolls sideways or logs an error, which no unit
// test can see.

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const label = process.argv[2];
if (!label || !/^[A-Za-z0-9._-]+$/.test(label)) {
  console.error("usage: pnpm shots <label>   for example: pnpm shots 0.7-styleguide");
  process.exit(1);
}

// The district is 256 m by 192 m: streets every 64 m, the promenade and the bay along the south.
const RUA = "at=70,97.6,1.65&look=130,95,7";
const ESQUINA = "at=103,104&look=116,88,5";
const PAGES = [
  ["frontdoor", "/"],
  ["styleguide", "/styleguide"],
  ["bench", "/bench"],
  ["bench-feito", "/bench?auto&seconds=3"],
  ["corpo-fila", "/corpo?hour=16.6"],
  ["corpo-fila-tras", "/corpo?hour=16.6&ang=180"],
  ["corpo-fila-lado", "/corpo?hour=12&ang=55"],
  ["corpo-fila-poupanca", "/corpo?hour=12&tier=poupanca"],
  ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((n) => [[`corpo-${n}`, `/corpo?hour=16.6&quem=${n}&ang=20`], [`corpo-${n}-rosto`, `/corpo?hour=15&quem=${n}&perto&ang=18`]]),
  ["corpo-2-tras", "/corpo?hour=16.6&quem=0&ang=160"],
  // The people of the street: two zungueiras, the police officer, the one who fishes.
  ...[8, 9, 10, 11, 12, 13, 14].flatMap((n) => [[`rua-${n}`, `/corpo?hour=16.6&quem=${n}&ang=25`], [`rua-${n}-tras`, `/corpo?hour=15&quem=${n}&ang=200`]]),
  // The age question and the card of origin (Tasks 2.6, 2.3).
  ["entrar", "/?entrar"],
  ["idade", "/?ano="],
  ["idade-meio", "/?ano=19"],
  ["idade-cheia", "/?ano=1990"],
  ["idade-cedo", "/?cedo"],
  ["origem-costas", "/origem?carta=%7B%22family%22%3A%22mecanico-zungueira%22%2C%22pai%22%3A%22mecanico%22%2C%22mae%22%3A%22zungueira%22%2C%22tier%22%3A%22aperto%22%2C%22province%22%3A%22malanje%22%2C%22bairro%22%3A%22cazenga%22%2C%22makuta%22%3A2500%2C%22version%22%3A1%7D"],
  ["origem-aperto", "/origem?virada&carta=%7B%22family%22%3A%22mecanico-zungueira%22%2C%22pai%22%3A%22mecanico%22%2C%22mae%22%3A%22zungueira%22%2C%22tier%22%3A%22aperto%22%2C%22province%22%3A%22malanje%22%2C%22bairro%22%3A%22cazenga%22%2C%22makuta%22%3A2500%2C%22version%22%3A1%7D"],
  ["origem-remediado", "/origem?virada&carta=%7B%22family%22%3A%22funcionario-professora%22%2C%22pai%22%3A%22funcionario%22%2C%22mae%22%3A%22professora%22%2C%22tier%22%3A%22remediado%22%2C%22province%22%3A%22huambo%22%2C%22bairro%22%3A%22vila-alice%22%2C%22makuta%22%3A7500%2C%22version%22%3A1%7D"],
  ["origem-bem", "/origem?virada&carta=%7B%22family%22%3A%22engenheiro-medica%22%2C%22pai%22%3A%22engenheiro%22%2C%22mae%22%3A%22medica%22%2C%22tier%22%3A%22bem%22%2C%22province%22%3A%22cabinda%22%2C%22bairro%22%3A%22kilamba%22%2C%22makuta%22%3A35000%2C%22version%22%3A1%7D"],
  ["origem-ouro", "/origem?virada&carta=%7B%22family%22%3A%22conselheiro-ministra%22%2C%22pai%22%3A%22conselheiro%22%2C%22mae%22%3A%22ministra%22%2C%22tier%22%3A%22ouro%22%2C%22province%22%3A%22luanda%22%2C%22bairro%22%3A%22talatona%22%2C%22makuta%22%3A250000%2C%22version%22%3A1%7D"],
  ["origem-longa", "/origem?virada&carta=%7B%22family%22%3A%22candongueiro-quitandeira%22%2C%22pai%22%3A%22candongueiro%22%2C%22mae%22%3A%22quitandeira%22%2C%22tier%22%3A%22aperto%22%2C%22province%22%3A%22icolo-e-bengo%22%2C%22bairro%22%3A%22rangel%22%2C%22makuta%22%3A1500%2C%22version%22%3A1%7D"],
  // The BI app, with an account given in the address.
  ["bi", "/andar?hour=16.8&cam=200&telemovel=bi&conta=%7B%22ageBand%22%3A%2218_plus%22%2C%22name%22%3A%22Caluanda%201042%22%2C%22nameFree%22%3Atrue%2C%22biNumber%22%3A%2200001042-LA%22%2C%22arrivedAt%22%3A%222026-11-15T16%3A00%3A00.000Z%22%2C%22origin%22%3A%7B%22family%22%3A%22mecanico-zungueira%22%2C%22pai%22%3A%22mecanico%22%2C%22mae%22%3A%22zungueira%22%2C%22tier%22%3A%22aperto%22%2C%22province%22%3A%22malanje%22%2C%22bairro%22%3A%22cazenga%22%2C%22makuta%22%3A2500%2C%22version%22%3A1%7D%7D"],
  ["bi-vazio", "/andar?hour=16.8&cam=200&telemovel=bi"],
  ["bi-dados", "/andar?hour=16.8&cam=200&telemovel=bi&conta=%7B%22ageBand%22%3A%2218_plus%22%2C%22name%22%3A%22Caluanda%201042%22%2C%22nameFree%22%3Atrue%2C%22biNumber%22%3A%2200001042-LA%22%2C%22arrivedAt%22%3A%222026-11-15T16%3A00%3A00.000Z%22%2C%22origin%22%3A%7B%22family%22%3A%22mecanico-zungueira%22%2C%22pai%22%3A%22mecanico%22%2C%22mae%22%3A%22zungueira%22%2C%22tier%22%3A%22aperto%22%2C%22province%22%3A%22malanje%22%2C%22bairro%22%3A%22cazenga%22%2C%22makuta%22%3A2500%2C%22version%22%3A1%7D%7D&dados"],
  // The player's own pano: the same screens in the other colourways.
  ["pano-azul-porta", "/?pano=azul"],
  ["pano-preto-porta", "/?pano=preto"],
  ["pano-dourado-porta", "/?pano=dourado"],
  ["pano-definicoes", "/andar?hour=16.8&cam=200&telemovel=definicoes"],
  ["pano-azul-definicoes", "/andar?hour=16.8&cam=200&telemovel=definicoes&pano=azul"],
  ["pano-dourado-definicoes", "/andar?hour=16.8&cam=200&telemovel=definicoes&pano=dourado"],
  ["pano-azul-carta", "/origem?carta=%7B%22family%22%3A%22mecanico-zungueira%22%2C%22pai%22%3A%22mecanico%22%2C%22mae%22%3A%22zungueira%22%2C%22tier%22%3A%22aperto%22%2C%22province%22%3A%22malanje%22%2C%22bairro%22%3A%22cazenga%22%2C%22makuta%22%3A2500%2C%22version%22%3A1%7D&pano=azul"],
  ["pano-dourado-carta", "/origem?carta=%7B%22family%22%3A%22mecanico-zungueira%22%2C%22pai%22%3A%22mecanico%22%2C%22mae%22%3A%22zungueira%22%2C%22tier%22%3A%22aperto%22%2C%22province%22%3A%22malanje%22%2C%22bairro%22%3A%22cazenga%22%2C%22makuta%22%3A2500%2C%22version%22%3A1%7D&pano=dourado"],
  ["pano-preto-carta", "/origem?carta=%7B%22family%22%3A%22mecanico-zungueira%22%2C%22pai%22%3A%22mecanico%22%2C%22mae%22%3A%22zungueira%22%2C%22tier%22%3A%22aperto%22%2C%22province%22%3A%22malanje%22%2C%22bairro%22%3A%22cazenga%22%2C%22makuta%22%3A2500%2C%22version%22%3A1%7D&pano=preto"],
  // The land (F-134): the imbondeiro, the mangueira, the red earth, the outdoors.
  // The banca of things to give, by the mercado (D-10.1), and the rehearsal town's.
  // A thing in the hand (F-257): carried, and held out.
  ["mao-tem", "/pose?tem=flores,perfume,pano,gelado&ang=25&pausa&t=1"],
  ["mao-tem-lado", "/pose?tem=chocolate,flores,rebucados,pano&ang=75&pausa&t=1"],
  ["mao-dar", "/pose?dar=flores,pano&quem=0,1&ang=70&pausa&t=1"],
  ["banca", "/cena?pack=l1&hour=15&tier=normal&at=139.5,153.5,1.7&look=143.5,160.4,1"],
  ["banca-perto", "/cena?pack=l1&hour=10&tier=alta&at=143.2,157.2,1.5&look=143.6,160.4,0.95"],
  ["banca-tarde", "/cena?pack=l1&hour=17.2&tier=normal&at=149,155,1.7&look=143.5,160.4,1.1"],
  // The geladaria of the Marginal, its esplanada toward the bay.
  ["geladaria", "/cena?pack=l1&hour=16&tier=normal&at=183,72,1.7&look=189,82,1.2"],
  ["geladaria-esplanada", "/cena?pack=l1&hour=17.3&tier=alta&at=192.5,72.5,1.6&look=188.5,82,1"],
  ["geladaria-noite", "/cena?pack=l1&hour=20&tier=normal&at=189,70,2.2&look=189,84,1.5"],
  // At the geladaria's counter, as the player sees it: facing it, and walking along its front (the awning is overhead).
  ["geladaria-balcao", "/andar?pack=l1&hour=16&em=188.5,85.27&cam=180"],
  ["geladaria-balcao-lado", "/andar?pack=l1&hour=16&em=188.5,85.27&cam=90"],
  ["geladaria-ensaio", "/cena?hour=16&tier=normal&at=55,78,1.7&look=60.6,86,1.2"],
  ["geladaria-ensaio-balcao", "/andar?hour=16&em=60.1,85.3&cam=90"],
  ["banca-ensaio", "/cena?hour=15&tier=normal&at=23.5,99.5,1.7&look=26.1,104.8,1"],
  ["terra-largo", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=214,170,2.2&look=230,184,4"],
  ["terra-largo-alto", "/cena?pack=l1&hour=12&tier=alta&transito=30&at=232,150,30&look=231,186,0"],
  ["terra-largo-tarde", "/cena?pack=l1&hour=17&tier=normal&transito=30&at=246,196,2.0&look=230,184,4.5"],
  ["terra-outdoor", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=142,96,2&look=148,108.7,4.4"],
  ["terra-outdoor-2", "/cena?pack=l1&hour=16.6&tier=normal&transito=30&at=222,100,2&look=232,113,4.4"],
  ["terra-outdoor-noite", "/cena?pack=l1&hour=20&tier=normal&transito=30&at=310,96,2&look=318,106.4,4.4"],
  ["terra-imbondeiro", "/cena?hour=15&tier=normal&at=58,18,2&look=70.5,6.4,4.2"],
  ["terra-imbondeiro-perto", "/cena?hour=16.8&tier=normal&at=76,12,1.7&look=70.5,6.4,3.4"],
  ["terra-imbondeiro-2", "/cena?hour=12&tier=normal&at=176,66,2&look=186.6,56.3,4.2"],
  ["terra-mangueira", "/cena?hour=15&tier=normal&at=22,94,2&look=13.6,101.5,3.2"],
  ["terra-bairro-alto", "/cena?hour=15&tier=alta&at=96,20,46&look=96,70,0"],
  ["terra-bairro-rua", "/cena?hour=16.6&tier=normal&at=20,31,1.7&look=60,33,1.4"],
  ["terra-poupanca", "/cena?hour=15&tier=poupanca&at=58,18,2&look=70.5,6.4,4.2"],
  // The signs over places (what each is), in the pano's colours.
  ["sinais-largo", "/andar?pack=l1&em=216,166&cam=140&hour=16.5&transito=30"],
  ["sinais-largo-2", "/andar?pack=l1&em=222,172&cam=320&hour=12&transito=30"],
  ["sinais-marginal", "/andar?pack=l1&em=188,84&cam=250&hour=16.8&transito=30"],
  ["sinais-noite", "/andar?pack=l1&em=216,166&cam=140&hour=20.5&transito=30"],
  ["sinais-cena", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=196,160,3&look=220,170,3"],
  // Names over whoever is standing still and near: the sellers seated before the market, the man who fishes.
  ["nomes-vendedeiras", "/andar?pack=l1&em=121,157.2&cam=20&hour=15&transito=10"],
  ["nomes-vendedeiras-2", "/andar?pack=l1&em=117,158&cam=300&hour=16.5&transito=10"],
  ["nomes-pescador", "/andar?pack=l1&em=364,52.5&cam=140&hour=16.5&transito=30"],
  ["nomes-largo", "/andar?pack=l1&em=212,172&cam=200&hour=12&transito=30"],
  // The tables of the Largo (Task 4B.1): each kind its own, kotas at them, the boards as they stand.
  ["mesas-largo", "/andar?pack=l1&em=203,165.5&cam=180&hour=10.5&transito=30"],
  ["mesas-largo-tarde", "/andar?pack=l1&em=199,166&cam=205&hour=16.8&transito=30"],
  ["mesas-largo-noite", "/andar?pack=l1&em=203,165.5&cam=180&hour=20.5&transito=30"],
  ["mesas-xadrez-perto", "/andar?pack=l1&em=199.9,172.4&cam=180&hour=12&transito=30"],
  ["mesas-damas-perto", "/andar?pack=l1&em=208.9,172.4&cam=180&hour=12&transito=30"],
  ["mesas-ludo-perto", "/andar?pack=l1&em=194.3,172.4&cam=180&hour=12&transito=30"],
  ["hud", "/andar?hour=16.8&cam=200"],
  ...["acenar", "rir", "aplaudir", "chamar", "dancar"].map((g, i) => [`hud-${g}`, `/andar?hour=16.8&cam=${i % 2 ? 150 : 30}&quem=${i + 1}&gesto=${g}`]),
  ["ela-joelhos-lado", "/andar?hour=15&cam=90&quem=6&gesto=dancar&t=6.0&pausa"],
  ["ela-joelhos-frente", "/andar?hour=15&cam=20&quem=2&gesto=dancar&t=6.1&pausa"],
  ["hud-sentar", "/andar?hour=16.8&cam=40&quem=4&sentar"],
  ["hud-sentar-calcas", "/andar?hour=12&cam=320&quem=1&sentar"],
  ["hud-esquerda", "/andar?hour=16.8&cam=200&mao=esquerda&quem=2"],
  // The candongueiro, parked at a paragem of the rehearsal town.
  ["carrinha-lado", "/cena?hour=15&tier=normal&at=115,101,1.6&look=115,93.3,1.0"],
  ["carrinha-frente", "/cena?hour=15&tier=normal&at=108,98,1.5&look=115,93.3,1.0"],
  ["carrinha-tras", "/cena?hour=16.8&tier=normal&at=122,98.5,1.9&look=115,93.3,0.9"],
  ["carrinha-porta", "/cena?hour=12&tier=normal&at=110.5,88.6,1.7&look=115.5,93.3,1.0"],
  ["carrinha-cima", "/cena?hour=12&tier=normal&at=119,99,5.5&look=115,93.3,0.8"],
  // The other vehicles, standing in the rehearsal town's street.
  ["veiculos-fila", "/cena?hour=15&tier=normal&at=125,91.7,2.2&look=125,98.7,0.8"],
  ["veiculos-carro", "/cena?hour=16.5&tier=normal&at=125.5,94.7,1.4&look=122,98.7,0.8"],
  ["veiculos-carro-tras", "/cena?hour=12&tier=normal&at=118.2,95.7,1.5&look=122,98.7,0.8"],
  ["veiculos-kupapata", "/cena?hour=15&tier=normal&at=131,95.2,1.5&look=128,98.7,0.9"],
  ["veiculos-kupapata-tras", "/cena?hour=12&tier=normal&at=124.6,95.7,1.6&look=128,98.7,0.9"],
  ["veiculos-mota", "/cena?hour=15&tier=normal&at=134.8,96.2,1.3&look=133,98.7,0.7"],
  ["veiculos-noite", "/cena?hour=20.5&tier=normal&at=125,91.7,2.2&look=125,98.7,0.8"],
  ["carrinha-vidro", "/cena?hour=15&tier=normal&at=121.2,95.2,1.5&look=115,93.3,1.3"],
  ["carrinha-noite", "/cena?hour=20.5&tier=normal&at=108,98,1.5&look=115,93.3,1.0"],
  // The vans on their linhas in Marginal e Baixa (transito=3: one stands at each line's first paragem).
  ["transito-paragem", "/cena?pack=l1&hour=16.5&tier=normal&transito=3&at=313,110.5,1.6&look=304,104.5,1.0"],
  ["transito-paragem-tras", "/cena?pack=l1&hour=12&tier=normal&transito=3&at=294,109.5,1.7&look=304,104.5,1.0"],
  ["transito-arranca", "/cena?pack=l1&hour=16.5&tier=normal&transito=22&at=300,97,3.2&look=325,105,1.0"],
  ["transito-mutamba", "/cena?pack=l1&hour=17.3&tier=normal&transito=3&at=227,161.5,1.7&look=237,156.5,1.0"],
  ["transito-vidro", "/cena?pack=l1&hour=15&tier=normal&transito=3&at=294.5,105.6,1.5&look=301,104.9,1.3"],
  ["transito-vidro-mutamba", "/cena?pack=l1&hour=16.5&tier=normal&transito=3&at=230.5,156.6,1.5&look=237,156,1.3"],
  ["transito-avenida", "/cena?pack=l1&hour=16.5&tier=normal&transito=100&at=240,100.5,2.6&look=290,104,1.0"],
  ["transito-avenida-2", "/cena?pack=l1&hour=12&tier=normal&transito=131&at=330,90,3.0&look=290,97,1.0"],
  ["transito-quarteirao", "/cena?pack=l1&hour=15&tier=normal&transito=64&at=262,160.5,2.2&look=300,156,1.0"],
  ["transito-do-alto", "/cena?pack=l1&hour=15&tier=alta&transito=60&at=224,40,70&look=224,120,0"],
  ["transito-noite", "/cena?pack=l1&hour=20.5&tier=normal&transito=3&at=313,110.5,1.6&look=304,104.5,1.0"],
  // The people of the street in Marginal e Baixa, at fixed moments of their timetables.
  ["gente-pescador", "/cena?pack=l1&hour=16.5&tier=normal&transito=30&at=367.5,53.5,1.6&look=362,48.8,1.1"],
  ["gente-pescador-lado", "/cena?pack=l1&hour=12&tier=normal&transito=30&at=357,50.5,1.5&look=362,48.8,1.2"],
  ["gente-policia-chama", "/cena?pack=l1&hour=16.5&tier=normal&transito=90.8&at=372,56,1.7&look=364,49.5,1.1"],
  ["gente-corrida", "/cena?pack=l1&hour=16.5&tier=normal&transito=95.5&at=336,61,1.8&look=347,54,1.0"],
  ["gente-passeio", "/cena?pack=l1&hour=17.2&tier=normal&transito=30&at=250,66.5,1.7&look=215,66,1.2"],
  ["gente-passeio-2", "/cena?pack=l1&hour=12&tier=normal&transito=200&at=300,63,1.7&look=340,58,1.2"],
  ["gente-do-alto", "/cena?pack=l1&hour=15&tier=alta&transito=30&at=230,36,26&look=230,70,0"],
  ["gente-mutamba", "/cena?pack=l1&hour=17&tier=normal&transito=10&at=247,170,1.7&look=238,165.5,1.1"],
  ["gente-bandeira", "/cena?pack=l1&hour=15&tier=normal&transito=20&at=226,103,1.8&look=209,116,6.5"],
  ["gente-bandeira-perto", "/cena?pack=l1&hour=12&tier=normal&transito=20&at=213,110.5,3.5&look=209.5,115.6,8.6"],
  ["gente-fortaleza", "/cena?pack=l1&hour=16.5&tier=alta&transito=20&at=95,70,6&look=45,95,16"],
  ["gente-zunga", "/cena?pack=l1&hour=15&tier=normal&transito=20&at=203,109,1.6&look=212,114.2,1.2"],
  ["gente-zunga-corrida", "/cena?pack=l1&hour=15&tier=normal&transito=42.5&at=186,110,1.7&look=200,114,1.1"],
  ["gente-posto", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=392,58,1.7&look=384,70,2.4"],
  ["gente-vendedeiras", "/cena?pack=l1&hour=15&tier=normal&transito=10&at=127.5,155.8,1.5&look=123.5,160,0.5"],
  ["gente-vendedeiras-perto", "/cena?pack=l1&hour=12&tier=normal&transito=10&at=121,157.6,1.2&look=118.2,160.2,0.55"],
  ["gente-vendedeiras-lado", "/cena?pack=l1&hour=16.5&tier=normal&transito=31&at=113.5,159,1.3&look=120,160.1,0.6"],
  ["gente-poupanca", "/cena?pack=l1&hour=17.2&tier=poupanca&transito=30&at=250,66.5,1.7&look=215,66,1.2"],
  ["viagem-espera", "/andar?pack=l1&em=302.5,107.4&cam=215&quem=2&hour=16.8&transito=3"],
  // The look chooser, on a few looks.
  ["provador-galo", "/provador?hour=15.5&ang=35&look=%7B%22sex%22%3A%22m%22%2C%22skin%22%3A3%2C%22hair%22%3A%22galo%22%2C%22hairColour%22%3A%22hairBlond%22%2C%22top%22%3A%22tshirt%22%2C%22topColour%22%3A%22paintWhite%22%2C%22bottom%22%3A%22trousers%22%2C%22bottomColour%22%3A%22jeansDark%22%2C%22shoe%22%3A%22shoeWhite%22%7D"],
  ["provador-galo-vermelho", "/provador?hour=15.5&ang=150&look=%7B%22sex%22%3A%22m%22%2C%22skin%22%3A1%2C%22hair%22%3A%22galo%22%2C%22hairColour%22%3A%22hairRed%22%2C%22top%22%3A%22alcas%22%2C%22topColour%22%3A%22clothBlack%22%2C%22bottom%22%3A%22shorts%22%2C%22bottomColour%22%3A%22khaki%22%2C%22shoe%22%3A%22shoe%22%7D"],
  ["provador-afro-ele", "/provador?hour=15.5&ang=20&look=%7B%22sex%22%3A%22m%22%2C%22skin%22%3A4%2C%22hair%22%3A%22afro%22%2C%22hairColour%22%3A%22hairBlack%22%2C%22top%22%3A%22long%22%2C%22topColour%22%3A%22vanBlue%22%2C%22bottom%22%3A%22trousers%22%2C%22bottomColour%22%3A%22clothBlack%22%2C%22shoe%22%3A%22shoe%22%7D"],
  ["provador-cachos", "/provador?hour=15.5&ang=25&look=%7B%22sex%22%3A%22f%22%2C%22skin%22%3A1%2C%22hair%22%3A%22cachos%22%2C%22hairColour%22%3A%22hairBrown%22%2C%22top%22%3A%22alcas%22%2C%22topColour%22%3A%22paintWhite%22%2C%22bottom%22%3A%22trousers%22%2C%22bottomColour%22%3A%22jeans%22%2C%22shoe%22%3A%22shoeWhite%22%7D"],
  ["provador-bob", "/provador?hour=15.5&ang=20&look=%7B%22sex%22%3A%22f%22%2C%22skin%22%3A3%2C%22hair%22%3A%22bob%22%2C%22hairColour%22%3A%22hairCopper%22%2C%22top%22%3A%22alcas%22%2C%22topColour%22%3A%22clothBlack%22%2C%22bottom%22%3A%22skirt%22%2C%22bottomColour%22%3A%22clothBlack%22%2C%22shoe%22%3A%22shoe%22%7D"],
  ["provador-vestido", "/provador?hour=15.5&ang=30&look=%7B%22sex%22%3A%22f%22%2C%22skin%22%3A2%2C%22hair%22%3A%22puxinho%22%2C%22hairColour%22%3A%22hairBlack%22%2C%22top%22%3A%22vestido%22%2C%22topColour%22%3A%22awningRed%22%2C%22bottom%22%3A%22none%22%2C%22shoe%22%3A%22shoeTan%22%7D"],
  ["provador-pano", "/provador?hour=15.5&ang=200&look=%7B%22sex%22%3A%22f%22%2C%22skin%22%3A4%2C%22hair%22%3A%22lenco%22%2C%22hairColour%22%3A%22awningGold%22%2C%22top%22%3A%22blusa%22%2C%22topColour%22%3A%22paintWhite%22%2C%22bottom%22%3A%22pano%22%2C%22bottomColour%22%3A%22zincBlue%22%2C%22bands%22%3A%22awningGold%22%2C%22shoe%22%3A%22shoeTan%22%7D"],
  ["provador-careca", "/provador?hour=15.5&ang=20&look=%7B%22sex%22%3A%22m%22%2C%22skin%22%3A2%2C%22hair%22%3A%22careca%22%2C%22top%22%3A%22tshirt%22%2C%22topColour%22%3A%22awningGold%22%2C%22bottom%22%3A%22shorts%22%2C%22bottomColour%22%3A%22jeans%22%2C%22shoe%22%3A%22shoeWhite%22%7D"],
  ["provador-galo-perfil", "/provador?hour=15.5&ang=90&look=%7B%22sex%22%3A%22m%22%2C%22skin%22%3A3%2C%22hair%22%3A%22galo%22%2C%22hairColour%22%3A%22hairBlond%22%2C%22top%22%3A%22tshirt%22%2C%22topColour%22%3A%22paintWhite%22%2C%22bottom%22%3A%22trousers%22%2C%22bottomColour%22%3A%22jeansDark%22%2C%22shoe%22%3A%22shoeWhite%22%7D"],
  ["provador-bob-tras", "/provador?hour=15.5&ang=180&look=%7B%22sex%22%3A%22f%22%2C%22skin%22%3A3%2C%22hair%22%3A%22bob%22%2C%22hairColour%22%3A%22hairCopper%22%2C%22top%22%3A%22alcas%22%2C%22topColour%22%3A%22clothBlack%22%2C%22bottom%22%3A%22skirt%22%2C%22bottomColour%22%3A%22clothBlack%22%2C%22shoe%22%3A%22shoe%22%7D"],
  ["provador-oculos", "/provador?hour=15.5&ang=20&perto&look=%7B%22sex%22%3A%22m%22%2C%22skin%22%3A3%2C%22hair%22%3A%22galo%22%2C%22hairColour%22%3A%22hairBlond%22%2C%22top%22%3A%22tshirt%22%2C%22topColour%22%3A%22paintWhite%22%2C%22bottom%22%3A%22trousers%22%2C%22bottomColour%22%3A%22jeansDark%22%2C%22shoe%22%3A%22shoeWhite%22%2C%22extras%22%3A%5B%22oculos%22%2C%22brincos%22%2C%22bigode%22%5D%2C%22tall%22%3A1%2C%22broad%22%3A1%7D"],
  ["provador-oculos-corpo", "/provador?hour=15.5&ang=35&look=%7B%22sex%22%3A%22m%22%2C%22skin%22%3A3%2C%22hair%22%3A%22galo%22%2C%22hairColour%22%3A%22hairBlond%22%2C%22top%22%3A%22tshirt%22%2C%22topColour%22%3A%22paintWhite%22%2C%22bottom%22%3A%22trousers%22%2C%22bottomColour%22%3A%22jeansDark%22%2C%22shoe%22%3A%22shoeWhite%22%2C%22extras%22%3A%5B%22oculos%22%2C%22brincos%22%2C%22bigode%22%5D%2C%22tall%22%3A1%2C%22broad%22%3A1%7D"],
  ["provador-barba", "/provador?hour=15.5&ang=20&perto&look=%7B%22sex%22%3A%22m%22%2C%22skin%22%3A0%2C%22hair%22%3A%22bone%22%2C%22hairColour%22%3A%22awningRed%22%2C%22top%22%3A%22long%22%2C%22topColour%22%3A%22clothBlack%22%2C%22bottom%22%3A%22trousers%22%2C%22bottomColour%22%3A%22khaki%22%2C%22shoe%22%3A%22shoe%22%2C%22extras%22%3A%5B%22barba%22%5D%2C%22tall%22%3A-1%2C%22broad%22%3A1%7D"],
  ["provador-barba-corpo", "/provador?hour=15.5&ang=35&look=%7B%22sex%22%3A%22m%22%2C%22skin%22%3A0%2C%22hair%22%3A%22bone%22%2C%22hairColour%22%3A%22awningRed%22%2C%22top%22%3A%22long%22%2C%22topColour%22%3A%22clothBlack%22%2C%22bottom%22%3A%22trousers%22%2C%22bottomColour%22%3A%22khaki%22%2C%22shoe%22%3A%22shoe%22%2C%22extras%22%3A%5B%22barba%22%5D%2C%22tall%22%3A-1%2C%22broad%22%3A1%7D"],
  ["provador-brincos", "/provador?hour=15.5&ang=20&perto&look=%7B%22sex%22%3A%22f%22%2C%22skin%22%3A3%2C%22hair%22%3A%22bob%22%2C%22hairColour%22%3A%22hairCopper%22%2C%22top%22%3A%22alcas%22%2C%22topColour%22%3A%22clothBlack%22%2C%22bottom%22%3A%22skirt%22%2C%22bottomColour%22%3A%22awningRed%22%2C%22shoe%22%3A%22shoe%22%2C%22extras%22%3A%5B%22brincos%22%2C%22oculos%22%5D%2C%22tall%22%3A1%2C%22broad%22%3A-1%7D"],
  ["provador-brincos-corpo", "/provador?hour=15.5&ang=35&look=%7B%22sex%22%3A%22f%22%2C%22skin%22%3A3%2C%22hair%22%3A%22bob%22%2C%22hairColour%22%3A%22hairCopper%22%2C%22top%22%3A%22alcas%22%2C%22topColour%22%3A%22clothBlack%22%2C%22bottom%22%3A%22skirt%22%2C%22bottomColour%22%3A%22awningRed%22%2C%22shoe%22%3A%22shoe%22%2C%22extras%22%3A%5B%22brincos%22%2C%22oculos%22%5D%2C%22tall%22%3A1%2C%22broad%22%3A-1%7D"],
  // The viaduct: the road on pillars, the painted bank, the market in its shade.
  ["viaduto", "/cena?pack=l1&hour=15&tier=normal&transito=40&at=412,176,1.8&look=438,180,4.5"],
  ["viaduto-mural", "/cena?pack=l1&hour=16.5&tier=normal&transito=40&at=424,170,1.7&look=433.5,181,2.6"],
  ["viaduto-sombra", "/cena?pack=l1&hour=12&tier=normal&transito=12&at=425,214,1.7&look=437,226,2.0"],
  ["viaduto-debaixo", "/cena?pack=l1&hour=12&tier=normal&transito=12&at=438,236,1.7&look=437,214,2.4"],
  ["viaduto-rampa", "/cena?pack=l1&hour=16.5&tier=normal&transito=75&at=424,96,2.2&look=438,128,3.0"],
  ["viaduto-do-alto", "/cena?pack=l1&hour=15&tier=alta&transito=75&at=392,150,30&look=438,180,2"],
  ["viaduto-noite", "/cena?pack=l1&hour=20.2&tier=normal&transito=40&at=412,176,1.8&look=438,180,4.5"],
  // The Palácio de Ferro, after its second pass.
  ["ferro", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=270,160.5,1.7&look=284,179,4.2"],
  ["ferro-frente", "/cena?pack=l1&hour=16.6&tier=normal&transito=30&at=284,161.5,1.7&look=284,172,4.4"],
  ["ferro-perto", "/cena?pack=l1&hour=12&tier=normal&transito=30&at=279,169.2,1.7&look=283.5,172.4,3.0"],
  ["ferro-noite", "/cena?pack=l1&hour=20.2&tier=normal&transito=30&at=270,160.5,1.7&look=284,179,4.2"],
  // The pink building and the fortress, after their second pass.
  ["rosa2", "/cena?pack=l1&hour=16.5&tier=normal&transito=30&at=196,96,1.8&look=214,118,8"],
  ["rosa2-frente", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=224,98,1.8&look=224,118,7"],
  ["rosa2-arcada", "/cena?pack=l1&hour=12&tier=normal&transito=30&at=208,112.5,1.7&look=226,117.5,3.2"],
  ["rosa2-baia", "/cena?pack=l1&hour=17.2&tier=normal&transito=30&at=226,56,1.8&look=215,118,9"],
  ["forte2", "/cena?pack=l1&hour=16.5&tier=normal&transito=30&at=84,140,16&look=58,132,20"],
  ["forte2-baia", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=120,66,2&look=45,125,18"],
  ["forte2-miradouro", "/cena?pack=l1&hour=17.2&tier=normal&transito=30&at=52,99,14.6&look=42,118,19"],
  ["forte2-do-alto", "/cena?pack=l1&hour=12&tier=alta&transito=30&at=92,96,44&look=42,130,14"],
  // The mural.
  ["mural", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=207,164.5,1.7&look=207,173,2.0"],
  ["mural-lado", "/cena?pack=l1&hour=16.8&tier=normal&transito=30&at=190,166,1.7&look=205,172.6,2.0"],
  // Street name plates and the crossing's sign.
  ["placas-avenida", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=262,113.5,1.7&look=268.9,109.5,2.6"],
  ["placas-avenida-perto", "/cena?pack=l1&hour=12&tier=normal&transito=30&at=266.5,106,2.0&look=268.9,109.9,2.6"],
  ["placas-rua", "/cena?pack=l1&hour=16.5&tier=normal&transito=30&at=264,153.5,1.7&look=268.9,149.1,2.5"],
  ["placas-largo", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=190,157,1.7&look=191,162.2,2.6"],
  ["placas-passadeira", "/cena?pack=l1&hour=15&tier=normal&transito=30&at=253,108,1.6&look=259.1,109.5,2.2"],
  // Arriving: the screen while the first view comes down, held.
  ["chegar", "/andar?pack=l1&em=250,68&hour=16.8&chegar"],
  // The Telemóvel: its home grid, the Mapa, Definições, an app that is not here yet (&telemovel=<app> opens it).
  ["telemovel", "/andar?pack=l1&em=250,68&cam=200&hour=16.8&transito=30&telemovel"],
  ["telemovel-mapa", "/andar?pack=l1&em=250,68&cam=200&hour=16.8&transito=30&telemovel=mapa"],
  ["telemovel-definicoes", "/andar?pack=l1&em=250,68&cam=200&hour=16.8&transito=30&telemovel=definicoes"],
  ["telemovel-banco", "/andar?pack=l1&em=250,68&cam=200&hour=20&transito=30&telemovel=banco"],
  // The jump, held at three moments of it.
  ["salto-inicio", "/andar?hour=16.8&cam=70&quem=1&salto=0.2"],
  ["salto-alto", "/andar?hour=16.8&cam=70&quem=1&salto=0.5"],
  ["salto-alto-ela", "/andar?hour=16.8&cam=110&quem=6&salto=0.5"],
  ["salto-alto-pano", "/andar?hour=16.8&cam=30&quem=0&salto=0.5"],
  ["salto-fim", "/andar?hour=16.8&cam=70&quem=3&salto=0.85"],
  // Marginal e Baixa. The bay is to the north; the shore is at about z=62 in the middle and z=24 at the ends.
  ["l1-do-alto", "/cena?pack=l1&hour=15&tier=alta&at=224,-70,95&look=224,110,0"],
  ["l1-do-alto-oeste", "/cena?pack=l1&hour=16.5&tier=alta&at=20,10,60&look=200,120,0"],
  ["l1-passeio", "/cena?pack=l1&hour=17.2&tier=normal&at=150,58,1.8&look=260,70,4"],
  ["l1-passeio-meio-dia", "/cena?pack=l1&hour=12&tier=normal&at=330,58,1.8&look=230,72,4"],
  ["l1-passeio-poupanca", "/cena?pack=l1&hour=17.2&tier=poupanca&at=150,58,1.8&look=260,70,4"],
  ["l1-rosa", "/cena?pack=l1&hour=16.5&tier=normal&at=176,78,1.8&look=222,128,10"],
  ["l1-avenida", "/cena?pack=l1&hour=10&tier=normal&at=270,106,1.8&look=180,96,6"],
  ["l1-miradouro", "/cena?pack=l1&hour=17.4&tier=alta&at=52,94,14.6&look=230,66,0"],
  ["l1-fortaleza", "/cena?pack=l1&hour=16&tier=normal&at=112,120,1.8&look=45,128,12"],
  ["l1-mutamba", "/cena?pack=l1&hour=16&tier=normal&at=194,166,1.8&look=240,176,4"],
  ["l1-ferro", "/cena?pack=l1&hour=15&tier=normal&at=300,160,1.8&look=284,180,5"],
  ["l1-mercado", "/cena?pack=l1&hour=11&tier=normal&at=112,160,1.8&look=140,172,2"],
  ["l1-igreja", "/cena?pack=l1&hour=16.5&tier=normal&at=224,203,1.8&look=224,220,9"],
  ["l1-pontao", "/cena?pack=l1&hour=17.6&tier=normal&at=226,36,1.9&look=226,90,8"],
  ["l1-noite", "/cena?pack=l1&hour=20.5&tier=normal&at=150,58,1.8&look=260,70,4"],
  ["l1-campos", "/cena?pack=l1&hour=15&tier=normal&at=276,66,1.8&look=320,82,1"],
  ["marginal-dourada", "/cena?hour=17.4&tier=normal&still"],
  ["marginal-poupanca", "/cena?hour=17.4&tier=poupanca&still"],
  ["marginal-alta", "/cena?hour=17.4&tier=alta&still"],
  ["marginal-meio-dia", "/cena?hour=12&tier=normal&still"],
  ["marginal-por-do-sol", "/cena?hour=17.95&tier=normal&still"],
  ["marginal-noite", "/cena?hour=21&tier=normal&still"],
  ["marginal-noite-poupanca", "/cena?hour=21&tier=poupanca&still"],
  ["rua-dourada", `/cena?hour=17.4&tier=normal&${RUA}`],
  ["rua-poupanca", `/cena?hour=17.4&tier=poupanca&${RUA}`],
  ["rua-manha", `/cena?hour=8&tier=normal&${RUA}`],
  ["rua-noite", `/cena?hour=21&tier=normal&${RUA}`],
  ["esquina-dourada", `/cena?hour=17.4&tier=normal&${ESQUINA}`],
  ["esquina-poupanca", `/cena?hour=12&tier=poupanca&${ESQUINA}`],
  ["bairro-dia", "/cena?hour=10&tier=normal&at=26,31,1.7&look=66,32,3"],
  ["bairro-dourada", "/cena?hour=17.3&tier=normal&at=84,31,1.7&look=40,32,3"],
  ["bairro-poupanca", "/cena?hour=15&tier=poupanca&at=26,31,1.7&look=66,32,3"],
  ["bairro-noite", "/cena?hour=20.5&tier=normal&at=26,31,1.7&look=66,32,3"],
  ["bairro-quintal", "/cena?hour=16&tier=normal&at=112,34,1.7&look=120,14,2"],
  ["bairro-do-alto", "/cena?hour=15&tier=alta&at=96,70,34&look=96,24,0"],
  ["baia", "/cena?hour=17.4&tier=normal&at=140,176,1.8&look=200,215,2"],
  ["baia-meio-dia", "/cena?hour=12&tier=poupanca&at=140,176,1.8&look=200,215,2"],
  ["do-alto", "/cena?hour=15&tier=alta&at=128,210,46&look=128,110,0"],
];
/** Pages whose movement is worth a film: the interface, and one walk down the promenade. */
const FILMS = [
  ["styleguide", "/styleguide"],
  ["passeio", "/cena?hour=17.4&tier=normal"],
  ["andar-frente", "/andar?auto&cam=75&quem=1&hour=16.8"],
  ["andar-gestos", "/andar?auto&cam=200&quem=3&hour=16.8"],
  ["danca-frente", "/andar?cam=0&quem=1&hour=16.8&gesto=dancar"],
  ["danca-lado", "/andar?cam=95&quem=5&hour=16.8&gesto=dancar"],
  ["danca-pano", "/andar?cam=20&quem=0&hour=16.8&gesto=dancar"],
  ["danca-ela", "/andar?cam=110&quem=6&hour=16.8&gesto=dancar"],
  ["gente-andar", "/andar?pack=l1&em=352,54.5&cam=285&quem=1&hour=16.8&desde=76"],
  // Boarding at the Marginal paragem and riding to the next: the page boards by itself (&apanhar).
  ["viagem", "/andar?pack=l1&em=302.5,107.4&cam=200&quem=2&hour=16.8&desde=0&apanhar"],
  ["viagem-noite", "/andar?pack=l1&em=302.5,107.4&cam=200&quem=2&hour=19.6&desde=0&apanhar"],
  ["rodar-avenida", "/andar?pack=l1&em=250,110.6&cam=25&quem=3&hour=16.8&desde=0"],
  ["rodar-quarteirao", "/andar?pack=l1&em=300,159.6&cam=340&quem=5&hour=15&desde=20"],
  ["transito-andar", "/andar?pack=l1&em=297,107.2&cam=250&quem=4&hour=16.8"],
  // Jumping: on the spot, at a run, and over the planted strip of the Marginal's avenue.
  ["salto-parado", "/andar?salto&cam=70&quem=1&hour=16.8"],
  ["salto-corrida", "/andar?auto&salto&cam=20&quem=3&hour=16.8"],
  ["salto-separador", "/andar?pack=l1&em=170,97.5&auto=180&salto&cam=265&quem=6&hour=16.8"],
  ["andar-lado", "/andar?auto&cam=0&quem=0&hour=16.8"],
  ["andar-tras", "/andar?auto&cam=270&quem=5&hour=16.8"],
];
const SIZES = [
  ["phone", 360, 740],
  ["desktop", 1280, 900],
];
const PORT = 4173;
const out = join(root, "screenshots", label);
mkdirSync(out, { recursive: true });

const server = spawn("pnpm", ["--filter", "@nzila/client", "exec", "vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  shell: true,
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("the preview server did not start. Run `pnpm build` first.");
}

// A run that has stopped moving is stopped, not waited for: it has hung before, and held its port (finding F-135).
// The clock starts again at every picture: a long list of pages is not a hung run (F-228), ten minutes without one is.
let watchdog;
const moving = () => {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    console.error("shots: nothing finished in ten minutes; stopping. What was taken is in the folder.");
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill();
    process.exit(1);
  }, 10 * 60 * 1000);
  watchdog.unref();
};
moving();

const report = [`${label}, taken ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, ""];
let problems = 0;
const taken = [];
// The world is drawn on the machine's graphics card, not in software: the software renderer drew the
// world at 8 to 13 frames a second, so each page took long to settle and lowered its own picture to
// keep up, and the full run took over two hours (F-253). Chromium falls back to software by itself
// where there is no card it can use.
const launch = () => chromium.launch({ args: ["--use-angle=default", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
// Two pages at once: most of a page's time is waiting for the world to arrive and settle. More than
// two fight over the one graphics card and are slower (24 pages: 142 s alone, 84 s two at once, 92 s three, 141 s four).
const WORKERS = Math.max(1, Number(process.env.SHOTS_WORKERS ?? 2));
const browsers = [];
/** Runs `job` over `items` with `count` workers, each with its own browser, renewed every forty pages (F-212). */
async function inParallel(items, count, job) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(count, items.length) }, async () => {
      let browser = await launch();
      browsers.push(browser);
      let opened = 0;
      while (next < items.length) {
        const item = items[next++];
        if (++opened % 40 === 0) {
          await browser.close();
          browser = await launch();
          browsers.push(browser);
        }
        await job(browser, item);
        moving();
      }
      await browser.close();
    }),
  );
}
try {
  await waitForServer();
  const only = process.argv[3];
  // `pnpm shots <label> corpo` takes only the pages whose name begins that way; `corpo,rua` takes both.
  const wanted = (name) => !only || only.split(",").some((prefix) => name.startsWith(prefix));
  const stills = [];
  for (const [pageName, path] of PAGES) {
    if (!wanted(pageName)) continue;
    for (const [sizeName, width, height] of SIZES) {
      // A face fills either screen the same way: once is enough.
      if (pageName.endsWith("-rosto") && sizeName === "phone") continue;
      stills.push({ pageName, path, sizeName, width, height, order: stills.length });
    }
  }
  const lines = [];
  await inParallel(stills, WORKERS, async (browser, { pageName, path, sizeName, width, height, order }) => {
      const started = Date.now();
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
      page.setDefaultTimeout(60_000);
      const errors = [];
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
      await page.evaluate("document.fonts.ready");
      // A page that draws the world is ready when every chunk it wants is on screen; a bench, when it has its result.
      if (path.startsWith("/cena")) {
        await page.waitForFunction("window.__cena?.stream ? window.__cena.stream.shown > 0 && window.__cena.stream.shown === window.__cena.stream.wanted && window.__cena.stream.loading === 0 : false", undefined, { timeout: 30000 }).catch(() => errors.push("the world never finished arriving"));
      }
      if (path.startsWith("/corpo")) await page.waitForFunction("window.__corpo !== undefined", undefined, { timeout: 30000 }).catch(() => errors.push("the people never arrived"));
      if (path.startsWith("/provador")) await page.waitForFunction("window.__provador?.ready === true", undefined, { timeout: 30000 }).catch(() => errors.push("nobody was dressed"));
      if (path.startsWith("/andar")) {
        await page.waitForFunction("window.__andar?.ready === true", undefined, { timeout: 30000 }).catch(() => errors.push("the person never arrived"));
        await page.waitForTimeout(pageName.startsWith("ela-") ? 1900 : 3000);
      }
      if (path.includes("auto") && path.startsWith("/bench")) await page.waitForFunction("window.__bench !== undefined", undefined, { timeout: 60000 });
      await page.waitForTimeout(path === "/bench" ? 3500 : 900);
      const sideways = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
      const file = `${pageName}_${sizeName}.png`;
      await page.screenshot({ path: join(out, file), fullPage: true });
      // What a view of the world costs to draw, beside its picture: the budget is 120 draw calls and 120 000 triangles.
      const cost = path.startsWith("/cena") ? await page.evaluate("window.__cena ? `${window.__cena.draws} draws, ${window.__cena.triangles} triangles` : ''") : "";
      await page.close();
      const faults = [...(sideways > 0 ? [`scrolls sideways by ${sideways} px`] : []), ...errors.map((e) => `error: ${e}`)];
      problems += faults.length;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      lines[order] = { file, line: `${file}  ${width}x${height}  ${seconds} s  ${cost ? `${cost}  ` : ""}${faults.length ? faults.join("; ") : "ok"}` };
  });
  // In the order of the list, whichever worker finished first.
  for (const done of lines.filter(Boolean)) {
    report.push(done.line);
    taken.push(done.file);
  }
  // Movement cannot be seen in a still: one slow scroll down each long page, as a video.
  const films = FILMS.filter(([pageName]) => wanted(pageName));
  const filmLines = [];
  await inParallel(films, Math.min(WORKERS, 3), async (browser, [pageName, path]) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, recordVideo: { dir: out, size: { width: 390, height: 780 } } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
    const tall = await page.evaluate("document.documentElement.scrollHeight");
    for (let y = 0; y < tall - 780; y += 26) {
      await page.evaluate(`window.scrollTo(0, ${y})`);
      await page.waitForTimeout(110);
    }
    if (path.startsWith("/andar")) {
      await page.waitForFunction("window.__andar?.ready === true", undefined, { timeout: 30000 }).catch(() => report.push(`${pageName}: the person never arrived`));
      // Stills out of the film, to look at the stride without playing it.
      // A jump is over in half a second: its stills are taken close together.
      const quick = pageName.startsWith("salto");
      for (let i = 0; i < (quick ? 30 : pageName.startsWith("viagem") ? 36 : pageName.startsWith("rodar") ? 24 : 12); i++) {
        await page.waitForTimeout(quick ? 130 : i === 0 ? 1200 : 1000);
        await page.screenshot({ path: join(out, `${pageName}_${i}.png`) });
      }
    }
    await page.waitForTimeout(path.startsWith("/cena") ? 9000 : 1500);
    const video = page.video();
    await context.close();
    const file = `${pageName}_motion.webm`;
    await video.saveAs(join(out, file));
    await video.delete();
    filmLines[FILMS.findIndex(([name]) => name === pageName)] = `${file}  390x780  a slow scroll, to see what moves`;
  });
  report.push(...filmLines.filter(Boolean));
  const browser = await launch();
  browsers.push(browser);
  // Every picture on one page (index.html), and that page as pictures (todas_N.png): nothing is
  // judged from three screenshots out of thirty.
  const cell = (file) => `<figure><img src="${file}" loading="lazy"><figcaption>${file.replace(".png", "")}</figcaption></figure>`;
  const sheet = (files, columns) => `<!doctype html><meta charset="utf-8"><title>${label}</title><style>body{margin:16px;background:#1b1d24;color:#eee;font:13px system-ui}.g{display:grid;grid-template-columns:repeat(${columns},1fr);gap:12px;align-items:start}figure{margin:0}img{width:100%;display:block;border-radius:6px;max-height:760px;object-fit:cover;object-position:top}figcaption{padding:4px 0 8px}</style><div class="g">${files.map(cell).join("")}</div>`;
  writeFileSync(join(out, "index.html"), sheet(taken, 4));
  // The world, which is what has to be judged at a glance; the long interface pages are read one by one.
  const world = taken.filter((f) => !f.startsWith("styleguide") && !f.startsWith("frontdoor"));
  const groups = [world.filter((f) => f.endsWith("_phone.png")), world.filter((f) => f.endsWith("_desktop.png"))];
  let n = 0;
  for (const [g, group] of groups.entries()) {
    const per = g === 0 ? 10 : 6;
    for (let i = 0; i < group.length; i += per) {
      n++;
      const name = `todas_${n}.html`;
      writeFileSync(join(out, name), sheet(group.slice(i, i + per), g === 0 ? 5 : 3));
      const page = await browser.newPage({ viewport: { width: 1900, height: 1000 } });
      await page.goto(`file://${join(out, name).replaceAll("\\", "/")}`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: join(out, `todas_${n}.png`), fullPage: true });
      await page.close();
      moving();
      rmSync(join(out, name));
    }
  }
} finally {
  await Promise.all(browsers.map((open) => open.close().catch(() => {})));
  // On Windows the server is a tree of processes; taskkill takes the whole tree.
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill();
}

writeFileSync(join(out, "report.txt"), `${report.join("\n")}\n`);
console.log(report.join("\n"));
console.log(`\nsaved in screenshots/${label}/`);
if (problems > 0) {
  console.error(`${problems} problem(s) found.`);
  process.exit(1);
}
