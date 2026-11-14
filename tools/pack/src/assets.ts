// The asset half of `pack build`: from a Blender file to models small enough
// to send to a phone.
//
//   exportChunks   runs Blender on a district's .blend with
//                  art/scripts/export_chunks.py: chunking, two levels of
//                  detail, binary glTF.
//   optimiseGlb    Meshopt-compresses the geometry of one .glb and turns its
//                  textures into KTX2 with the Khronos `ktx` tool.
//
// Both need tools installed on the machine (Blender; KTX-Software). When one
// is missing the error says which and where to get it; a pack with
// uncompressed models or textures is never built quietly.

import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu } from "@gltf-transform/extensions";
import { dedup, flatten, join as joinMeshes, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const run = promisify(execFile);

function firstExisting(candidates: readonly string[]): string | null {
  return candidates.find((path) => existsSync(path)) ?? null;
}

/** Where Blender is, or null. BLENDER in the environment wins. */
export function findBlender(): string | null {
  const roots = ["C:/Program Files/Blender Foundation"].filter((root) => existsSync(root));
  const installed = roots.flatMap((root) => readdirSync(root).sort().reverse().map((dir) => join(root, dir, "blender.exe")));
  return firstExisting([process.env.BLENDER ?? "", ...installed, "/usr/bin/blender", "/usr/local/bin/blender", "/Applications/Blender.app/Contents/MacOS/Blender"].filter(Boolean));
}

/** Where the Khronos `ktx` tool is, or null. KTX in the environment wins. */
export function findKtx(): string | null {
  return firstExisting([process.env.KTX ?? "", "C:/Program Files/KTX-Software/bin/ktx.exe", "/usr/bin/ktx", "/usr/local/bin/ktx", "/opt/homebrew/bin/ktx"].filter(Boolean));
}

export interface ExportedChunk {
  readonly id: string;
  readonly aabb: [number, number, number, number, number, number];
  readonly lods: string[];
}

/** Runs a Blender script without a window and returns what it printed. */
export async function blender(script: string, args: readonly string[], blendFile?: string): Promise<string> {
  const exe = findBlender();
  if (!exe) throw new Error("Blender was not found. Install it (blender.org) or set BLENDER to its path.");
  const { stdout } = await run(exe, ["-b", ...(blendFile ? [blendFile] : ["--factory-startup"]), "--python-exit-code", "1", "--python", script, "--", ...args], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/** Exports a district's Blender file into `outDir` as chunks with two levels of detail. */
export async function exportChunks(blendFile: string, outDir: string, script: string, chunkMetres = 64, lodRatio = 0.35): Promise<ExportedChunk[]> {
  await blender(script, [outDir, String(chunkMetres), String(lodRatio)], blendFile);
  return JSON.parse(await readFile(join(outDir, "chunks.json"), "utf8")) as ExportedChunk[];
}

/** A material named this, or beginning with it, is coloured from the palette atlas. */
export const PALETTE_MATERIAL = "palette";

let io: NodeIO | null = null;
async function gltfIo(): Promise<NodeIO> {
  if (!io) {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  }
  return io;
}

/**
 * Prepares one .glb for delivery.
 *
 *   One draw call a material. Everything in the file that shares a material
 *   is merged into one mesh, so a chunk coloured from the palette is drawn
 *   in a single call however many buildings it holds.
 *   No texture for the palette. A material whose name begins with "palette"
 *   is coloured from the palette atlas, which the game already has; the copy
 *   Blender embeds is dropped.
 *   Small. Geometry is Meshopt-compressed; any other texture becomes KTX2
 *   (Basis Universal, with mipmaps), which stays compressed in the phone's
 *   memory.
 *
 * A file that has been through here already comes out the same.
 */
export async function optimiseGlb(bytes: Uint8Array): Promise<Uint8Array> {
  const gltf = await gltfIo();
  const document = await gltf.readBinary(bytes);
  document.setLogger(new Logger(Logger.Verbosity.SILENT));
  for (const material of document.getRoot().listMaterials()) {
    if (material.getName().startsWith(PALETTE_MATERIAL)) material.setBaseColorTexture(null);
  }
  // The texture coordinates are kept although no texture uses them here: they are what points
  // each face at its square of the palette, which the game supplies.
  await document.transform(dedup(), flatten(), joinMeshes(), prune({ keepAttributes: true }));

  const textures = document.getRoot().listTextures().filter((texture) => texture.getMimeType() !== "image/ktx2" && texture.getImage());
  if (textures.length > 0) {
    const ktx = findKtx();
    if (!ktx) throw new Error("A model has textures to compress and the `ktx` tool was not found. Install KTX-Software (github.com/KhronosGroup/KTX-Software) or set KTX to its path.");
    const dir = await mkdtemp(join(tmpdir(), "nzila-ktx-"));
    try {
      document.createExtension(KHRTextureBasisu).setRequired(true);
      for (const [i, texture] of textures.entries()) {
        const source = join(dir, `${i}.${texture.getMimeType() === "image/jpeg" ? "jpg" : "png"}`);
        const target = join(dir, `${i}.ktx2`);
        await writeFile(source, texture.getImage()!);
        try {
          await run(ktx, ["create", "--format", "R8G8B8A8_SRGB", "--assign-tf", "srgb", "--encode", "basis-lz", "--generate-mipmap", source, target]);
        } catch (error) {
          // The tool explains itself on its error stream; pass that on.
          throw new Error(`ktx could not compress texture ${i}: ${String((error as { stderr?: string }).stderr ?? error).trim()}`, { cause: error });
        }
        texture.setImage(await readFile(target)).setMimeType("image/ktx2");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  await document.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  return gltf.writeBinary(document);
}
