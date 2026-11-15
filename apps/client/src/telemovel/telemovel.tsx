// The Telemóvel's apps (UX_UI_SPEC.md §4). Two of them work in Phase 1: the
// Mapa (the district, its paragens, its points of interest, the lines, the
// vans, you) and Definições (the picture's quality, Modo Poupança, data used,
// sound, the hand). The other seven are on the grid and say honestly that
// they are not here yet. Everything they show is asked of the WorldProvider.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { APP_GLYPHS, Button, Choice, DataMeter, EmptyState, PhoneSheet, Toggle, type PhoneApp } from "@nzila/ui";
import { WORLD } from "@nzila/world/client";
import { useEffect, useRef, useState } from "preact/hooks";
import { type DistrictMap, type MapLine, type WorldProvider } from "../world/provider.ts";
import { Bi } from "./bi.tsx";
import "./telemovel.css";

type AppId = (typeof APP_GLYPHS)[number];

const APPS: readonly PhoneApp<AppId>[] = APP_GLYPHS.map((id) => ({ id, glyph: id, label: tr.t(`app.${id}`) }));

/** A place the player chose on the map for the compass to point to. */
export interface Marked {
  readonly x: number;
  readonly z: number;
  readonly name: string;
}

interface Place {
  readonly x: number;
  readonly z: number;
  readonly name: string;
  readonly line: string | null;
  readonly kind: "paragem" | "ponto";
}

