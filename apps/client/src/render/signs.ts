// Street name plates. The post and the blue plate's place come with the
// district (art/scripts/kit_baixa.py, `placa`); the name is words, and words
// travel in the pack's strings, so the lettering is drawn here: every plate
// of a district on one picture, one material, one draw.
//
// A plate reads from both sides, as an enamel plate on a post does.

import { WORLD, type Manifest } from "@nzila/world/client";
import { BufferAttribute, BufferGeometry, CanvasTexture, LinearFilter, Mesh, MeshLambertMaterial, SRGBColorSpace } from "three";
import { type WorldRenderer } from "./world-renderer.ts";

/** A plate's size in metres, and its picture's in pixels. */
const WIDE_M = 1.5;
const HIGH_M = 0.34;
const WIDE_PX = 512;
const HIGH_PX = 116;
/** The blue of an enamel street plate and the white of its lettering, from the world's palette. */
const css = (colour: readonly [number, number, number]): string => `#${colour.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
const PLATE = css(WORLD.signBlue);
const LETTER = css(WORLD.vanWhite);

export class Signs {
  private readonly mesh: Mesh;
  private readonly renderer: WorldRenderer;

  private constructor(renderer: WorldRenderer, mesh: Mesh) {
    this.renderer = renderer;
    this.mesh = mesh;
    renderer.scene.add(mesh);
  }

  /** The plates of a district, or null when it has none. `word` gives the name for a key. */
  static open(renderer: WorldRenderer, manifest: Manifest, word: (key: string) => string): Signs | null {
    const signs = manifest.signs ?? [];
    if (signs.length === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = WIDE_PX;
    canvas.height = HIGH_PX * signs.length;
    const pen = canvas.getContext("2d");
    if (!pen) return null;
    const positions: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (const [n, sign] of signs.entries()) {
      const top = n * HIGH_PX;
      pen.fillStyle = PLATE;
      pen.fillRect(0, top, WIDE_PX, HIGH_PX);
      pen.strokeStyle = LETTER;
      pen.lineWidth = 5;
      pen.strokeRect(7, top + 7, WIDE_PX - 14, HIGH_PX - 14);
      pen.fillStyle = LETTER;
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      // The name as large as the plate allows, smaller for a long one.
      const name = word(sign.textKey);
      let size = 58;
      do {
        pen.font = `700 ${size}px system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
        size -= 3;
      } while (pen.measureText(name).width > WIDE_PX - 44 && size > 20);
      pen.fillText(name, WIDE_PX / 2, top + HIGH_PX / 2 + 2);

      // Two faces back to back. `facing` is the way the front looks, in degrees clockwise from +Z.
      const turn = (sign.facing * Math.PI) / 180;
      const [x, y, z] = sign.pos;
      const v0 = 1 - (top + HIGH_PX) / canvas.height;
      const v1 = 1 - top / canvas.height;
      for (const side of [1, -1]) {
        const nx = Math.sin(turn) * side;
        const nz = Math.cos(turn) * side;
        // The right hand of someone standing in front of this face and reading it.
        const rx = nz;
        const rz = -nx;
        const first = positions.length / 3;
        for (const [across, up, u, v] of [[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, 1, 0, v1]] as const) {
          positions.push(x + (rx * across * WIDE_M) / 2 + nx * 0.012, y + (up * HIGH_M) / 2, z + (rz * across * WIDE_M) / 2 + nz * 0.012);
          uvs.push(u, v);
          normals.push(nx, 0, nz);
        }
        indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
      }
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
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ map: texture }));
    mesh.frustumCulled = false;
    return new Signs(renderer, mesh);
  }

  /** How many plates there are. */
  get count(): number {
    return (this.mesh.geometry.getAttribute("position").count / 8) | 0;
  }

  close(): void {
    this.renderer.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const material = this.mesh.material as MeshLambertMaterial;
    material.map?.dispose();
    material.dispose();
  }
}
