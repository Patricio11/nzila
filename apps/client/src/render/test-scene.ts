// The test scene of the Phase 1 build order, step 2: a stretch of promenade
// with the bay on one side and twenty plain buildings on the other, a road, a
// van, palms and a few people. Boxes, not art. It exists to see the light and
// to measure the renderer before anything real is modelled; the first real
// district replaces it (Task 1.5).
//
// Everything repeated is drawn in one call (instancing), which is how the
// whole world must be built to stay inside 120 draw calls on a cheap phone.

import { createRng, rngInt, rngRange } from "@nzila/sim";
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Quaternion, Vector3 } from "three";
import { atlasIndex, atlasUv } from "./palette-atlas.ts";
import { WORLD, type Rgb } from "./palette.ts";
import { paint, type WorldRenderer } from "./world-renderer.ts";

export interface TestScene {
  /** Moves what moves and places the camera for `seconds` along the fixed path. The same time always gives the same picture. */
  update(seconds: number): void;
  /** Places the camera at the one view the light is judged on: down the promenade toward the evening sun, the bay to one side, the city to the other. */
  postcard(): void;
}

const LENGTH = 220;

function place(mesh: InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, turn = 0): void {
  const matrix = new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turn), new Vector3(sx, sy, sz));
  mesh.setMatrixAt(index, matrix);
}

interface Flat {
  readonly colour: Rgb;
  readonly width: number;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Flat pieces of ground as one mesh. Each piece takes its colour from its
 * square of the palette atlas, so however many there are they are one draw
 * call: this is how the models of a real district are coloured too.
 */
function ground(renderer: WorldRenderer, pieces: readonly Flat[]): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const piece of pieces) {
    const first = positions.length / 3;
    const [u, v] = atlasUv(atlasIndex(piece.colour));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      positions.push(piece.x + (sx * piece.width) / 2, piece.y, piece.z + (sz * piece.depth) / 2);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    }
    indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  const mesh = new Mesh(geometry, renderer.paletteMaterial);
  mesh.receiveShadow = true;
  return mesh;
}

