// What a place is, said by a sign over it (founder, 2026-11-16, from a
// competitor's picture: "icons that represent what the house or building is,
// to identify a restaurant, a cantina, a house"). Over every point of
// interest and every paragem floats a medallion in the colours of the pano:
// a black disc ringed in yellow, the house glyph of the place in white.
//
// They are all one mesh on one picture: one draw. Each medallion is a square
// that is turned to the camera every frame, and shrinks to nothing with
// distance, so that a street shows the few that are near and not a sky of
// signs. The same medallions will mark the lots (a restaurante, a cantina, a
// home for rent) when lots exist.

import { GLYPHS, type GlyphName } from "@nzila/ui";
import { WORLD, type Manifest } from "@nzila/world/client";
import { BufferAttribute, BufferGeometry, CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3, type Camera } from "three";
import { type WorldRenderer } from "./world-renderer.ts";

/** A medallion's size in metres, how high over the place it floats, and its picture's size in pixels. */
const SIZE_M = 1.7;
const OVER_M = 4.1;
const CELL_PX = 128;
/** Whole within this distance, gone beyond the second: metres. */
const NEAR_M = 55;
const FAR_M = 80;
/** Two places nearer than this share one sign. */
const SAME_SPOT_M = 9;

const css = (colour: readonly [number, number, number]): string => `#${colour.map((part) => part.toString(16).padStart(2, "0")).join("")}`;

/** The glyph of a place whose manifest names none, or names one the game has not drawn. */
export const DEFAULT_GLYPH: GlyphName = "ponto";

/** The house glyph for a name from a manifest. */
export function glyphOf(name: string | undefined): GlyphName {
  return name !== undefined && Object.hasOwn(GLYPHS, name) ? (name as GlyphName) : DEFAULT_GLYPH;
}

interface Marked {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class Markers {
  private readonly renderer: WorldRenderer;
  private readonly mesh: Mesh;
  private readonly places: readonly Marked[];
  private readonly right = new Vector3();
  private readonly up = new Vector3();

  private constructor(renderer: WorldRenderer, mesh: Mesh, places: readonly Marked[]) {
    this.renderer = renderer;
    this.mesh = mesh;
    this.places = places;
    renderer.scene.add(mesh);
  }

  /** The medallions of a district, or null when it has nothing to mark. */
  static open(renderer: WorldRenderer, manifest: Manifest): Markers | null {
    const pois = manifest.pois.map((poi) => ({ pos: poi.pos, glyph: glyphOf(poi.glyph) }));
    // A paragem that is itself a point of interest has that one's sign: two signs over one spot read as neither.
    const paragens = manifest.paragens.filter((paragem) => !manifest.pois.some((poi) => SAME_SPOT_M > Math.hypot(poi.pos[0] - paragem.pos[0], poi.pos[2] - paragem.pos[2]))).map((paragem) => ({ pos: paragem.pos, glyph: "paragem" as GlyphName }));
    const wanted = [...pois, ...paragens];
    if (wanted.length === 0) return null;
    // One cell of the picture for each glyph in use.
    const kinds = [...new Set(wanted.map((place) => place.glyph))];
    const canvas = document.createElement("canvas");
    canvas.width = CELL_PX * kinds.length;
    canvas.height = CELL_PX;
    const pen = canvas.getContext("2d");
    if (!pen) return null;
    const black = css(WORLD.clothBlack);
    const yellow = css(WORLD.adBoard);
    const white = css(WORLD.vanWhite);
    for (const [n, kind] of kinds.entries()) {
      const cx = n * CELL_PX + CELL_PX / 2;
      const cy = CELL_PX / 2 - 6;
      // The point under the disc, the disc, its yellow ring and a thin white one inside it.
      pen.fillStyle = black;
      pen.beginPath();
      pen.moveTo(cx - 16, cy + 40);
      pen.lineTo(cx, CELL_PX - 3);
      pen.lineTo(cx + 16, cy + 40);
      pen.fill();
      pen.beginPath();
      pen.arc(cx, cy, 55, 0, Math.PI * 2);
      pen.fill();
      pen.lineWidth = 7;
      pen.strokeStyle = yellow;
      pen.beginPath();
      pen.arc(cx, cy, 49, 0, Math.PI * 2);
      pen.stroke();
      // The glyph: drawn on its 24 px grid, here three times the size.
      pen.save();
      pen.translate(cx - 36, cy - 36);
      pen.scale(3, 3);
      pen.lineWidth = 2;
      pen.lineCap = "round";
      pen.lineJoin = "round";
      pen.strokeStyle = white;
      pen.stroke(new Path2D(GLYPHS[kind]));
      pen.restore();
    }
    const count = wanted.length;
    const uvs = new Float32Array(count * 8);
    const indices: number[] = [];
    for (const [n, place] of wanted.entries()) {
      const u0 = kinds.indexOf(place.glyph) / kinds.length;
      const u1 = u0 + 1 / kinds.length;
      uvs.set([u0, 0, u1, 0, u1, 1, u0, 1], n * 8);
      indices.push(n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 12), 3));
    geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    // Not lit by the sun: a sign is read at night as by day. Not written to the depth, so that their clear corners hide nothing.
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5, fog: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return new Markers(
      renderer,
      mesh,
      wanted.map((place) => ({ x: place.pos[0], y: place.pos[1] + OVER_M, z: place.pos[2] })),
    );
  }

  /** How many places are marked. */
  get count(): number {
    return this.places.length;
  }

  /** Turns every medallion to the camera, and sizes it by how far the viewer is from it. */
  update(camera: Camera, viewerX: number, viewerZ: number, seconds: number): void {
    // From the way the camera is turned now, not from its matrix: that is only brought up to date when a picture is drawn.
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const position = this.mesh.geometry.getAttribute("position") as BufferAttribute;
    for (const [n, place] of this.places.entries()) {
      const far = Math.hypot(place.x - viewerX, place.z - viewerZ);
      const shown = Math.min(1, Math.max(0, (FAR_M - far) / (FAR_M - NEAR_M)));
      const half = (SIZE_M / 2) * shown;
      // A slow bob, each in its own time, so that they read as signs and not as part of the wall behind.
      const y = place.y + Math.sin(seconds * 1.6 + n * 1.7) * 0.07;
      for (const [corner, across, upward] of [[0, -1, -1], [1, 1, -1], [2, 1, 1], [3, -1, 1]] as const) {
        position.setXYZ(n * 4 + corner, place.x + (this.right.x * across + this.up.x * upward) * half, y + (this.right.y * across + this.up.y * upward) * half, place.z + (this.right.z * across + this.up.z * upward) * half);
      }
    }
    position.needsUpdate = true;
  }

  close(): void {
    this.renderer.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const material = this.mesh.material as MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
  }
}
