// The Mapa: the district, its paragens, its places, the lines, the vans, the people near, and you.
// Fetched when it is first opened, not before (the megabytes rule: finding F-188).

import { ptAOTranslator as tr } from "@nzila/i18n";
import { Button, EmptyState } from "@nzila/ui";
import { WORLD } from "@nzila/world/client";
import { type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { type DistrictMap, type MapLine, type WorldProvider } from "../world/provider.ts";
import { type Marked } from "./telemovel.tsx";

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

/** One line of the map's key: the mark exactly as the map draws it, and its word. */
function Key({ word, children }: { word: string; children: ComponentChildren }) {
  return (
    <li>
      <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
        {children}
      </svg>
      {word}
    </li>
  );
}

export function Mapa({ world, marked, onMark }: { world: WorldProvider; marked: Marked | null; onMark: (place: Marked | null) => void }) {
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
      if (marked) {
        // The place the compass points to: a ring round it, so that what is there is still seen.
        const [px, pz] = at(marked.x, marked.z);
        for (const [width, colour] of [[8, css(WORLD.vanWhite)], [4.5, css(WORLD.flagRed)]] as const) {
          pen.beginPath();
          pen.arc(px, pz, 15, 0, Math.PI * 2);
          pen.lineWidth = width;
          pen.strokeStyle = colour;
          pen.stroke();
        }
      }
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
      // Whoever is in the street with the player, as far as the zone tells this phone of them. Drawn last:
      // someone standing beside the player is a dot on their arrow, not hidden under it.
      const people = world.people();
      for (const one of people) dot(one.x, one.z, 5.5, css(WORLD.flagRed), css(WORLD.vanWhite));
      element.dataset.gente = String(people.length);
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
      <p class="tm-map-name">
        {world.word(manifest.nameKey)}
        {world.channelNamed() !== null ? <span class="tm-map-canal">{tr.t("map.channel", { n: world.channelNamed()! })}</span> : null}
      </p>
      <div class="tm-map-frame">
        <canvas ref={canvas} class="tm-map-canvas" role="img" aria-label={tr.t("app.mapa")} onClick={choose} />
      </div>
      <ul class="tm-map-key">
        <Key word={tr.t("map.you")}>
          <path d="M9 1 L15 15 L9 11.5 L3 15 Z" fill={css(WORLD.tarShade)} stroke={css(WORLD.vanWhite)} stroke-width="1.8" stroke-linejoin="round" />
        </Key>
        {world.channel() !== null ? (
          <Key word={tr.t("map.gente")}>
            <circle cx="9" cy="8" r="5" fill={css(WORLD.flagRed)} stroke={css(WORLD.vanWhite)} stroke-width="2" />
          </Key>
        ) : null}
        <Key word={tr.t("map.paragens")}>
          <circle cx="9" cy="8" r="5.5" fill={css(WORLD.vanBlue)} stroke={css(WORLD.vanWhite)} stroke-width="2" />
        </Key>
        <Key word={tr.t("map.pontos")}>
          <circle cx="9" cy="8" r="4.5" fill={css(WORLD.adBoard)} stroke={css(WORLD.vanWhite)} stroke-width="2" />
        </Key>
        {drawn && drawn.lines.length > 0 ? (
          <>
            <Key word={tr.t("map.linhas")}>
              <path d="M1 8 H17" stroke={css(WORLD.vanBlue)} stroke-width="3" stroke-dasharray="5 3.5" />
            </Key>
            <Key word={tr.t("map.vans")}>
              <circle cx="9" cy="8" r="3.5" fill={css(WORLD.vanWhite)} stroke={css(WORLD.vanBlue)} stroke-width="2" />
            </Key>
          </>
        ) : null}
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