/** Builds the scene into the renderer. Z below zero is the bay; the city is at positive Z. */
export function buildTestScene(renderer: WorldRenderer): TestScene {
  const { scene } = renderer;
  const rng = createRng(2026);
  const solid = (): MeshLambertMaterial => new MeshLambertMaterial();

  // The ground: the bay, the promenade, the road, the red earth behind.
  const water = renderer.createWater(LENGTH * 3, 400);
  water.position.set(0, -0.6, -206);
  scene.add(water);
  scene.add(
    ground(renderer, [
      { colour: WORLD.pavement, width: LENGTH * 2, depth: 12, x: 0, y: 0, z: 0 },
      { colour: WORLD.tar, width: LENGTH * 2, depth: 9, x: 0, y: 0.01, z: 10.5 },
      { colour: WORLD.pavement, width: LENGTH * 2, depth: 5, x: 0, y: 0.02, z: 17.5 },
      { colour: WORLD.earth, width: LENGTH * 2, depth: 200, x: 0, y: -0.01, z: 120 },
    ]),
  );

  // The sea wall, and the dashes down the middle of the road.
  const wall = new InstancedMesh(new BoxGeometry(1, 1, 1), solid(), 1);
  place(wall, 0, 0, 0.35, -6.2, LENGTH * 2, 0.7, 0.5);
  wall.setColorAt(0, paint(new Color(), WORLD.line));
  wall.castShadow = wall.receiveShadow = true;
  scene.add(wall);
  const dashes = new InstancedMesh(new BoxGeometry(1, 1, 1), solid(), 60);
  for (let i = 0; i < 60; i++) {
    place(dashes, i, -LENGTH + i * 7.4, 0.03, 10.5, 3, 0.02, 0.18);
    dashes.setColorAt(i, paint(new Color(), WORLD.line));
  }
  scene.add(dashes);

  // Twenty buildings in two rows, each a box of a colour from the palette.
  const buildings = new InstancedMesh(new BoxGeometry(1, 1, 1), solid(), 20);
  buildings.castShadow = buildings.receiveShadow = true;
  for (let i = 0; i < 20; i++) {
    const row = i % 2;
    const width = rngRange(rng, 9, 16);
    const depth = rngRange(rng, 9, 14);
    const height = row === 0 ? rngRange(rng, 6, 16) : rngRange(rng, 14, 38);
    const x = -92 + Math.floor(i / 2) * 20 + rngRange(rng, -2, 2);
    place(buildings, i, x, height / 2, row === 0 ? 27 : 46, width, height, depth);
    buildings.setColorAt(i, paint(new Color(), WORLD.walls[rngInt(rng, WORLD.walls.length)]!));
  }
  scene.add(buildings);

  // Palms along the promenade: a trunk and a crown each, two calls for all of them.
  const palms = 14;
  const trunks = new InstancedMesh(new CylinderGeometry(0.16, 0.24, 1, 6), solid(), palms);
  const crowns = new InstancedMesh(new ConeGeometry(1, 1, 7), solid(), palms);
  trunks.castShadow = crowns.castShadow = true;
  for (let i = 0; i < palms; i++) {
    const x = -96 + i * 15 + rngRange(rng, -2, 2);
    const tall = rngRange(rng, 60, 85) / 10;
    place(trunks, i, x, tall / 2, -4.2, 1, tall, 1);
    trunks.setColorAt(i, paint(new Color(), WORLD.palmTrunk));
    place(crowns, i, x, tall + 0.4, -4.2, 2.6, 1.5, 2.6, rngRange(rng, 0, 314) / 100);
    crowns.setColorAt(i, paint(new Color(), WORLD.palmLeaf));
  }
  scene.add(trunks, crowns);

  // People standing about, as many as the tier draws, each with a soft patch under them.
  const count = renderer.tier.crowd;
  const people = new InstancedMesh(new BoxGeometry(0.45, 1.7, 0.3), solid(), count);
  people.castShadow = true;
  const blobs = renderer.createBlobShadows(count + 1);
  blobs.visible = renderer.tier.shadows === "blobs";
  for (let i = 0; i < count; i++) {
    const x = rngRange(rng, -900, 900) / 10;
    const z = rngRange(rng, -45, 45) / 10;
    place(people, i, x, 0.85, z, 1, 0.9 + rngInt(rng, 20) / 100, 1, rngRange(rng, 0, 628) / 100);
    people.setColorAt(i, paint(new Color(), WORLD.person[rngInt(rng, WORLD.person.length)]!));
    place(blobs, i, x, 0.04, z, 1.1, 1, 1.1);
  }
  scene.add(people, blobs);

  // The blue and white van: two boxes, driving the road for ever.
  const van = new InstancedMesh(new BoxGeometry(1, 1, 1), solid(), 2);
  van.castShadow = true;
  van.setColorAt(0, paint(new Color(), WORLD.vanWhite));
  van.setColorAt(1, paint(new Color(), WORLD.vanBlue));
  scene.add(van);

  for (const mesh of [wall, dashes, buildings, trunks, crowns, people, van]) mesh.instanceColor!.needsUpdate = true;

  return {
    update(seconds) {
      const vanX = -LENGTH / 2 + ((seconds * 9) % LENGTH);
      place(van, 0, vanX, 1.35, 12.4, 5, 1.1, 1.9);
      place(van, 1, vanX, 0.65, 12.4, 5.02, 0.6, 1.92);
      van.instanceMatrix.needsUpdate = true;
      place(blobs, count, vanX, 0.05, 12.4, 6, 1, 2.8);
      blobs.instanceMatrix.needsUpdate = true;

      // The fixed path: a walk along the promenade at eye height, looking ahead and
      // slowly from the city to the bay and back, so every part of the picture is measured.
      const x = -70 + ((seconds * 2.2) % 140);
      const look = Math.sin(seconds * 0.35);
      renderer.camera.position.set(x, 1.65, 1.5);
      renderer.camera.lookAt(x + 14, 2.2 + 1.5 * Math.cos(seconds * 0.2), 2 + look * 16);
      renderer.setFocus(x + 8, 0, 6);
    },
    postcard() {
      renderer.camera.position.set(34, 1.7, -2.4);
      renderer.camera.lookAt(-30, 5, 6);
      renderer.setFocus(20, 0, 4);
    },
  };
}
