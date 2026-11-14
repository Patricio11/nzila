// The light at a moment of the game day: where the sun is, what colour it
// and the sky are, how thick the haze. A pure function of the world clock's
// second of the day, with no renderer in it, so it can be tested and so the
// zone and the client always agree on whether it is dark (heat depends on it).

import { DAY, type LightKey, type Rgb } from "@nzila/world/client";

export interface Lighting {
  /** A unit vector toward the sun (or at night, the moon) in game coordinates: X east, Y up, Z south. */
  readonly sunDirection: readonly [number, number, number];
  readonly sun: Rgb;
  readonly sunStrength: number;
  readonly zenith: Rgb;
  readonly horizon: Rgb;
  readonly skyLight: Rgb;
  readonly groundLight: Rgb;
  readonly ambientStrength: number;
  /** 0 by day, 1 in the middle of the night: for lit windows and street lamps. */
  readonly night: number;
  /** True while the real sun is up; false when the light is the moon's. */
  readonly sunUp: boolean;
}

const SUNRISE = 6;
const SUNSET = 18;
/** How high the sun climbs at noon, in degrees. */
const NOON_HEIGHT = 72;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function sunDirection(hour: number): readonly [number, number, number] {
  if (hour < SUNRISE || hour >= SUNSET) {
    // The moon: high and to the south-east, where it lights faces without flattening them.
    const moon = [0.35, 0.82, 0.45] as const;
    const reach = Math.hypot(...moon);
    return [moon[0] / reach, moon[1] / reach, moon[2] / reach];
  }
  const day = (hour - SUNRISE) / (SUNSET - SUNRISE);
  // Never quite on the horizon: a sun at zero height would light nothing and cast endless shadows.
  const height = Math.max(4, Math.sin(Math.PI * day) * NOON_HEIGHT) * (Math.PI / 180);
  // East in the morning, west in the evening, leaning north at midday as in Luanda.
  const x = Math.cos(Math.PI * day) * Math.cos(height);
  const z = -Math.sin(Math.PI * day) * Math.cos(height) * 0.35;
  const y = Math.sin(height);
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/** The light at a second of the game day (0 to 86 399). */
export function lightingAt(secondOfDay: number): Lighting {
  const hour = (((secondOfDay % 86_400) + 86_400) % 86_400) / 3600;
  let before: LightKey = DAY[0]!;
  let after: LightKey = DAY[DAY.length - 1]!;
  for (let i = 0; i < DAY.length - 1; i++) {
    if (hour >= DAY[i]!.hour && hour <= DAY[i + 1]!.hour) {
      before = DAY[i]!;
      after = DAY[i + 1]!;
      break;
    }
  }
  const span = after.hour - before.hour;
  const t = span === 0 ? 0 : (hour - before.hour) / span;
  const sunUp = hour >= SUNRISE && hour < SUNSET;
  // Dark comes on over the forty minutes after sunset and lifts over the forty before sunrise.
  const sinceSunset = hour >= SUNSET ? hour - SUNSET : hour + 24 - SUNSET;
  const untilSunrise = hour < SUNRISE ? SUNRISE - hour : hour >= SUNSET ? SUNRISE + 24 - hour : 0;
  const night = sunUp ? 0 : Math.min(1, sinceSunset / 0.67, untilSunrise / 0.67);
  return {
    sunDirection: sunDirection(hour),
    sun: mixRgb(before.sun, after.sun, t),
    sunStrength: mix(before.sunStrength, after.sunStrength, t),
    zenith: mixRgb(before.zenith, after.zenith, t),
    horizon: mixRgb(before.horizon, after.horizon, t),
    skyLight: mixRgb(before.skyLight, after.skyLight, t),
    groundLight: mixRgb(before.groundLight, after.groundLight, t),
    ambientStrength: mix(before.ambientStrength, after.ambientStrength, t),
    night,
    sunUp,
  };
}

/** How bright a colour looks, 0 to 1. */
export function brightness(colour: Rgb): number {
  return (0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2]) / 255;
}
