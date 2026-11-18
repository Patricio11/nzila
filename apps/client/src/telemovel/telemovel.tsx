// The Telemóvel's shell (UX_UI_SPEC.md §4): the grid of apps over the world. Each
// app is its own small download, fetched the first time it is opened: a player
// who never opens the Banco never pays for it (the megabytes rule, F-188). The
// apps not built yet say so honestly. Everything they show is asked of the
// WorldProvider.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { APP_GLYPHS, EmptyState, PhoneSheet, Skeleton, type PhoneApp } from "@nzila/ui";
import { type ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { type WorldProvider } from "../world/provider.ts";
import "./telemovel.css";

type AppId = (typeof APP_GLYPHS)[number];

const APPS: readonly PhoneApp<AppId>[] = APP_GLYPHS.map((id) => ({ id, glyph: id, label: tr.t(`app.${id}`) }));

/** A place the player chose on the map for the compass to point to. */
export interface Marked {
  readonly x: number;
  readonly z: number;
  readonly name: string;
}

interface AppProps {
  world: WorldProvider;
  marked: Marked | null;
  onMark: (place: Marked | null) => void;
}

/** The apps that exist, and where each is fetched from when it is first opened. */
interface Fetch {
  (): Promise<ComponentType<AppProps>>;
}
const BUILT: Partial<Record<AppId, Fetch>> = {
  mapa: async () => (await import("./mapa.tsx")).Mapa as ComponentType<AppProps>,
  definicoes: async () => (await import("./definicoes.tsx")).Definicoes as ComponentType<AppProps>,
  bi: async () => (await import("./bi.tsx")).Bi as ComponentType<AppProps>,
  banco: async () => (await import("./banco.tsx")).Banco as ComponentType<AppProps>,
  mensagens: async () => (await import("./mensagens.tsx")).Mensagens as ComponentType<AppProps>,
};
const fetched = new Map<AppId, ComponentType<AppProps>>();

/** One app, fetched if it never was: the shape of what is coming while it comes, and a plain word if it cannot. */
function App({ id, ...props }: AppProps & { id: AppId }) {
  const [, redraw] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (fetched.has(id)) return;
    let gone = false;
    BUILT[id]!().then(
      (app) => {
        fetched.set(id, app);
        if (!gone) redraw((n) => n + 1);
      },
      () => !gone && setFailed(true),
    );
    return () => void (gone = true);
  }, [id]);
  const Ready = fetched.get(id);
  if (Ready) return <Ready {...props} />;
  return failed ? <EmptyState glyph={id} title={tr.t("state.offline.app")} /> : <Skeleton lines={4} />;
}

/** The Telemóvel over the world. `onMark` gives the compass a place to point to, or takes it away. */
export function Telemovel({ world, open, first, marked, onMark, onClose }: { world: WorldProvider; open: boolean; first?: string | null; marked: Marked | null; onMark: (place: Marked | null) => void; onClose: () => void }) {
  const [app, setApp] = useState<AppId | null>(APP_GLYPHS.find((id) => id === first) ?? null);
  useEffect(() => {
    // Shut, it forgets where it was; opened by something that asks for an app (the caixa asks for the Banco), it opens there.
    if (!open) setApp(null);
    else if (first) setApp(APP_GLYPHS.find((id) => id === first) ?? null);
  }, [open, first]);
  return (
    <PhoneSheet open={open} apps={APPS} app={app} onOpen={setApp} onBack={() => setApp(null)} onClose={onClose}>
      {app && BUILT[app] ? (
        <App id={app} world={world} marked={marked} onMark={onMark} />
      ) : app ? (
        <EmptyState glyph={app} title={tr.t("state.soon")}>
          {tr.t(`app.${app}.soon`)}
        </EmptyState>
      ) : null}
    </PhoneSheet>
  );
}
