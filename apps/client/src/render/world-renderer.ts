// The renderer: Three.js on WebGL2, and the only place in the game that knows
// Three.js exists. Game code hands it a time of day, a tier and a camera, and
// adds what it wants drawn to `scene`. A WebGPU path can replace this file
// later without anything else changing (seam 4).
//
// The look is Hora Dourada: one sun, a sky that goes from a horizon colour to
// a zenith colour, light from the sky and from the ground, and a haze that
// turns the distance into silhouettes and hides the edge of what is loaded.

import {
  BackSide,
  CanvasTexture,
  Color,
  DataTexture,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { lightingAt, type Lighting } from "./lighting.ts";
import { waterMaterial } from "./water.ts";
import { ATLAS_CELLS, ATLAS_CELL_PX, BLOB_SHADOW, BLOB_SHADOW_EDGE, WORLD, atlasGlowPixels, atlasPixels, type Rgb } from "@nzila/world/client";
import { ResolutionGovernor, TIERS, type Tier, type TierName } from "./tiers.ts";

/** Sets a Three colour from one of ours. */
export function paint(target: Color, colour: Rgb): Color {
  return target.setRGB(colour[0] / 255, colour[1] / 255, colour[2] / 255, SRGBColorSpace);
}

export interface FrameCounts {
  /** Draw calls in the last frame. The budget is 120 (Rule 1). */
  readonly draws: number;
  /** Triangles in the last frame. The budget is 120 000. */
  readonly triangles: number;
  /** The height, in pixels, the picture is being drawn at. */
  readonly height: number;
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    vec4 at = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * at;
  }`;

// The sky. A wide band of the horizon's colour, so that what stands far off
// fades into the same colour as the sky behind it; above that it climbs to
// the zenith. The sun is a soft disc inside a broad glow that warms the whole
// quarter of the sky it stands in, which is most of what golden hour is.
const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDirection;
  uniform float uSunDisc;
  uniform float uSunGlow;
  varying vec3 vDirection;
  void main() {
    vec3 direction = normalize(vDirection);
    float up = clamp(direction.y, 0.0, 1.0);
    float climb = 1.0 - exp(-up * 3.4);
    vec3 colour = mix(uHorizon, uZenith, climb);
    colour = mix(colour, uHorizon * 0.78, clamp(-direction.y * 5.0, 0.0, 1.0));
    float toward = max(dot(direction, uSunDirection), 0.0);
    float glow = pow(toward, 6.0) * 0.22 + pow(toward, 40.0) * 0.38;
    float disc = smoothstep(0.99885, 0.99945, toward);
    colour += uSun * (glow * uSunGlow + disc * uSunDisc);
    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
  }`;


export class WorldRenderer {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(58, 1, 0.3, 500);
  readonly sun = new DirectionalLight();
  private readonly gl: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly ambient = new HemisphereLight();
  private readonly fog = new Fog(0, 10, 100);
  private readonly sky: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly waters: ShaderMaterial[] = [];
  private readonly focus = new Vector3();
  private palette: MeshLambertMaterial | null = null;
  private tierValue: Tier;
  private governor: ResolutionGovernor;
  private light: Lighting = lightingAt(17.3 * 3600);
  private seconds = 0;
  private drawnHeight = 0;

  constructor(canvas: HTMLCanvasElement, tier: TierName) {
    this.canvas = canvas;
    this.tierValue = TIERS[tier];
    this.governor = new ResolutionGovernor(this.tierValue);
    // Edges are smoothed by the graphics card (4x multisampling). On a phone's kind of graphics
    // chip this is nearly free, and without it every roofline is a staircase (finding F-39).
    this.gl = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", alpha: false, stencil: false });
    canvas.addEventListener("webglcontextrestored", () => {
      this.restored += 1;
      // The shadow's picture went with the context: it is drawn again on the next frame.
      this.gl.shadowMap.needsUpdate = true;
    });
    this.gl.shadowMap.type = PCFSoftShadowMap;
    this.scene.fog = this.fog;
    this.scene.add(this.ambient, this.sun, this.sun.target);

    this.sky = new Mesh(
      new SphereGeometry(1, 24, 12),
      new ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: { uZenith: { value: new Color() }, uHorizon: { value: new Color() }, uSun: { value: new Color() }, uSunDirection: { value: new Vector3(0, 1, 0) }, uSunDisc: { value: 1 }, uSunGlow: { value: 1 } },
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.setTier(tier);
    this.setTime(17.3 * 3600);
    this.resize();
  }

  get tier(): Tier {
    return this.tierValue;
  }

  /** What the graphics card calls itself, to tell a real one from a software stand-in. */
  get graphics(): string {
    const context = this.gl.getContext();
    const info = context.getExtension("WEBGL_debug_renderer_info");
    return String(info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER));
  }

  setTier(name: TierName): void {
    const tier = (this.tierValue = TIERS[name]);
    this.governor = new ResolutionGovernor(tier);
    this.fog.near = tier.drawDistanceM * 0.3;
    this.fog.far = tier.drawDistanceM;
    this.camera.far = tier.drawDistanceM * 1.5;
    this.sky.scale.setScalar(tier.drawDistanceM * 1.3);
    const shadows = tier.shadows === "sun";
    this.gl.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    if (shadows) {
      const shadow = this.sun.shadow;
      shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
      shadow.camera.left = shadow.camera.bottom = -tier.shadowReachM;
      shadow.camera.right = shadow.camera.top = tier.shadowReachM;
      shadow.camera.near = 1;
      shadow.camera.far = 400;
      shadow.bias = -0.0006;
      shadow.normalBias = 0.05;
      shadow.camera.updateProjectionMatrix();
      shadow.map?.dispose();
      shadow.map = null;
    }
    for (const water of this.waters) {
      water.uniforms.uSparkle!.value = tier.waterSparkle ? 1.4 : 0;
      if (water.defines.WAVES !== (tier.waterSparkle ? 5 : 2)) {
        water.defines.WAVES = tier.waterSparkle ? 5 : 2;
        water.needsUpdate = true;
      }
    }
    this.camera.updateProjectionMatrix();
    this.applyLight();
  }

  /** The time of the game day, as the world clock gives it. */
  /** 1 with the light on; 0 in an apagão, when the lamps and the windows of the bairro go dark. */
  power = 1;

  setTime(secondOfDay: number): void {
    this.light = lightingAt(secondOfDay);
    this.applyLight();
  }

  private applyLight(): void {
    const light = this.light;
    const direction = new Vector3(...light.sunDirection);
    paint(this.sun.color, light.sun);
    this.sun.intensity = light.sunStrength;
    paint(this.ambient.color, light.skyLight);
    paint(this.ambient.groundColor, light.groundLight);
    this.ambient.intensity = light.ambientStrength * 1.6;
    // The haze is the colour of the sky at the horizon, a shade deeper, so that what is far
    // away stands as a silhouette against the sky and never glows brighter than it.
    paint(this.fog.color, [light.horizon[0] * 0.93, light.horizon[1] * 0.93, light.horizon[2] * 0.95]);
    const sky = this.sky.material.uniforms;
    paint(sky.uZenith!.value as Color, light.zenith);
    paint(sky.uHorizon!.value as Color, light.horizon);
    paint(sky.uSun!.value as Color, light.sun);
    (sky.uSunDirection!.value as Vector3).copy(direction);
    sky.uSunDisc!.value = light.sunUp ? 2.4 : 0.8;
    // The moon has no glow to speak of; the low sun has the most.
    sky.uSunGlow!.value = light.sunUp ? 0.35 + (1 - Math.min(1, light.sunDirection[1] * 2.2)) * 1.55 : 0.12;
    if (this.palette) this.palette.emissiveIntensity = light.night * this.power;
    for (const water of this.waters) {
      const u = water.uniforms;
      paint(u.uHorizon!.value as Color, light.horizon);
      paint(u.uZenith!.value as Color, light.zenith);
      paint(u.uSun!.value as Color, light.sun);
      (u.uSunDirection!.value as Vector3).copy(direction);
      // How lit the water is: bright by day, a deep blue at night, never black.
      const level = 0.28 + 0.72 * (1 - light.night);
      paint(u.uLight!.value as Color, [light.skyLight[0] * level + 60 * (1 - light.night), light.skyLight[1] * level + 60 * (1 - light.night), light.skyLight[2] * level + 60 * (1 - light.night)]);
    }
    this.placeSun();
  }

  /** The point the shadow and the sky are centred on: where the player is. */
  setFocus(x: number, y: number, z: number): void {
    this.focus.set(x, y, z);
    this.placeSun();
  }

  private placeSun(): void {
    const [x, y, z] = this.light.sunDirection;
    this.sun.target.position.copy(this.focus);
    this.sun.position.set(this.focus.x + x * 150, this.focus.y + y * 150, this.focus.z + z * 150);
    this.sun.target.updateMatrixWorld();
  }

  /**
   * The one material of the world: every model coloured from the palette
   * atlas uses it, so they can be drawn together. Made once and shared.
   */
  get paletteMaterial(): MeshLambertMaterial {
    if (!this.palette) {
      const size = ATLAS_CELLS * ATLAS_CELL_PX;
      const picture = new DataTexture(atlasPixels(), size, size);
      picture.colorSpace = SRGBColorSpace;
      // The first row of the picture is the top one, which is how a model's coordinates count (flipY stays off).
      // Flat squares of colour: never blended with their neighbours.
      picture.magFilter = picture.minFilter = NearestFilter;
      picture.needsUpdate = true;
      // What glows after dark: the same squares, lit windows and lamps bright, everything else black.
      const glow = new DataTexture(atlasGlowPixels(), size, size);
      glow.colorSpace = SRGBColorSpace;
      glow.magFilter = glow.minFilter = NearestFilter;
      glow.needsUpdate = true;
      this.palette = new MeshLambertMaterial({ map: picture, emissiveMap: glow, emissive: new Color(1, 1, 1), emissiveIntensity: this.light.night });
    }
    return this.palette;
  }

  /** A sheet of water. Add it to the scene where the bay is. */
  createWater(width: number, depth: number): Mesh<PlaneGeometry, ShaderMaterial> {
    // Real water (render/water.ts): five trains of waves and the sun's glitter where the phone can, two where it cannot.
    const material = waterMaterial({ deep: paint(new Color(), WORLD.seaDeep), shallow: paint(new Color(), WORLD.seaShallow), foam: paint(new Color(), WORLD.paintWhite) }, this.tierValue.waterSparkle ? 5 : 2, this.tierValue.waterSparkle ? 1.4 : 0);
    this.waters.push(material);
    const mesh = new Mesh(new PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    this.applyLight();
    return mesh;
  }

  /**
   * Soft patches for under people and vehicles, all drawn in one call. They
   * are the only shadows on the lowest tier. Set each one's place with
   * `setMatrixAt`; the patch lies flat, one metre across before scaling.
   */
  createBlobShadows(count: number): InstancedMesh {
    const size = 64;
    const picture = document.createElement("canvas");
    picture.width = picture.height = size;
    const pen = picture.getContext("2d")!;
    const fade = pen.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    fade.addColorStop(0, BLOB_SHADOW);
    fade.addColorStop(1, BLOB_SHADOW_EDGE);
    pen.fillStyle = fade;
    pen.fillRect(0, 0, size, size);
    const flat = new PlaneGeometry(1, 1).applyMatrix4(new Matrix4().makeRotationX(-Math.PI / 2));
    const blobs = new InstancedMesh(flat, new MeshBasicMaterial({ map: new CanvasTexture(picture), transparent: true, depthWrite: false, fog: true }), count);
    blobs.renderOrder = 1;
    return blobs;
  }

  /** Fits the picture to the canvas as it is on screen now. */
  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    // On a phone held upright the view is tall: keep what is seen to the sides from getting too narrow.
    this.camera.fov = width < height ? 72 : 58;
    this.camera.updateProjectionMatrix();
    this.drawnHeight = 0;
    this.sizeFor(this.governor.current);
  }

  private sizeFor(pictureHeight: number): void {
    if (pictureHeight === this.drawnHeight) return;
    this.drawnHeight = pictureHeight;
    const height = Math.max(1, this.canvas.clientHeight);
    // Never more pixels than the screen has, never more than the tier allows.
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, pictureHeight / height));
    this.gl.setSize(Math.max(1, this.canvas.clientWidth), height, false);
  }

  /** Draws a frame. `frameMs` is how long the last one took, which is what the picture's size is steered by. */
  /** How many times the browser has taken the graphics context away and given it back. */
  restored = 0;

  render(frameMs: number): void {
    // A cheap phone takes the graphics context away when memory is short. Nothing is drawn while it is gone;
    // when it comes back the renderer builds everything again from what it still holds.
    if (this.gl.getContext().isContextLost()) return;
    this.seconds += Math.min(frameMs, 100) / 1000;
    for (const water of this.waters) water.uniforms.uTime!.value = this.seconds;
    this.sizeFor(this.governor.frame(frameMs));
    this.sky.position.copy(this.camera.position);
    this.gl.render(this.scene, this.camera);
  }

  counts(): FrameCounts {
    return { draws: this.gl.info.render.calls, triangles: this.gl.info.render.triangles, height: Math.round(this.canvas.height) };
  }

  dispose(): void {
    this.gl.dispose();
  }
}
