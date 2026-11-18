// Water that looks like water (the founder, 2026-11-18): the bay at the Marginal, and the Ilha and Mussulo when
// they come. One flat sheet, two triangles, everything in the light it is drawn in:
//
//   the surface    several trains of waves crossing at different lengths and speeds, worked out as a slope at
//                  each point: the water's relief, which the sky and the sun are seen in;
//   the colour     clear turquoise over the shallows by the wall and the sand, deepening to blue further out,
//                  from how far each point is from land (worked out when the pack is built, tools/pack/src/shore.ts);
//   the sky        reflected more the lower the water is seen, as real water does (Fresnel);
//   the sun        a path of glitter toward it, broken by the waves;
//   the shore      a band of foam where the water meets the wall and the sand, coming and going with the swell.
//
// The weakest phones draw two trains of waves and no glitter; the rest draw five. Nothing is downloaded but the
// shore's small picture.

import { Color, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, Vector4, type Texture } from "three";

export const WATER_VERTEX = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

export const WATER_FRAGMENT = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSun;
  uniform vec3 uSunDirection;
  uniform vec3 uLight;
  uniform float uTime;
  uniform float uSparkle;
  uniform sampler2D uShore;
  uniform float uHasShore;
  uniform vec4 uRect;
  varying vec3 vWorld;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  // Smooth noise: a wobble that is the same at the same place.
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // One train of waves: adds its slope to the surface's.
  void wave(vec2 p, vec2 direction, float length, float speed, float height, inout vec2 slope) {
    float k = 6.2831853 / length;
    float phase = dot(direction, p) * k + uTime * speed;
    slope += direction * (height * k * cos(phase));
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 slope = vec2(0.0);
    wave(p, normalize(vec2(0.82, 0.57)), 11.0, 0.9, 0.16, slope);
    wave(p, normalize(vec2(-0.55, 0.83)), 6.3, 1.4, 0.085, slope);
    #if WAVES > 2
      wave(p, normalize(vec2(0.96, -0.28)), 3.1, 2.1, 0.04, slope);
      wave(p, normalize(vec2(-0.33, -0.94)), 1.7, 2.9, 0.018, slope);
      wave(p, normalize(vec2(0.2, 0.98)), 0.9, 3.8, 0.008, slope);
    #endif
    // A slow wobble over the whole bay, so no two places are alike.
    slope += (vec2(noise(p * 0.21 + uTime * 0.05), noise(p * 0.21 - uTime * 0.04)) - 0.5) * 0.12;
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 view = normalize(cameraPosition - vWorld);

    // How far from land: shallow and clear by the wall and the sand, deep further out.
    vec2 uv = (p - uRect.xy) / (uRect.zw - uRect.xy);
    float metres = uHasShore > 0.5 ? texture2D(uShore, uv).r * 25.5 : 25.5;
    float deep = smoothstep(0.6, 16.0, metres);
    vec3 body = mix(uShallow * 1.18, uDeep, deep);
    // The water keeps its own colour under any sky; the light only brightens or darkens it.
    vec3 lit = mix(vec3(dot(uLight, vec3(0.3, 0.6, 0.1))), uLight, 0.35);
    // Light through a wave's face: brighter where the surface turns toward the eye.
    float through = clamp(dot(normal, view), 0.0, 1.0);
    vec3 colour = body * lit * (0.82 + 0.3 * through);

    // The sky in the water, more the lower it is seen.
    float facing = clamp(dot(normal, view), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 bounced = reflect(-view, normal);
    vec3 sky = mix(uHorizon, uZenith, clamp(bounced.y * 1.6, 0.0, 1.0));
    colour = mix(colour, sky, clamp(fresnel * 0.9, 0.0, 0.85));

    // The sun on the water: a soft sheen, and on the stronger phones its glitter, broken by the waves.
    vec3 halfway = normalize(view + uSunDirection);
    float sheen = pow(max(dot(normal, halfway), 0.0), 90.0);
    colour += uSun * sheen * 0.35;
    #if WAVES > 2
      float glint = pow(max(dot(normal, halfway), 0.0), 900.0);
      float flicker = step(0.55, noise(p * 3.7 + vec2(uTime * 1.9, -uTime * 1.3)));
      colour += uSun * glint * flicker * uSparkle * 3.0;
    #endif

    // Foam where the water meets the land: a band against the wall that swells and draws back with the waves, torn
    // into patches; and a thin line where each wave breaks a little further out.
    float swell = 0.55 + 0.45 * sin(uTime * 0.9 + p.x * 0.11 + p.y * 0.07);
    float torn = noise(p * 1.6 + vec2(uTime * 0.35, uTime * 0.21));
    float band = smoothstep(1.5 * swell, 0.15, metres + (torn - 0.5) * 0.9);
    float line = smoothstep(0.28, 0.0, abs(metres - (1.4 + 1.6 * swell))) * smoothstep(0.35, 0.75, torn);
    float foam = clamp(band + line * 0.6, 0.0, 1.0) * uHasShore;
    colour = mix(colour, uFoam * lit * 1.05, foam * 0.85);

    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/** The water's material. `waves` is 2 on the weakest phones and 5 on the rest; the shore is set when it has come. */
export function waterMaterial(colours: { deep: Color; shallow: Color; foam: Color }, waves: 2 | 5, sparkle: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    fog: true,
    defines: { WAVES: waves },
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uDeep: { value: colours.deep },
        uShallow: { value: colours.shallow },
        uFoam: { value: colours.foam },
        uHorizon: { value: new Color() },
        uZenith: { value: new Color() },
        uSun: { value: new Color() },
        uSunDirection: { value: new Vector3(0, 1, 0) },
        uLight: { value: new Color() },
        uTime: { value: 0 },
        uSparkle: { value: sparkle },
        uShore: { value: null },
        uHasShore: { value: 0 },
        uRect: { value: new Vector4(0, 0, 1, 1) },
      },
    ]),
  });
}

/** Gives a water its shore: how far each part of it is from land, over the rectangle it covers (metres, X then Z). */
export function setShore(material: ShaderMaterial, shore: Texture, rect: readonly [number, number, number, number]): void {
  material.uniforms.uShore!.value = shore;
  material.uniforms.uHasShore!.value = 1;
  (material.uniforms.uRect!.value as Vector4).set(rect[0], rect[1], rect[2], rect[3]);
}
