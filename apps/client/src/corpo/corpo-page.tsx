// /corpo: the people, to look at. A line of bodies made by art/scripts/
// person.py, standing in the game's own light, turned by dragging. A page for
// the founder and the team to judge the body on before it is given a skeleton;
// its words are plain English and are not in the catalog.
//
//   /corpo                         the whole line, from the front
//   /corpo?ang=140                 walked round to that bearing, in degrees
//   /corpo?quem=2&perto            close on the face of the third person
//   /corpo?quem=2                  the whole of the third person
//   /corpo?hour=12&tier=poupanca   as /cena

import { Mesh, type Material } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useEffect, useRef, useState } from "preact/hooks";
import { ground } from "../render/ground.ts";
import { type TierName } from "../render/tiers.ts";
import { WorldRenderer } from "../render/world-renderer.ts";
import { WORLD } from "@nzila/world/client";
import "../cena/cena.css";

interface Standing {
  people: { name: string; x: number; z: number; height: number }[];
  triangles: number;
  each: number;
}

declare global {
  interface Window {
    /** Set when the people are on screen, for the screenshots. */
    __corpo?: { people: number; triangles: number };
  }
}

const BASE = "/packs/dev-people/";

export function Corpo() {
  const params = new URLSearchParams(location.search);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<Standing | null>(null);
  const [missing, setMissing] = useState(false);
  const view = useRef({ angle: ((Number(params.get("ang")) || 0) * Math.PI) / 180, dragging: false, lastX: 0 });

  useEffect(() => {
    if (!canvas.current) return;
    const tier = (params.get("tier") ?? "normal") as TierName;
    const renderer = new WorldRenderer(canvas.current, tier);
    renderer.setTime((Number(params.get("hour")) || 16.6) * 3600);
    renderer.scene.add(ground(renderer, [{ colour: WORLD.pavement, width: 60, depth: 60, x: 0, y: 0, z: 0 }]));
    let closed = false;
    let standing: Standing | null = null;
    const who = params.has("quem") ? Number(params.get("quem")) : null;
    const near = params.has("perto");

    void (async () => {
      try {
        const list = (await (await fetch(`${BASE}pessoas.json`)).json()) as Standing;
        MeshoptDecoder.useWorkers(1);
        const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${BASE}pessoas.glb`);
        if (closed) return;
        gltf.scene.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          (node.material as Material).dispose();
          node.material = renderer.paletteMaterial;
          node.castShadow = node.receiveShadow = true;
        });
        renderer.scene.add(gltf.scene);
        standing = list;
        setInfo(list);
        window.__corpo = { people: list.people.length, triangles: list.triangles };
      } catch {
        if (!closed) setMissing(true);
      }
    })();

    let frame = 0;
    let last = 0;
    const tick = (now: number): void => {
      const elapsed = last === 0 ? 33 : now - last;
      last = now;
      const subject = standing && who !== null ? standing.people[who] : undefined;
      const x = subject?.x ?? 0;
      const tall = subject?.height ?? 1.7;
      // The whole line from far enough to hold it; one person from three paces; a face from an arm's length.
      const upright = renderer.camera.aspect < 1;
      const distance = subject ? (near ? 0.62 : upright ? 3.3 : 2.6) : (upright ? 9.5 : 5.0) * Math.max(1, (standing?.people.length ?? 8) / 8);
      const lookY = subject ? (near ? tall * 0.955 : tall * 0.52) : 0.9;
      const angle = view.current.angle;
      renderer.camera.position.set(x + Math.sin(angle) * distance, subject && near ? lookY + 0.02 : 1.25, Math.cos(angle) * distance);
      renderer.camera.lookAt(x, lookY, 0);
      renderer.setFocus(x, 0, 0);
      renderer.render(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onResize = (): void => renderer.resize();
    window.addEventListener("resize", onResize);
    return () => {
      closed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, []);

  const drag = {
    onPointerDown: (event: PointerEvent) => Object.assign(view.current, { dragging: true, lastX: event.clientX }),
    onPointerUp: () => void (view.current.dragging = false),
    onPointerLeave: () => void (view.current.dragging = false),
    onPointerMove: (event: PointerEvent) => {
      if (!view.current.dragging) return;
      view.current.angle -= (event.clientX - view.current.lastX) * 0.01;
      view.current.lastX = event.clientX;
    },
  };

  return (
    <main class="cena">
      <canvas ref={canvas} class="cena-canvas" style="touch-action: none" {...drag} />
      <section class="cena-panel">
        {missing ? <p class="cena-counts">The people have not been built on this machine: run `pnpm pack:dev` (it needs Blender).</p> : null}
        {info ? (
          <p class="cena-counts">
            {info.people.map((p) => p.name).join(" · ")} · about {info.each} triangles each, standing still: no skeleton yet. Drag to walk round them.
          </p>
        ) : null}
      </section>
    </main>
  );
}
