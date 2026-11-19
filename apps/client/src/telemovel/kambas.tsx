// The kambas, in Mensagens (Task 4B.2, UX_UI_SPEC.md §4.2 and §5 "Kambas"): who asked to be one, the list with who is
// in the street now and where, and each conversation, with Silenciar, Bloquear and Denunciar in its header (Rule 11).
// A kamba in the street can be gone to ("Ir ter com"): in the same copy of the bairro the compass points at them;
// in another copy the phone goes to theirs. A kamba elsewhere can be asked to come and play at a table here.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Button, Glyph } from "@nzila/ui";
import { useEffect, useRef, useState } from "preact/hooks";
import { blockPlayer, reportPlayer, type ReportReason } from "../world/money.ts";
import { type WorldProvider } from "../world/provider.ts";
import { calar, conversa, escrever, lista, responder, verNovidades, type Jogo, type Kamba, type Lista, type Mensagem } from "./rede-kambas.ts";
import { type Marked } from "./telemovel.tsx";
import "./kambas.css";

const REASONS: readonly ReportReason[] = ["insults", "harassment", "sexual", "scam", "cheating", "name", "other"];
/** A conversation open on the screen is asked again this often for what the kamba wrote. */
const CONVERSA_MS = 5000;

/** A colour of their own for each kamba, from their BI number: the same on every phone. */
const toneOf = (bi: string): number => [...bi].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;

