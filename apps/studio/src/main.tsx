// The Estúdio (Task 3.8): where staff read reports, look a player up, see who
// is in which channel, and do something about it. Never served to players.
//
// Nothing is done here without a reason typed by the person doing it: the API
// refuses otherwise, and writes each reason to a log nobody can change.

import "@nzila/ui/tokens.css";
import "@nzila/ui/ui.css";
import { Banner, Button, EmptyState, Wordmark } from "@nzila/ui";
import { render, type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ask, token, type Entry, type Me, type Player, type Report, type Zone } from "./api.ts";
import "./studio.css";
import { DEEDS, ERRORS, KINDS, REASONS, ROLES, ago, roomName, when } from "./words.ts";

const say = (error: string | null): string => ERRORS[error ?? "failed"] ?? ERRORS.failed!;
const can = (me: Me, ...roles: string[]): boolean => me.roles.includes("platform_admin") || roles.some((role) => me.roles.includes(role));

type Tab = "moderacao" | "jogadores" | "canais" | "registo";

/** How long a mute or a suspension lasts: what a moderator picks from. */
const SPANS = {
  mute: [
    { hours: 1, label: "1 hora" },
    { hours: 24, label: "1 dia" },
    { hours: 168, label: "7 dias" },
  ],
  suspend: [
    { hours: 24, label: "1 dia" },
    { hours: 72, label: "3 dias" },
    { hours: 168, label: "7 dias" },
    { hours: 720, label: "30 dias" },
  ],
} as const;

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="es-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SignIn({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async (event: Event): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const answer = await ask<{ token: string }>("POST", "/v1/staff/login", { email, password });
    setBusy(false);
    if (!answer.data) return setError(say(answer.error));
    token.set(answer.data.token);
    onIn();
  };
  return (
    <main class="es-door n-on-dark">
      <span class="n-pano-faixa n-pano-faixa-vermelha es-door-band" />
      <form class="es-door-card" onSubmit={(event) => void go(event)}>
        <Wordmark width={150} />
        <h1>Estúdio</h1>
        <p class="es-soft">A casa de quem cuida da rua.</p>
        <Field label="Endereço de email">
          <input type="email" autocomplete="username" required value={email} onInput={(event) => setEmail(event.currentTarget.value)} />
        </Field>
        <Field label="Palavra-passe">
          <input type="password" autocomplete="current-password" required value={password} onInput={(event) => setPassword(event.currentTarget.value)} />
        </Field>
        {error ? <p class="es-error" role="alert">{error}</p> : null}
        <button type="submit" class="n-button n-button-solid" disabled={busy}>
          {busy ? "A entrar…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

/** What can be done to a player, with why. `reportId` when it answers a report. */
function Measures({ biNumber, reportId, withKick, onDone }: { biNumber: string; reportId?: number; withKick?: boolean; onDone: (what: string) => void }) {
  const [reason, setReason] = useState("");
  const [mute, setMute] = useState<number>(SPANS.mute[1].hours);
  const [suspend, setSuspend] = useState<number>(SPANS.suspend[0].hours);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const ready = reason.trim().length >= 4;
  const act = async (kind: "mute" | "suspend" | "ban" | "kick" | "none"): Promise<void> => {
    setBusy(true);
    setError(null);
    const hours = kind === "mute" ? mute : kind === "suspend" ? suspend : undefined;
    const span = kind === "mute" ? SPANS.mute.find((one) => one.hours === mute)!.label : kind === "suspend" ? SPANS.suspend.find((one) => one.hours === suspend)!.label : "";
    const done = kind === "none" ? "Sem medida" : `${KINDS[kind]}${span ? ` ${span}` : ""}`;
    if (kind !== "none") {
      const answer = kind === "kick" ? await ask("POST", "/v1/staff/channels/kick", { key: biNumber, reason }) : await ask("POST", "/v1/staff/sanctions", { key: biNumber, kind, reason, ...(hours === undefined ? {} : { hours }), ...(reportId === undefined ? {} : { reportId }) });
      if (!answer.data) {
        setBusy(false);
        return setError(say(answer.error));
      }
    }
    if (reportId !== undefined) {
      const closed = await ask("POST", "/v1/staff/reports/close", { id: reportId, outcome: `${done}: ${reason.trim()}` });
      if (!closed.data) {
        setBusy(false);
        return setError(say(closed.error));
      }
    }
    setBusy(false);
    setReason("");
    setSure(false);
    onDone(done);
  };
  return (
    <div class="es-measures">
      <Field label="Porquê (fica escrito no registo)">
        <textarea rows={2} maxLength={300} value={reason} placeholder="O que viste e o que decidiste" onInput={(event) => setReason(event.currentTarget.value)} />
      </Field>
      <div class="es-measure-row">
        <span class="es-measure">
          <select aria-label="Silenciar durante" value={mute} onChange={(event) => setMute(Number(event.currentTarget.value))}>
            {SPANS.mute.map((one) => (
              <option value={one.hours}>{one.label}</option>
            ))}
          </select>
          <Button kind="quiet" disabled={!ready || busy} onPress={() => void act("mute")}>
            Silenciar
          </Button>
        </span>
        <span class="es-measure">
          <select aria-label="Suspender durante" value={suspend} onChange={(event) => setSuspend(Number(event.currentTarget.value))}>
            {SPANS.suspend.map((one) => (
              <option value={one.hours}>{one.label}</option>
            ))}
          </select>
          <Button kind="quiet" disabled={!ready || busy} onPress={() => void act("suspend")}>
            Suspender
          </Button>
        </span>
        <span class="es-measure es-measure-grave">
          {sure ? (
            <Button disabled={!ready || busy} onPress={() => void act("ban")}>
              Banir de vez
            </Button>
          ) : (
            <Button kind="quiet" disabled={!ready || busy} onPress={() => setSure(true)}>
              Banir…
            </Button>
          )}
        </span>
        {withKick ? (
          <Button kind="quiet" disabled={!ready || busy} onPress={() => void act("kick")}>
            Tirar do canal
          </Button>
        ) : null}
        {reportId !== undefined ? (
          <Button kind="quiet" disabled={!ready || busy} onPress={() => void act("none")}>
            Fechar sem medida
          </Button>
        ) : null}
      </div>
      {error ? <p class="es-error" role="alert">{error}</p> : null}
    </div>
  );
}

function Lines({ lines, none }: { lines: readonly { at: string; text: string; said: boolean }[]; none: string }) {
  if (lines.length === 0) return <p class="es-soft">{none}</p>;
  return (
    <ol class="es-lines">
      {lines.map((line) => (
        <li class={line.said ? "" : "es-line-refused"}>
          <time>{when(line.at)}</time>
          <span>{line.text}</span>
          {line.said ? null : <em>não foi dita</em>}
        </li>
      ))}
    </ol>
  );
}

function Moderacao({ onCount, onOpen }: { onCount: (n: number) => void; onOpen: (bi: string) => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const load = async (): Promise<void> => {
    const answer = await ask<{ reports: Report[] }>("GET", "/v1/staff/reports");
    if (!answer.data) return setError(say(answer.error));
    setError(null);
    setReports(answer.data.reports);
    onCount(answer.data.reports.length);
  };
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, []);
  if (error && !reports) return <Banner state="stopped">{error}</Banner>;
  if (!reports) return <p class="es-soft">A ler a fila…</p>;
  return (
    <section class="es-queue">
      {done ? <Banner state="done">{done}</Banner> : null}
      {reports.length === 0 ? (
        <EmptyState glyph="sol" title="Fila vazia">
          Ninguém se queixou de ninguém. A rua está em paz.
        </EmptyState>
      ) : null}
      {reports.map((report) => (
        <article class="es-report" key={report.id}>
          <header>
            <span class="es-tag">{REASONS[report.reason] ?? report.reason}</span>
            <span class="es-soft">
              n.º {report.id} · {ago(report.at)}
            </span>
          </header>
          <p class="es-who">
            <button type="button" class="es-link" onClick={() => report.reported.biNumber && onOpen(report.reported.biNumber)}>
              {report.reported.name ?? "Sem nome"}
            </button>
            <span class="es-bi">{report.reported.biNumber}</span>
            {report.against > 1 ? <span class="es-tag es-tag-hot">{report.against} denúncias abertas</span> : null}
          </p>
          <p class="es-soft">
            Denunciado por {report.reporter.name ?? "Sem nome"} <span class="es-bi">{report.reporter.biNumber}</span>
          </p>
          {report.note ? <blockquote>{report.note}</blockquote> : null}
          <h3>O que disse antes</h3>
          <Lines lines={report.lines} none="Não disse nada no quarto de hora antes da denúncia." />
          {report.reported.biNumber ? (
            <Measures
              biNumber={report.reported.biNumber}
              reportId={report.id}
              onDone={(what) => {
                setDone(`Denúncia n.º ${report.id} fechada. ${what}.`);
                void load();
              }}
            />
          ) : null}
        </article>
      ))}
    </section>
  );
}

function Jogadores({ me, first }: { me: Me; first: string }) {
  const [key, setKey] = useState(first);
  const [reason, setReason] = useState("");
  const [player, setPlayer] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lifting, setLifting] = useState<number | null>(null);
  const [why, setWhy] = useState("");
  useEffect(() => setKey(first), [first]);
  const find = async (event?: Event): Promise<void> => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    const answer = await ask<{ player: Player }>("POST", "/v1/staff/players/find", { key, reason });
    setBusy(false);
    if (!answer.data) {
      setPlayer(null);
      return setError(say(answer.error));
    }
    setPlayer(answer.data.player);
  };
  const lift = async (id: number): Promise<void> => {
    const answer = await ask("POST", "/v1/staff/sanctions/lift", { id, reason: why });
    if (!answer.data) return setError(say(answer.error));
    setLifting(null);
    setWhy("");
    setDone("Medida levantada.");
    void find();
  };
  return (
    <section class="es-players">
      <form class="es-search" onSubmit={(event) => void find(event)}>
        <Field label="Número do BI ou nome">
          <input required minLength={2} value={key} onInput={(event) => setKey(event.currentTarget.value)} />
        </Field>
        <Field label="Porquê precisas de ver (fica escrito)">
          <input required minLength={4} maxLength={300} value={reason} placeholder="Denúncia n.º 12, pedido de apoio…" onInput={(event) => setReason(event.currentTarget.value)} />
        </Field>
        <button type="submit" class="n-button n-button-solid" disabled={busy}>
          {busy ? "A procurar…" : "Procurar"}
        </button>
      </form>
      {error ? <Banner state="stopped">{error}</Banner> : null}
      {done ? <Banner state="done">{done}</Banner> : null}
      {!player && !error ? (
        <EmptyState glyph="bi" title="Quem procuras?">
          Um jogador é conhecido pelo número do seu BI. Diz porquê e ele aparece.
        </EmptyState>
      ) : null}
      {player ? (
        <article class="es-player">
          <header>
            <h2>{player.name ?? "Sem nome"}</h2>
            <span class="es-bi">{player.biNumber}</span>
            {player.sanctions.filter((one) => one.standing).map((one) => (
              <span class="es-tag es-tag-hot">{KINDS[one.kind]}</span>
            ))}
          </header>
          <dl class="es-facts">
            <div>
              <dt>Onde está agora</dt>
              <dd>{player.now ? `${roomName(player.now.room)}, canal ${player.now.channel}` : "Fora do jogo"}</dd>
            </div>
            <div>
              <dt>Chegou</dt>
              <dd>{when(player.arrivedAt)}</dd>
            </div>
            <div>
              <dt>Bairro</dt>
              <dd>{player.bairro ?? "Ainda sem cartão"}</dd>
            </div>
            <div>
              <dt>BI</dt>
              <dd>{player.kind === "linked" ? "Guardado" : "Convidado"}</dd>
            </div>
            <div>
              <dt>Idade</dt>
              <dd>{player.ageBand === "15_17" ? "15 a 17" : "18 ou mais"}</dd>
            </div>
            <div>
              <dt>Denúncias</dt>
              <dd>
                {player.reportsAgainst} contra, {player.reportsMade} feitas
              </dd>
            </div>
          </dl>
          <h3>Medidas</h3>
          {player.sanctions.length === 0 ? <p class="es-soft">Nunca teve nenhuma.</p> : null}
          <ul class="es-sanctions">
            {player.sanctions.map((one) => (
              <li class={one.standing ? "es-standing" : ""}>
                <strong>{KINDS[one.kind] ?? one.kind}</strong>
                <span>
                  {when(one.at)}
                  {one.until ? ` até ${when(one.until)}` : ""} · por {one.by}
                  {one.lifted ? " · levantada" : ""}
                </span>
                <span class="es-soft">{one.reason}</span>
                {one.standing && can(me, "moderador") ? (
                  lifting === one.id ? (
                    <span class="es-lift">
                      <input aria-label="Porquê levantar" value={why} placeholder="Porquê" onInput={(event) => setWhy(event.currentTarget.value)} />
                      <Button kind="quiet" disabled={why.trim().length < 4} onPress={() => void lift(one.id)}>
                        Levantar
                      </Button>
                    </span>
                  ) : (
                    <Button kind="quiet" onPress={() => setLifting(one.id)}>
                      Levantar…
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
          <h3>O que disse por último</h3>
          <Lines lines={player.lines} none="Não disse nada nos últimos trinta dias." />
          {player.biNumber && can(me, "moderador") ? (
            <>
              <h3>Fazer alguma coisa</h3>
              <Measures
                biNumber={player.biNumber}
                withKick={player.now !== null}
                onDone={(what) => {
                  setDone(`${what}.`);
                  void find();
                }}
              />
            </>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

/** How a channel's steps are going, against the fifty milliseconds a step may take. */
const pace = (worst: number | null): "good" | "warm" | "hot" => (worst === null || worst < 15 ? "good" : worst < 40 ? "warm" : "hot");

function Canais({ onOpen }: { onOpen: (bi: string) => void }) {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = async (): Promise<void> => {
      const answer = await ask<{ zones: Zone[] }>("GET", "/v1/staff/channels");
      if (!answer.data) return setError(say(answer.error));
      setError(null);
      setZones(answer.data.zones);
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, []);
  if (error && !zones) return <Banner state="stopped">{error}</Banner>;
  if (!zones) return <p class="es-soft">A perguntar às zonas…</p>;
  const channels = zones.flatMap((zone) => zone.rooms.flatMap((room) => room.channels.map((channel) => ({ zone: zone.id, room: room.name, ...channel }))));
  const people = channels.reduce((sum, channel) => sum + channel.players, 0);
  return (
    <section class="es-channels">
      <p class="es-sum">
        <strong>{people}</strong> {people === 1 ? "pessoa na rua" : "pessoas na rua"} · <strong>{channels.length}</strong> {channels.length === 1 ? "canal aberto" : "canais abertos"} · <strong>{zones.length}</strong> {zones.length === 1 ? "zona viva" : "zonas vivas"}
      </p>
      {zones.length === 0 ? (
        <EmptyState glyph="paragem" title="Nenhuma zona responde">
          Sem zona, cada jogador anda sozinho na sua rua. Liga uma e ela aparece aqui em três segundos.
        </EmptyState>
      ) : channels.length === 0 ? (
        <EmptyState glyph="palmeira" title="A rua está vazia">
          As zonas estão vivas e ninguém entrou ainda. Um canal abre quando chega o primeiro.
        </EmptyState>
      ) : null}
      <div class="es-channel-grid">
        {channels.map((channel) => (
          <article class={`es-channel es-pace-${pace(channel.worstMs)}`} key={`${channel.zone}/${channel.room}/${channel.number}`}>
            <header>
              <h2>Canal {channel.number}</h2>
              <span class="es-soft">{roomName(channel.room)}</span>
            </header>
            <div class="es-fill" role="img" aria-label={`${channel.players} de 80`}>
              <i style={{ width: `${Math.min(100, (channel.players / 80) * 100)}%` }} />
              <b>{channel.players} / 80</b>
            </div>
            <p class="es-pace">
              <span class="es-dot" />
              {channel.meanMs === null ? "Sem medida ainda" : `Passo ${channel.meanMs.toFixed(1)} ms · pior ${channel.worstMs?.toFixed(1)} ms`}
            </p>
            <ul class="es-names">
              {channel.who.map((one) => (
                <li>
                  <button type="button" class="es-link" onClick={() => one.biNumber && onOpen(one.biNumber)}>
                    {one.name ?? "Sem nome"}
                  </button>
                  <span class="es-bi">{one.biNumber}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function Registo() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void ask<{ entries: Entry[] }>("GET", "/v1/staff/audit").then((answer) => (answer.data ? setEntries(answer.data.entries) : setError(say(answer.error))));
  }, []);
  if (error) return <Banner state="stopped">{error}</Banner>;
  if (!entries) return <p class="es-soft">A ler o registo…</p>;
  return (
    <section class="es-log">
      <p class="es-soft">O que a equipa fez, do mais recente para o mais antigo. Este registo não se apaga nem se muda.</p>
      <table>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Quem</th>
            <th>O quê</th>
            <th>A quem</th>
            <th>Porquê</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr>
              <td>{when(entry.at)}</td>
              <td>{entry.by}</td>
              <td>{DEEDS[entry.kind] ?? entry.kind}</td>
              <td class="es-bi">{entry.kind === "staff.signin" ? "" : entry.subject.replace(/^report /, "Denúncia n.º ")}</td>
              <td>{entry.kind === "staff.signin" ? "" : entry.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Studio({ me, onOut }: { me: Me; onOut: () => void }) {
  const tabs: { id: Tab; label: string; on: boolean }[] = [
    { id: "moderacao", label: "Moderação", on: can(me, "moderador") },
    { id: "jogadores", label: "Jogadores", on: can(me, "support", "moderador") },
    { id: "canais", label: "Canais", on: can(me, "live_ops", "moderador", "support") },
    { id: "registo", label: "Registo", on: true },
  ];
  const [tab, setTab] = useState<Tab>(tabs.find((one) => one.on)!.id);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [asked, setAsked] = useState("");
  const open = (bi: string): void => {
    setAsked(bi);
    setTab("jogadores");
  };
  return (
    <div class="es-shell n-on-dark">
      <span class="n-pano-faixa n-pano-faixa-vermelha" />
      <header class="es-top">
        <Wordmark width={96} />
        <strong class="es-title">Estúdio</strong>
        <span class="es-me">
          {me.name}
          <small>{me.roles.map((role) => ROLES[role] ?? role).join(", ")}</small>
        </span>
        <Button kind="quiet" onPress={onOut}>
          Sair
        </Button>
      </header>
      <nav class="es-tabs" aria-label="Secções">
        {tabs
          .filter((one) => one.on)
          .map((one) => (
            <button type="button" class={tab === one.id ? "es-tab es-tab-on" : "es-tab"} aria-current={tab === one.id ? "page" : undefined} onClick={() => setTab(one.id)}>
              {one.label}
              {one.id === "moderacao" && waiting ? <b>{waiting}</b> : null}
            </button>
          ))}
      </nav>
      <main class="es-main">
        {tab === "moderacao" ? <Moderacao onCount={setWaiting} onOpen={open} /> : null}
        {tab === "jogadores" ? <Jogadores me={me} first={asked} /> : null}
        {tab === "canais" ? <Canais onOpen={open} /> : null}
        {tab === "registo" ? <Registo /> : null}
      </main>
    </div>
  );
}

function App() {
  const [me, setMe] = useState<Me | null | "asking">(token.get() ? "asking" : null);
  const who = async (): Promise<void> => {
    const answer = await ask<Me>("GET", "/v1/staff/me");
    if (!answer.data) token.set(null);
    setMe(answer.data);
  };
  useEffect(() => {
    if (me === "asking") void who();
  }, []);
  if (me === "asking") return <p class="es-soft es-wait">A abrir o Estúdio…</p>;
  if (!me) return <SignIn onIn={() => void who()} />;
  return (
    <Studio
      me={me}
      onOut={() => {
        void ask("POST", "/v1/staff/logout", {});
        token.set(null);
        setMe(null);
      }}
    />
  );
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app missing");
render(<App />, root);
