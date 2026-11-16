// The outdoors: the big boards by the road (art/scripts/kit.py, `outdoor`).
// The board comes with the district; what is on it is paper, and paper is
// drawn here, on every board of the district at once: one picture, one draw.
// Until someone takes a board (ad slots, Task 8.7) it carries the house's
// own poster: the teeth of the pano above and below, and the offer.

import { ptAOTranslator as tr } from "@nzila/i18n";
import { WORLD, type Manifest } from "@nzila/world/client";
import { BufferAttribute, BufferGeometry, CanvasTexture, LinearFilter, Mesh, MeshLambertMaterial, SRGBColorSpace } from "three";
import { type WorldRenderer } from "./world-renderer.ts";

const WIDE_PX = 512;
const css = (colour: readonly [number, number, number]): string => `#${colour.map((part) => part.toString(16).padStart(2, "0")).join("")}`;

export class Outdoors {
  private readonly renderer: WorldRenderer;
  private readonly mesh: Mesh;

  private constructor(renderer: WorldRenderer, mesh: Mesh) {
    this.renderer = renderer;
    this.mesh = mesh;
    renderer.scene.add(mesh);
  }

  /** The posters of a district's outdoors, or null when it has none. */
  static open(renderer: WorldRenderer, manifest: Manifest): Outdoors | null {
    const boards = manifest.adSlots.filter((slot) => slot.kind === "outdoor");
    if (boards.length === 0) return null;
    const [wide, high] = boards[0]!.size;
    const HIGH_PX = Math.round((WIDE_PX * high) / wide);
    const canvas = document.createElement("canvas");
    canvas.width = WIDE_PX;
    canvas.height = HIGH_PX;
    const pen = canvas.getContext("2d");
    if (!pen) return null;
    const black = css(WORLD.clothBlack);
    const yellow = css(WORLD.adBoard);
    const white = css(WORLD.vanWhite);
    const red = css(WORLD.awningRed);
    // The ground of the poster, and the cloth's teeth along its head and its foot: yellow standing, white hanging, on black.
    pen.fillStyle = red;
    pen.fillRect(0, 0, WIDE_PX, HIGH_PX);
    const tooth = 32;
    for (const top of [0, HIGH_PX - tooth]) {
      pen.fillStyle = black;
      pen.fillRect(0, top, WIDE_PX, tooth);
      for (let x = 0; x < WIDE_PX; x += tooth * 2) {
        pen.fillStyle = yellow;
        pen.beginPath();
        pen.moveTo(x + 3, top + tooth - 2);
        pen.lineTo(x + tooth, top + 3);
        pen.lineTo(x + tooth * 2 - 3, top + tooth - 2);
        pen.fill();
        pen.fillStyle = white;
        pen.beginPath();
        pen.moveTo(x + tooth + 3, top + 2);
        pen.lineTo(x + tooth * 2, top + tooth - 3);
        pen.lineTo(x + tooth * 3 - 3, top + 2);
        pen.fill();
      }
    }
    // The offer, as large as the board allows.
    const words = tr.t("van.ad.house");
    pen.fillStyle = white;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    let size = 96;
    do {
      size -= 4;
      pen.font = `800 ${size}px Fraunces, Georgia, serif`;
    } while (pen.measureText(words).width > WIDE_PX - 48 && size > 24);
    pen.fillText(words, WIDE_PX / 2, HIGH_PX / 2 + 2);

    const positions: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (const board of boards) {
      // `facing` is the way the paper looks, in degrees clockwise from +Z; a board with none faces the shore, -Z.
      const turn = ((board.facing ?? 180) * Math.PI) / 180;
      const nx = Math.sin(turn);
      const nz = Math.cos(turn);
      const rx = nz;
      const rz = -nx;
      const [x, y, z] = board.pos;
      const first = positions.length / 3;
      for (const [across, up, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]] as const) {
        positions.push(x + (rx * across * board.size[0]) / 2 + nx * 0.03, y + (up * board.size[1]) / 2, z + (rz * across * board.size[0]) / 2 + nz * 0.03);
        uvs.push(u, v);
        normals.push(nx, 0, nz);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
    geometry.setIndex(indices);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    // A board has its own lamps: the paper keeps some of its light when the sun has gone.
    const paper = new MeshLambertMaterial({ map: texture, emissiveMap: texture, emissiveIntensity: 0.38 });
    paper.emissive.setScalar(1);
    const mesh = new Mesh(geometry, paper);
    mesh.frustumCulled = false;
    return new Outdoors(renderer, mesh);
  }

  close(): void {
    this.renderer.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const material = this.mesh.material as MeshLambertMaterial;
    material.map?.dispose();
    material.dispose();
  }
}
