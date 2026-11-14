// The colours of the world. The interface takes its colours from the tokens
// in packages/ui; the 3D world takes them from here and from nowhere else (a
// test fails the build on a colour written in any other file of the client).
// They live in this package because the renderer, the pack tools and the
// Blender scripts must all mean the same colour by the same name.
//
// This is the seed of the art bible (docs/ART_BIBLE.md, written with the
// first real district): Luanda at five in the afternoon. Confident colour,
// few of them, and never all equally saturated.

/** A colour as red, green and blue, each 0 to 255, as the eye sees it (sRGB). */
export type Rgb = readonly [number, number, number];

export function hex(value: string): Rgb {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * What things are made of. Nothing in the world invents a colour: a wall, a
 * leaf, a kerb each take one of these. Few colours, chosen to sit together
 * at golden hour, and not all equally saturated.
 */
export const WORLD = {
  // Ground
  earth: hex("#B5502E"), // red earth where the tar ends
  pavement: hex("#D9C7A6"),
  pavementShade: hex("#C2AF8E"), // the patch of shade baked under a tree or a lamp, for phones that draw no shadows
  kerb: hex("#EFE6D0"),
  tar: hex("#3D424D"),
  tarShade: hex("#2D313A"),
  line: hex("#F3EAD6"),
  // The bay
  seaDeep: hex("#0F5F6B"),
  seaShallow: hex("#2FA79A"),
  // Trees
  palmTrunk: hex("#8C6B49"),
  palmTrunkDark: hex("#6C5036"),
  palmLeaf: hex("#3F8C50"),
  palmLeafDark: hex("#2A6B40"),
  coconut: hex("#5A3E22"),
  acaciaTrunk: hex("#5F4735"),
  acaciaLeaf: hex("#5A9A3C"),
  acaciaLeafDark: hex("#3C7A32"),
  acaciaFlower: hex("#E2452E"), // the acácia rubra in flower
  // The blue and white
  vanWhite: hex("#F6F3EA"),
  vanBlue: hex("#2B7FD4"), // the blue of the candongueiro, from the founder's photograph
  // Buildings
  window: hex("#2A3B56"),
  windowLit: hex("#5F7896"), // glass by day; at night it glows (see GLOW)
  plinth: hex("#8E857A"),
  roof: hex("#B9603E"),
  roofZinc: hex("#A3ABAE"),
  tank: hex("#2F6FB5"), // the water tank on the roof
  metal: hex("#4B5059"),
  wood: hex("#9A6B3E"),
  awningRed: hex("#C8402F"),
  awningGold: hex("#F2A93B"),
  awningTeal: hex("#17877F"),
  // The bairro (from the founder's photographs, LUANDA_REFERENCE.md §6d)
  sand: hex("#C9B79A"), // an earth street: pale and grey-brown, not red
  sandDark: hex("#B5A286"), // ruts, and the damp line of a drain
  concrete: hex("#B8B1A3"),
  blockGrey: hex("#9C978E"), // bare cement block
  zincRust: hex("#8E4F33"),
  zincRed: hex("#A8463A"),
  zincBlue: hex("#5C84A6"),
  paintMint: hex("#A8D8B6"),
  paintWhite: hex("#F0EDE4"),
  pole: hex("#5A4A3B"), // a wooden post, and the wires it carries
  drum: hex("#2F6FB5"), // the blue plastic drum that holds the water
  cloth: hex("#E8C23A"), // washing on the line, a shop's board
  lampPoolSand: hex("#C9B79A"), // the earth under a bairro's lamp: earth by day, a pool of light at night
  // People (art/scripts/person.py)
  hairBlack: hex("#17120F"),
  hairGrey: hex("#8D8A84"),
  eyeWhite: hex("#E4DDD0"),
  eyeDark: hex("#1B1310"),
  eyeBrown: hex("#3B2214"),
  jeans: hex("#3A5A86"),
  jeansDark: hex("#26364F"),
  khaki: hex("#A8946A"),
  clothBlack: hex("#24211F"),
  shoe: hex("#2C2521"),
  shoeWhite: hex("#E9E6DE"),
  shoeTan: hex("#9B6B45"),
  shoeSole: hex("#D8D2C4"),
  // Street lamps
  lamp: hex("#E9E2CF"),
  lampPool: hex("#D9C7A6"), // the pavement under a lamp: pavement by day, a pool of light at night
  walls: [hex("#E8D6B8"), hex("#F2C9A0"), hex("#E7A08A"), hex("#F3E3C2"), hex("#C9D6DA"), hex("#F0B6C0"), hex("#E9C46A"), hex("#B9C7B0")],
  person: [hex("#D9483B"), hex("#F2A93B"), hex("#1E63C4"), hex("#FBF8F1"), hex("#17877F")],
  skin: [hex("#5A3B2A"), hex("#7A5238"), hex("#3F2A1E"), hex("#4B3021"), hex("#8E6748")],
  /** The lips that go with each skin: a shade deeper and redder. */
  lip: [hex("#4E2B25"), hex("#693A31"), hex("#38211C"), hex("#42261F"), hex("#7A4A3D")],
  /** The upper lip, which is always the darker of the two. */
  lipDark: [hex("#3A1F1A"), hex("#4E2A23"), hex("#281613"), hex("#2F1A15"), hex("#5C362C")],
} as const;

/**
 * What gives off light after dark, and the colour of that light. By day
 * these are ordinary colours; as night comes on they glow, which is what
 * makes a street at night warm and readable without a single extra lamp for
 * the phone to compute.
 */
export const GLOW = {
  windowLit: hex("#FFCB73"),
  lamp: hex("#FFE9B8"),
  lampPool: hex("#8A5F26"),
  lampPoolSand: hex("#7A5628"),
} as const;

/** The soft dark patch under a person or a vehicle on the lower tiers. */
export const BLOB_SHADOW = "rgba(10, 16, 28, 0.55)";
export const BLOB_SHADOW_EDGE = "rgba(10, 16, 28, 0)";

/** One moment of the day. Between two moments the light is blended. */
export interface LightKey {
  /** Hour of the game day, 0 to 24. */
  readonly hour: number;
  /** The sun, or at night the moon. */
  readonly sun: Rgb;
  /** How strongly it lights, 0 to about 2. */
  readonly sunStrength: number;
  /** The sky straight up, and at the horizon. The horizon is also the colour of the distance haze. */
  readonly zenith: Rgb;
  readonly horizon: Rgb;
  /** Light from the sky on what faces up, and from the ground on what faces down. */
  readonly skyLight: Rgb;
  readonly groundLight: Rgb;
  readonly ambientStrength: number;
}

/**
 * The day in Luanda. Golden hour (17:00 to 18:00) is where the look lives;
 * the world clock gives it a quarter of the daylight. Night is blue and
 * readable, never black: dim is information, not a horror filter.
 */
export const DAY: readonly LightKey[] = [
  { hour: 0, sun: hex("#A9BEEE"), sunStrength: 0.5, zenith: hex("#0C1838"), horizon: hex("#243A66"), skyLight: hex("#4A64A0"), groundLight: hex("#26324E"), ambientStrength: 1.05 },
  { hour: 5.2, sun: hex("#9DB4E6"), sunStrength: 0.4, zenith: hex("#16255A"), horizon: hex("#5B5A8C"), skyLight: hex("#4A5F96"), groundLight: hex("#2A3050"), ambientStrength: 0.95 },
  { hour: 6.2, sun: hex("#FFB070"), sunStrength: 1.0, zenith: hex("#4273B8"), horizon: hex("#FFC79A"), skyLight: hex("#9DB8E0"), groundLight: hex("#8A6A58"), ambientStrength: 0.85 },
  { hour: 8, sun: hex("#FFE9C8"), sunStrength: 1.7, zenith: hex("#3E86D6"), horizon: hex("#BFE0F5"), skyLight: hex("#BFD9F2"), groundLight: hex("#A08468"), ambientStrength: 0.8 },
  { hour: 12, sun: hex("#FFF6E8"), sunStrength: 2.0, zenith: hex("#2F7FD8"), horizon: hex("#CFE8F7"), skyLight: hex("#CFE4F7"), groundLight: hex("#B09474"), ambientStrength: 0.8 },
  { hour: 16, sun: hex("#FFE7B8"), sunStrength: 1.9, zenith: hex("#3A7CCB"), horizon: hex("#EBDDC0"), skyLight: hex("#D6DCE6"), groundLight: hex("#B58E68"), ambientStrength: 0.9 },
  { hour: 17, sun: hex("#FFD79A"), sunStrength: 1.8, zenith: hex("#4C74BC"), horizon: hex("#F7C888"), skyLight: hex("#F0DCC8"), groundLight: hex("#C89A70"), ambientStrength: 1.2 },
  { hour: 17.6, sun: hex("#FFC27A"), sunStrength: 1.6, zenith: hex("#5A60A6"), horizon: hex("#F7A864"), skyLight: hex("#F0D0BC"), groundLight: hex("#C48A66"), ambientStrength: 1.3 },
  { hour: 18, sun: hex("#FF9E5E"), sunStrength: 1.15, zenith: hex("#3E4688"), horizon: hex("#EE8458"), skyLight: hex("#D9B0A8"), groundLight: hex("#8A5A58"), ambientStrength: 1.3 },
  { hour: 18.7, sun: hex("#9DB4E6"), sunStrength: 0.4, zenith: hex("#1B2658"), horizon: hex("#6C5080"), skyLight: hex("#4E5A94"), groundLight: hex("#2E2C4C"), ambientStrength: 0.95 },
  { hour: 19.6, sun: hex("#A9BEEE"), sunStrength: 0.5, zenith: hex("#0C1838"), horizon: hex("#243A66"), skyLight: hex("#4A64A0"), groundLight: hex("#26324E"), ambientStrength: 1.05 },
  { hour: 24, sun: hex("#A9BEEE"), sunStrength: 0.5, zenith: hex("#0C1838"), horizon: hex("#243A66"), skyLight: hex("#4A64A0"), groundLight: hex("#26324E"), ambientStrength: 1.05 },
];