/** A face: the first letter of the name, on their colour; a green ring while they are in the street. */
export function Cara({ nome, bi, naRua = false, size = 44 }: { nome: string; bi: string; naRua?: boolean; size?: number }) {
  return (
    <span class={`kb-cara kb-tom-${toneOf(bi)}${naRua ? " kb-cara-rua" : ""}`} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      {nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Where a kamba is, in words: in this street near a place, in another copy of it, in another bairro, or not in the game. */
function ondeEsta(world: WorldProvider, kamba: Kamba): string {
  const onde = kamba.onde;
  if (!onde) return tr.t("kamba.fora");
  const manifest = world.district();
  if (!manifest || onde.districtId !== manifest.id) return tr.t("kamba.noutroBairro");
  const bairro = world.word(manifest.nameKey);
  if (onde.x === undefined || onde.z === undefined) return tr.t("kamba.naRua", { bairro });
  // The place nearest them, by the map's own names.
  let perto: string | null = null;
  let best = Infinity;
  for (const poi of manifest.pois) {
    const far = Math.hypot(poi.pos[0] - onde.x / 1000, poi.pos[2] - onde.z / 1000);
    if (far < best) [best, perto] = [far, world.word(poi.nameKey)];
  }
  return perto && best < 60 ? tr.t("kamba.perto", { bairro, sitio: perto }) : tr.t("kamba.naRua", { bairro });
}

/** "Ir ter com": what going to a kamba does from here. */
export function irTerCom(world: WorldProvider, kamba: Kamba, onMark: (place: Marked | null) => void): "marcado" | "a-ir" | "longe" | "fora" {
  const onde = kamba.onde;
  if (!onde) return "fora";
  const manifest = world.district();
  if (!manifest || onde.districtId !== manifest.id) return "longe";
  if (onde.canal !== world.channel()) {
    // Another copy of this bairro: the phone goes to theirs, and points at them when it gets there.
    const address = new URL(location.href);
    address.searchParams.set("canal", String(onde.canal));
    address.searchParams.set("kamba", kamba.bi);
    address.searchParams.delete("telemovel");
    location.assign(address.toString());
    return "a-ir";
  }
  if (onde.x === undefined || onde.z === undefined) return "fora";
  onMark({ x: onde.x / 1000, z: onde.z / 1000, name: kamba.nome });
  return "marcado";
}

/** The kambas tab: asks waiting, then the list; a kamba tapped opens the conversation. */
export function Kambas({ world, onMark, abrir }: { world: WorldProvider; onMark: (place: Marked | null) => void; abrir?: string | null }) {
  const [dados, setDados] = useState<Lista | null>(null);
  const [offline, setOffline] = useState(false);
  const [aberto, setAberto] = useState<string | null>(abrir ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const reload = async (): Promise<void> => {
    const now = await lista();
    if (now) {
      setDados(now);
      setOffline(false);
    } else setOffline(true);
    void verNovidades();
  };
  useEffect(() => void reload(), []);
  const answer = async (bi: string, nome: string, sim: boolean): Promise<void> => {
    setBusy(bi);
    const done = await responder(bi, sim);
    setBusy(null);
    setSaid(done === "kambas" ? tr.t("kamba.aceite", { nome }) : done === "offline" ? tr.t("recado.said.offline") : null);
    await reload();
  };

  const kamba = aberto ? dados?.kambas.find((one) => one.bi === aberto) : undefined;
  if (aberto && kamba) return <Conversa world={world} kamba={kamba} onMark={onMark} onBack={() => (setAberto(null), void reload())} onGone={() => (setAberto(null), void reload())} />;
  if (!dados) return <p class="tm-note">{offline ? tr.t("recado.said.offline") : tr.t("recado.lendo")}</p>;
  return (
    <div class="kb">
      {said ? (
        <p class="kb-said" role="status">
          {said}
        </p>
      ) : null}
      {dados.pedidos.length > 0 ? (
        <section class="kb-pedidos" aria-label={tr.t("kamba.pedidos")}>
          <h3>{tr.t("kamba.pedidos")}</h3>
          {dados.pedidos.map((one) => (
            <article key={one.bi} class="kb-pedido" data-bi={one.bi}>
              <Cara nome={one.nome} bi={one.bi} />
              <div class="kb-pedido-txt">
                <b>{one.nome}</b>
                <small>{tr.t("kamba.querSer")}</small>
              </div>
              <div class="kb-pedido-keys">
                <Button kind="quiet" busy={busy === one.bi} onPress={() => void answer(one.bi, one.nome, false)}>
                  {tr.t("kamba.agoraNao")}
                </Button>
                <Button busy={busy === one.bi} onPress={() => void answer(one.bi, one.nome, true)}>
                  {tr.t("kamba.aceitar")}
                </Button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {dados.kambas.length === 0 ? (
        <div class="kb-vazio">
          <span class="kb-vazio-caras" aria-hidden="true">
            <i class="kb-tom-0" />
            <i class="kb-tom-4" />
            <i class="kb-tom-2" />
          </span>
          <b>{tr.t("kamba.vazio")}</b>
          <p>{tr.t("kamba.vazioComo")}</p>
        </div>
      ) : (
        <ul class="kb-lista">
          {dados.kambas.map((one) => (
            <li key={one.bi}>
              <button type="button" class="kb-linha" data-bi={one.bi} onClick={() => setAberto(one.bi)}>
                <Cara nome={one.nome} bi={one.bi} naRua={one.onde !== null} />
                <span class="kb-linha-txt">
                  <b>{one.nome}</b>
                  <small class={one.onde ? "kb-onde kb-onde-rua" : "kb-onde"}>{ondeEsta(world, one)}</small>
                  {one.ultima ? <small class="kb-ultima">{one.ultima.minha ? tr.t("kamba.tu", { texto: resumo(one.ultima) }) : resumo(one.ultima)}</small> : null}
                </span>
                {one.porLer > 0 && !one.calado ? <b class="kb-porler">{one.porLer}</b> : null}
                {one.calado ? <small class="kb-calado">{tr.t("kamba.calado")}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A line of the list: what was written, or what game they were asked to. */
function resumo(one: { kind: "texto" | "convite"; texto: string; jogo: string | null }): string {
  return one.kind === "convite" ? tr.t("kamba.conviteCurto", { jogo: tr.t(`mesa.jogoNome.${one.jogo ?? "ludo"}` as "mesa.jogoNome.xadrez") }) : one.texto;
}

/** A conversation with a kamba. */
function Conversa({ world, kamba, onMark, onBack, onGone }: { world: WorldProvider; kamba: Kamba; onMark: (place: Marked | null) => void; onBack: () => void; onGone: () => void }) {
  const [linhas, setLinhas] = useState<Mensagem[] | null>(null);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [calado, setCalado] = useState(kamba.calado);
  const [modo, setModo] = useState<"escrever" | "convidar" | "denunciar">("escrever");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const fundo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    const read = async (): Promise<void> => {
      const now = await conversa(kamba.bi);
      if (alive && now) setLinhas(now);
    };
    void read();
    const every = setInterval(() => void read(), CONVERSA_MS);
    return () => {
      alive = false;
      clearInterval(every);
    };
  }, [kamba.bi]);
  useEffect(() => fundo.current?.scrollIntoView({ block: "end" }), [linhas?.length]);
  const jogos = [...new Set(world.district()?.tables?.map((one) => one.game) ?? [])] as Jogo[];

  const send = async (escrito: { texto: string } | { convite: { jogo: Jogo; districtId: string } }): Promise<void> => {
    setBusy(true);
    setSaid(null);
    const done = await escrever(kamba.bi, escrito);
    setBusy(false);
    if (done.said === "ok") {
      setLinhas((now) => [...(now ?? []), done.mensagem]);
      if ("texto" in escrito) setTexto("");
      setModo("escrever");
    } else setSaid(tr.t(`kamba.escreveu.${done.said}`));
  };
  const ir = (): void => {
    const went = irTerCom(world, kamba, onMark);
    setSaid(tr.t(`kamba.ir.${went}`, { nome: kamba.nome }));
  };
  const block = async (): Promise<void> => {
    setBusy(true);
    const done = await blockPlayer(kamba.bi, true);
    setBusy(false);
    if (done) onGone();
    else setSaid(tr.t("report.offline"));
  };
  const report = async (): Promise<void> => {
    if (!reason) return;
    setBusy(true);
    const done = await reportPlayer(kamba.bi, reason, "");
    setBusy(false);
    setSaid(tr.t(done ? "report.sent" : "report.offline"));
    if (done) setModo("escrever");
  };

  return (
    <div class="kb-conversa">
      <header class="kb-topo">
        <button type="button" class="kb-voltar" aria-label={tr.t("phone.back")} onClick={onBack}>
          <Glyph name="voltar" size={20} />
        </button>
        <Cara nome={kamba.nome} bi={kamba.bi} naRua={kamba.onde !== null} size={38} />
        <span class="kb-topo-txt">
          <b>{kamba.nome}</b>
          <small class={kamba.onde ? "kb-onde kb-onde-rua" : "kb-onde"}>{ondeEsta(world, kamba)}</small>
        </span>
      </header>
      {/* Rule 11: a way to talk never comes without these. */}
      <nav class="kb-seguranca">
        {kamba.onde ? (
          <button type="button" class="kb-chip kb-chip-ir" onClick={ir}>
            {tr.t("kamba.irTerCom")}
          </button>
        ) : null}
        {jogos.length > 0 ? (
          <button type="button" class="kb-chip" aria-pressed={modo === "convidar"} onClick={() => setModo(modo === "convidar" ? "escrever" : "convidar")}>
            {tr.t("convite.abrir")}
          </button>
        ) : null}
        <button type="button" class="kb-chip" aria-pressed={calado} onClick={() => void calar(kamba.bi, !calado).then((ok) => ok && setCalado(!calado))}>
          {tr.t(calado ? "player.unmute" : "player.mute")}
        </button>
        <button type="button" class="kb-chip" disabled={busy} onClick={() => void block()}>
          {tr.t("player.block")}
        </button>
        <button type="button" class="kb-chip" aria-pressed={modo === "denunciar"} onClick={() => setModo(modo === "denunciar" ? "escrever" : "denunciar")}>
          {tr.t("player.report")}
        </button>
      </nav>
      {said ? (
        <p class="kb-said" role="status">
          {said}
        </p>
      ) : null}
      <div class="kb-linhas" aria-live="polite">
        {linhas === null ? (
          <p class="tm-note">{tr.t("recado.lendo")}</p>
        ) : linhas.length === 0 ? (
          <p class="kb-primeira">{tr.t("kamba.primeira", { nome: kamba.nome })}</p>
        ) : (
          linhas.map((one) =>
            one.kind === "convite" ? (
              <div key={one.id} class={`kb-convite${one.minha ? " kb-minha" : ""}`} data-jogo={one.jogo}>
                <i class={`cv-game-mark cv-game-${one.jogo}`} aria-hidden="true" />
                <span>
                  <b>{tr.t(one.minha ? "kamba.convidaste" : "kamba.convidou", { jogo: tr.t(`mesa.jogoNome.${one.jogo ?? "ludo"}` as "mesa.jogoNome.xadrez"), nome: kamba.nome })}</b>
                  <small>{one.districtId === world.district()?.id ? world.word(world.district()!.nameKey) : tr.t("kamba.noutroBairro")}</small>
                </span>
                {!one.minha && kamba.onde ? (
                  <Button onPress={ir}>{tr.t("kamba.irTerCom")}</Button>
                ) : null}
              </div>
            ) : (
              <p key={one.id} class={`kb-bolha${one.minha ? " kb-minha" : ""}`}>
                {one.texto}
                <time>{new Date(one.at).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}</time>
              </p>
            ),
          )
        )}
        <div ref={fundo} />
      </div>
      {modo === "convidar" ? (

        <div class="kb-jogos">
          {jogos.map((jogo) => (
            <button key={jogo} type="button" class="cv-game" data-jogo={jogo} disabled={busy} onClick={() => void send({ convite: { jogo, districtId: world.district()!.id } })}>
              <i class={`cv-game-mark cv-game-${jogo}`} aria-hidden="true" />
              <span>{tr.t(`mesa.jogo.${jogo}` as "mesa.jogo.xadrez")}</span>
            </button>
          ))}
        </div>
      ) : modo === "denunciar" ? (
        <div class="kb-denuncia">
          <div class="cv-reasons" role="radiogroup" aria-label={tr.t("report.title")}>
            {REASONS.map((one) => (
              <button key={one} type="button" role="radio" aria-checked={reason === one} class={`cv-chip${reason === one ? " cv-chip-on" : ""}`} onClick={() => setReason(one)}>
                {tr.t(`report.reason.${one}`)}
              </button>
            ))}
          </div>
          <Button disabled={!reason} busy={busy} onPress={() => void report()}>
            {tr.t("report.send")}
          </Button>
        </div>
      ) : (
        <form class="kb-escrever" onSubmit={(event) => (event.preventDefault(), texto.trim() && void send({ texto }))}>
          <input
            type="text"
            value={texto}
            maxLength={280}
            autocomplete="off"
            placeholder={tr.t("kamba.escreve", { nome: kamba.nome })}
            aria-label={tr.t("kamba.escreve", { nome: kamba.nome })}
            onInput={(event) => setTexto(event.currentTarget.value)}
            onKeyDown={(event) => event.stopPropagation()}
            onKeyUp={(event) => event.stopPropagation()}
          />
          <button type="submit" class="kb-enviar" disabled={busy || !texto.trim()} aria-label={tr.t("kamba.enviar")}>
            <Glyph name="mensagens" size={20} />
          </button>
        </form>
      )}
    </div>
  );
}