const css = (colour: readonly [number, number, number]): string => `#${colour.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
/** What the map is painted with: the world's own colours. */
const PAINT: Readonly<Record<string, string>> = { "~": css(WORLD.seaShallow), "=": css(WORLD.tar), ".": css(WORLD.pavement), "^": css(WORLD.pavementShade), "#": css(WORLD.pavementShade) };

function Mapa({ world, marked, onMark }: { world: WorldProvider; marked: Marked | null; onMark: (place: Marked | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState<{ map: DistrictMap | null; lines: MapLine[] } | null>(null);
  const [chosen, setChosen] = useState<Place | null>(null);
  const manifest = world.district();
  const places: Place[] = manifest
    ? [
        ...manifest.paragens.map((p) => ({ x: p.pos[0], z: p.pos[2], name: world.word(p.nameKey), line: null, kind: "paragem" as const })),
        ...manifest.pois.map((p) => ({ x: p.pos[0], z: p.pos[2], name: world.word(p.nameKey), line: world.word(p.lineKey), kind: "ponto" as const })),
      ]
    : [];

  useEffect(() => {
    let gone = false;
    void world.map().then((answer) => !gone && setDrawn(answer));
    return () => void (gone = true);
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !manifest || !drawn) return;
    const { minX, minZ, maxX, maxZ } = manifest.bounds;
    const wide = maxX - minX;
    const deep = maxZ - minZ;
    // The ground is painted once; what moves is painted over a copy of it, twice a second.
    const ground = document.createElement("canvas");
    const scale = 2;
    ground.width = Math.round(wide * scale);
    ground.height = Math.round(deep * scale);
    const base = ground.getContext("2d");
    if (!base) return;
    base.fillStyle = PAINT["#"]!;
    base.fillRect(0, 0, ground.width, ground.height);
    if (drawn.map) {
      const cell = drawn.map.cellM * scale;
      for (const [row, text] of drawn.map.rows.entries()) {
        for (let column = 0; column < text.length; column++) {
          const paint = PAINT[text[column]!];
          if (!paint || text[column] === "#") continue;
          base.fillStyle = paint;
          base.fillRect(column * cell, row * cell, cell + 0.5, cell + 0.5);
        }
      }
    }
    element.width = ground.width;
    element.height = ground.height;
    const pen = element.getContext("2d");
    if (!pen) return;
    const at = (x: number, z: number): [number, number] => [(x - minX) * scale, (z - minZ) * scale];
    const dot = (x: number, z: number, r: number, fill: string, edge: string): void => {
      const [px, pz] = at(x, z);
      pen.beginPath();
      pen.arc(px, pz, r, 0, Math.PI * 2);
      pen.fillStyle = fill;
      pen.fill();
      pen.lineWidth = 2.5;
      pen.strokeStyle = edge;
      pen.stroke();
    };
    const paint = (): void => {
      pen.drawImage(ground, 0, 0);
      // The lines the vans run, in the candongueiro's blue.
      pen.lineWidth = 4;
      pen.strokeStyle = css(WORLD.vanBlue);
      pen.setLineDash([10, 7]);
      for (const line of drawn.lines) {
        pen.beginPath();
        for (const [n, [x, z]] of line.points.entries()) {
          const [px, pz] = at(x, z);
          if (n === 0) pen.moveTo(px, pz);
          else pen.lineTo(px, pz);
        }
        pen.closePath();
        pen.stroke();
      }
      pen.setLineDash([]);
      for (const place of places) dot(place.x, place.z, place.kind === "paragem" ? 9 : 6.5, css(place.kind === "paragem" ? WORLD.vanBlue : WORLD.adBoard), css(WORLD.vanWhite));
      for (const van of world.vans()) dot(van.x, van.z, 5, css(WORLD.vanWhite), css(WORLD.vanBlue));
      if (marked) dot(marked.x, marked.z, 12, css(WORLD.flagRed), css(WORLD.vanWhite));
      const you = world.you();
      if (you) {
        // You: a point with the way you face.
        const [px, pz] = at(you.x, you.z);
        const turn = (you.heading * Math.PI) / 180;
        pen.beginPath();
        pen.moveTo(px + Math.sin(turn) * 20, pz - Math.cos(turn) * 20);
        pen.lineTo(px + Math.sin(turn + 2.5) * 12, pz - Math.cos(turn + 2.5) * 12);
        pen.lineTo(px + Math.sin(turn - 2.5) * 12, pz - Math.cos(turn - 2.5) * 12);
        pen.closePath();
        pen.fillStyle = css(WORLD.tarShade);
        pen.fill();
        pen.lineWidth = 3;
        pen.strokeStyle = css(WORLD.vanWhite);
        pen.stroke();
      }
    };
    paint();
    const timer = window.setInterval(paint, 500);
    return () => window.clearInterval(timer);
  }, [drawn, marked]);

  /** A touch on the map chooses the nearest place within reach of a thumb. */
  const choose = (event: MouseEvent): void => {
    const element = canvas.current;
    if (!element || !manifest) return;
    const rect = element.getBoundingClientRect();
    const x = manifest.bounds.minX + ((event.clientX - rect.left) / rect.width) * (manifest.bounds.maxX - manifest.bounds.minX);
    const z = manifest.bounds.minZ + ((event.clientY - rect.top) / rect.height) * (manifest.bounds.maxZ - manifest.bounds.minZ);
    const reach = ((manifest.bounds.maxX - manifest.bounds.minX) / rect.width) * 26;
    const near = places.map((place) => ({ place, far: Math.hypot(place.x - x, place.z - z) })).sort((a, b) => a.far - b.far)[0];
    setChosen(near && near.far < reach ? near.place : null);
  };

  if (!manifest) return <EmptyState glyph="mapa" title={tr.t("map.none")} />;
  const isMarked = chosen !== null && marked !== null && marked.x === chosen.x && marked.z === chosen.z;
  return (
    <div class="tm-map">
      <p class="tm-map-name">{world.word(manifest.nameKey)}</p>
      <div class="tm-map-frame">
        <canvas ref={canvas} class="tm-map-canvas" role="img" aria-label={tr.t("app.mapa")} onClick={choose} />
      </div>
      <ul class="tm-map-key">
        <li class="tm-key-you">{tr.t("map.you")}</li>
        <li class="tm-key-paragem">{tr.t("map.paragens")}</li>
        <li class="tm-key-ponto">{tr.t("map.pontos")}</li>
        <li class="tm-key-linha">{tr.t("map.linhas")}</li>
      </ul>
      {chosen ? (
        <div class="tm-place">
          <strong>{chosen.name}</strong>
          {chosen.line ? <p>{chosen.line}</p> : null}
          <Button kind={isMarked ? "quiet" : "solid"} onPress={() => onMark(isMarked ? null : { x: chosen.x, z: chosen.z, name: chosen.name })}>
            {tr.t(isMarked ? "map.unmark" : "map.mark")}
          </Button>
        </div>
      ) : (
        <p class="tm-hint">{tr.t("map.hint")}</p>
      )}
    </div>
  );
}

function Definicoes({ world }: { world: WorldProvider }) {
  const [, redraw] = useState(0);
  useEffect(() => world.watch(() => redraw((n) => n + 1)), []);
  useEffect(() => {
    // What has been downloaded goes on being counted while the app is open.
    const timer = window.setInterval(() => redraw((n) => n + 1), 1500);
    return () => window.clearInterval(timer);
  }, []);
  const settings = world.settings;
  const used = world.dataUsed();
  return (
    <div class="tm-settings">
      <Choice
        label={tr.t("settings.quality")}
        options={[
          { id: "poupanca", label: tr.t("settings.quality.poupanca") },
          { id: "normal", label: tr.t("settings.quality.normal") },
          { id: "alta", label: tr.t("settings.quality.alta") },
        ]}
        value={settings.poupanca ? "poupanca" : settings.tier}
        onChange={(tier) => world.change({ tier, poupanca: false })}
      />
      <Toggle label={tr.t("hud.poupanca")} on={settings.poupanca} onChange={(poupanca) => world.change({ poupanca })} />
      <p class="tm-note">{tr.t("settings.poupanca.note")}</p>
      <div class="tm-row">
        <span>{tr.t("data.label")}</span>
        <DataMeter sessionBytes={used.session} monthBytes={used.month} />
      </div>
      <Toggle label={tr.t("settings.sound")} on={settings.sound && !settings.poupanca} onChange={(sound) => world.change({ sound })} />
      <Choice
        label={tr.t("settings.hand")}
        options={[
          { id: "direita", label: tr.t("settings.hand.right") },
          { id: "esquerda", label: tr.t("settings.hand.left") },
        ]}
        value={settings.leftHanded ? "esquerda" : "direita"}
        onChange={(hand) => world.change({ leftHanded: hand === "esquerda" })}
      />
    </div>
  );
}

/** The Telemóvel over the world. `onMark` gives the compass a place to point to, or takes it away. */
export function Telemovel({ world, open, first, marked, onMark, onClose }: { world: WorldProvider; open: boolean; first?: string | null; marked: Marked | null; onMark: (place: Marked | null) => void; onClose: () => void }) {
  const [app, setApp] = useState<AppId | null>(APP_GLYPHS.find((id) => id === first) ?? null);
  useEffect(() => {
    if (!open) setApp(null);
  }, [open]);
  return (
    <PhoneSheet open={open} apps={APPS} app={app} onOpen={setApp} onBack={() => setApp(null)} onClose={onClose}>
      {app === "mapa" ? (
        <Mapa world={world} marked={marked} onMark={onMark} />
      ) : app === "definicoes" ? (
        <Definicoes world={world} />
      ) : app === "bi" ? (
        <Bi world={world} />
      ) : app ? (
        <EmptyState glyph={app} title={tr.t("state.soon")}>
          {tr.t(`app.${app}.soon`)}
        </EmptyState>
      ) : null}
    </PhoneSheet>
  );
}
