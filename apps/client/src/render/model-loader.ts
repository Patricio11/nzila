// The loader for the game's models with a skeleton (people, the wardrobe, dogs): their geometry is sent
// meshopt-compressed (F-215), with the same decoder the world's chunks already use.

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export function modelLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}
