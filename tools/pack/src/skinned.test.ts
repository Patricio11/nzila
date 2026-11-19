// A model with a skeleton made small to send (packSkinned, F-215): checked on a small skinned model made here,
// so it runs on any machine, with or without Blender.

import { Accessor, Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { describe, expect, test } from "vitest";
import { packSkinned } from "./assets.ts";

/** A strip of four corners hung from two bones, painted from the palette, as Blender writes a body. */
async function skinnedModel(): Promise<Uint8Array> {
  const document = new Document();
  const buffer = document.createBuffer();
  const floats = (type: "VEC2" | "VEC3" | "VEC4" | "MAT4", values: number[]): Accessor => document.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
  const positions = [0, 0, 0, 0.5, 0, 0, 0, 1.7, 0, 0.5, 1.7, 0.1];
  const primitive = document
    .createPrimitive()
    .setAttribute("POSITION", floats("VEC3", positions))
    .setAttribute("NORMAL", floats("VEC3", [0, 0, 1, 0, 0, 1, 0, 0.6, 0.8, 0.6, 0, 0.8]))
    .setAttribute("TEXCOORD_0", floats("VEC2", [0.03125, 0.96875, 0.15625, 0.96875, 0.53125, 0.40625, 0.96875, 0.03125]))
    .setAttribute("JOINTS_0", document.createAccessor().setType("VEC4").setArray(new Uint8Array([0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])).setBuffer(buffer))
    .setAttribute("WEIGHTS_0", floats("VEC4", [0.75, 0.25, 0, 0, 0.6, 0.4, 0, 0, 1, 0, 0, 0, 0.9, 0.1, 0, 0]))
    .setIndices(document.createAccessor().setType("SCALAR").setArray(new Uint16Array([0, 1, 2, 2, 1, 3])).setBuffer(buffer))
    .setMaterial(document.createMaterial("palette").setBaseColorTexture(document.createTexture("palette").setMimeType("image/png").setImage(new Uint8Array([137, 80, 78, 71]))));
  const hips = document.createNode("hips").setTranslation([0, 0.95, 0]);
  const head = document.createNode("head").setTranslation([0, 0.6, 0]);
  hips.addChild(head);
  const bindings = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.95, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1.55, 0, 1];
  const skin = document.createSkin("skeleton").addJoint(hips).addJoint(head).setInverseBindMatrices(floats("MAT4", bindings));
  const body = document.createNode("body").setMesh(document.createMesh("body").addPrimitive(primitive)).setSkin(skin);
  document.createScene().addChild(hips).addChild(body);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

describe("a model with a skeleton, made small to send", () => {
  test("is compressed, with its normals, palette corners and weights stored small, and nothing a skeleton depends on moved", async () => {
    const raw = await skinnedModel();
    const small = await packSkinned(raw);
    // (On a model this small the compression's own tables outweigh what it saves: the bytes are judged on the real
    // people, by the pack and the first-play budget.)
    expect(small.length).toBeGreaterThan(0);

    await MeshoptDecoder.ready;
    const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).readBinary(small);
    const used = document.getRoot().listExtensionsUsed().map((extension) => extension.extensionName);
    expect(used).toContain("KHR_mesh_quantization");
    expect(used).toContain("EXT_meshopt_compression");
    const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    const attribute = (name: string): Accessor => primitive.getAttribute(name)!;
    // Positions as they were, so the wardrobe can move a piece onto another body's skeleton.
    expect(attribute("POSITION").getComponentType()).toBe(Accessor.ComponentType.FLOAT);
    expect(Array.from(attribute("POSITION").getArray()!)).toEqual(Array.from(new Float32Array([0, 0, 0, 0.5, 0, 0, 0, 1.7, 0, 0.5, 1.7, 0.1])));
    // The rest small, and still what it was within what can be seen.
    expect(attribute("NORMAL").getComponentType()).toBe(Accessor.ComponentType.BYTE);
    expect(attribute("TEXCOORD_0").getComponentType()).toBe(Accessor.ComponentType.UNSIGNED_SHORT);
    expect(attribute("WEIGHTS_0").getComponentType()).toBe(Accessor.ComponentType.UNSIGNED_BYTE);
    const near = (name: string, expected: number[], within: number): void => {
      const element: number[] = [];
      const got: number[] = [];
      for (let i = 0; i < attribute(name).getCount(); i++) got.push(...attribute(name).getElement(i, element));
      expect(got.length).toBe(expected.length);
      got.forEach((value, i) => expect(Math.abs(value - expected[i]!), `${name}[${i}]`).toBeLessThan(within));
    };
    near("NORMAL", [0, 0, 1, 0, 0, 1, 0, 0.6, 0.8, 0.6, 0, 0.8], 0.01);
    // Each corner of the palette still falls in the middle of its own square (the atlas has 32 to a side).
    near("TEXCOORD_0", [0.03125, 0.96875, 0.15625, 0.96875, 0.53125, 0.40625, 0.96875, 0.03125], 0.0001);
    near("WEIGHTS_0", [0.75, 0.25, 0, 0, 0.6, 0.4, 0, 0, 1, 0, 0, 0, 0.9, 0.1, 0, 0], 0.005);
    // The skeleton and where the body hangs from it are untouched.
    const node = document.getRoot().listNodes().find((one) => one.getName() === "body")!;
    expect(node.getTranslation()).toEqual([0, 0, 0]);
    expect(node.getScale()).toEqual([1, 1, 1]);
    expect(Array.from(node.getSkin()!.getInverseBindMatrices()!.getArray()!)).toEqual(Array.from(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.95, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1.55, 0, 1])));
    // The palette's picture does not travel: the game has it.
    expect(document.getRoot().listTextures()).toEqual([]);
  });
});
