// What the tables show on the phone (Task 4B.1), whichever applies: the board, for a player seated; an invitation
// to play, waiting for its answer; the answer to the player's own; and, once seats are kept, the way to the table.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Button } from "@nzila/ui";
import { useEffect, useState } from "preact/hooks";
import type { Mesas } from "./mesas.ts";
import { Tabuleiro } from "./tabuleiro.tsx";

export function Ui({ mesas, mesa, gesto }: { mesas: Mesas; mesa: number | null; gesto?: (kind: "aplaudir" | "rir") => void }) {
  const [, redraw] = useState(0);
  useEffect(() => mesas.listen(() => redraw((n) => n + 1)), [mesas]);
  // The way to a kept seat counts down its metres as the player walks.
  useEffect(() => {
    const ticking = setInterval(() => redraw((n) => n + 1), 700);
    return () => clearInterval(ticking);
  }, []);
  if (mesa !== null) return <Tabuleiro mesas={mesas} mesa={mesa} />;
  if (mesas.vendo !== null) return <Tabuleiro mesas={mesas} mesa={mesas.vendo} vendo gesto={gesto} />;
  const now = performance.now();
  const jogo = (index: number): string => tr.t(`mesa.jogoNome.${mesas.tables[index]!.game}` as "mesa.jogoNome.xadrez");
  const convite = mesas.convite;
  if (convite && convite.ate > now) {
    const table = mesas.tables[convite.mesa]!;
    const metros = Math.round(Math.hypot(table.pos[0] - mesas.x, table.pos[2] - mesas.z));
    return (
      <div class="ms-convite" role="dialog" aria-label={tr.t("convite.pergunta", { nome: convite.nome, jogo: jogo(convite.mesa) })}>
        <div class="ms-band" aria-hidden="true" />
        <p class="ms-convite-quem">{tr.t("convite.pergunta", { nome: convite.nome, jogo: jogo(convite.mesa) })}</p>
        <p class="ms-convite-onde">{tr.t("convite.onde", { metros })}</p>
        <div class="ms-foot">
          <Button kind="quiet" onPress={() => mesas.responder(false)}>{tr.t("convite.nao")}</Button>
          <Button onPress={() => mesas.responder(true)}>{tr.t("convite.sim")}</Button>
        </div>
      </div>
    );
  }
  const aviso = mesas.aviso && mesas.aviso.ate > now ? mesas.aviso : null;
  const destino = mesas.destino;
  const perto = mesas.perto;
  return (
    <>
      {aviso || destino ? (
        <p class={`ms-aviso${aviso?.kind === "recusou" ? " ms-aviso-nao" : ""}`} role="status">
          {aviso ? tr.t(`convite.${aviso.kind}`, { nome: aviso.nome }) : tr.t("convite.caminho", { jogo: jogo(destino!.mesa), metros: Math.round(mesas.longeDoDestino()) })}
        </p>
      ) : null}
      {perto !== null ? (
        // Standing round a table: its board, to watch without sitting (F-210).
        <button type="button" class="ms-ver" data-jogo={mesas.tables[perto]!.game} aria-label={tr.t("mesa.verNome", { jogo: jogo(perto) })} onClick={() => mesas.ver(perto)}>
          <i class={`ms-ver-mark ms-ver-${mesas.tables[perto]!.game}`} aria-hidden="true" />
          <span>{tr.t("mesa.ver")}</span>
          {mesas.aVer(perto) > 0 ? <b>{mesas.aVer(perto)}</b> : null}
        </button>
      ) : null}
    </>
  );
}
