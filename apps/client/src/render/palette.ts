// The colours of the world. The interface takes its colours from the tokens
// in packages/ui; the 3D world takes them from here and from nowhere else (a
// test fails the build on a colour written in any other file of the client).
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

/** What things are made of. Buildings pick from `walls`; nothing in the world invents a colour. */
export const WORLD = {
  earth: hex("#B5502E"), // red earth where the tar ends
  pavement: hex("#D9C7A6"),
  tar: hex("#3A3F4A"),
  line: hex("#F3EAD6"),
  seaDeep: hex("#0F5F6B"),
  seaShallow: hex("#2FA79A"),
  palmTrunk: hex("#7A5A3A"),
  palmLeaf: hex("#2F7A4A"),
  vanWhite: hex("#F6F3EA"),
  vanBlue: hex("#1E63C4"),
  window: hex("#22324A"),
  windowLit: hex("#FFD58A"),
  walls: [hex("#E8D6B8"), hex("#F2C9A0"), hex("#E7A08A"), hex("#F3E3C2"), hex("#C9D6DA"), hex("#F0B6C0"), hex("#E9C46A"), hex("#B9C7B0")],
  person: [hex("#D9483B"), hex("#F2A93B"), hex("#1E63C4"), hex("#FBF8F1"), hex("#17877F")],
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
  { hour: 0, sun: hex("#9DB4E6"), sunStrength: 0.42, zenith: hex("#0C1838"), horizon: hex("#243A66"), skyLight: hex("#3A5288"), groundLight: hex("#1F2A44"), ambientStrength: 0.95 },
  { hour: 5.2, sun: hex("#9DB4E6"), sunStrength: 0.4, zenith: hex("#16255A"), horizon: hex("#5B5A8C"), skyLight: hex("#4A5F96"), groundLight: hex("#2A3050"), ambientStrength: 0.95 },
  { hour: 6.2, sun: hex("#FFB070"), sunStrength: 1.0, zenith: hex("#4273B8"), horizon: hex("#FFC79A"), skyLight: hex("#9DB8E0"), groundLight: hex("#8A6A58"), ambientStrength: 0.85 },
  { hour: 8, sun: hex("#FFE9C8"), sunStrength: 1.7, zenith: hex("#3E86D6"), horizon: hex("#BFE0F5"), skyLight: hex("#BFD9F2"), groundLight: hex("#A08468"), ambientStrength: 0.8 },
  { hour: 12, sun: hex("#FFF6E8"), sunStrength: 2.0, zenith: hex("#2F7FD8"), horizon: hex("#CFE8F7"), skyLight: hex("#CFE4F7"), groundLight: hex("#B09474"), ambientStrength: 0.8 },
  { hour: 16, sun: hex("#FFE7B8"), sunStrength: 1.9, zenith: hex("#3A7CCB"), horizon: hex("#EBDDC0"), skyLight: hex("#D6DCE6"), groundLight: hex("#B58E68"), ambientStrength: 0.9 },
  { hour: 17, sun: hex("#FFC273"), sunStrength: 1.85, zenith: hex("#4C74BC"), horizon: hex("#F7C888"), skyLight: hex("#F0D2B4"), groundLight: hex("#C08658"), ambientStrength: 1.2 },
  { hour: 17.6, sun: hex("#FF9C48"), sunStrength: 1.7, zenith: hex("#5A60A6"), horizon: hex("#F59A58"), skyLight: hex("#F2B890"), groundLight: hex("#C07048"), ambientStrength: 1.25 },
  { hour: 18, sun: hex("#FF7838"), sunStrength: 1.0, zenith: hex("#3E4688"), horizon: hex("#E9784E"), skyLight: hex("#C08A90"), groundLight: hex("#8A4E48"), ambientStrength: 1.1 },
  { hour: 18.7, sun: hex("#9DB4E6"), sunStrength: 0.4, zenith: hex("#1B2658"), horizon: hex("#6C5080"), skyLight: hex("#4E5A94"), groundLight: hex("#2E2C4C"), ambientStrength: 0.95 },
  { hour: 19.6, sun: hex("#9DB4E6"), sunStrength: 0.42, zenith: hex("#0C1838"), horizon: hex("#243A66"), skyLight: hex("#3A5288"), groundLight: hex("#1F2A44"), ambientStrength: 0.95 },
  { hour: 24, sun: hex("#9DB4E6"), sunStrength: 0.42, zenith: hex("#0C1838"), horizon: hex("#243A66"), skyLight: hex("#3A5288"), groundLight: hex("#1F2A44"), ambientStrength: 0.95 },
];
