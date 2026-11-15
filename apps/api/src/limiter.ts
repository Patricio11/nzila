// Rate limits. A fixed window of a minute per key, kept in the memory of this
// process: right for one API process and for tests. With more than one
// process the same interface is backed by Redis (see docs/FINDINGS.md), so
// that a limit is the same whichever process answers.

export interface Limiter {
  /** Counts one call under `key`; false when that makes more than `perMinute` in this minute. */
  allow(key: string, perMinute: number): boolean;
}

export function memoryLimiter(now: () => number = Date.now): Limiter {
  const windows = new Map<string, { minute: number; count: number }>();
  return {
    allow(key, perMinute) {
      const minute = Math.floor(now() / 60_000);
      const window = windows.get(key);
      if (!window || window.minute !== minute) {
        // Old windows are dropped as their keys are seen again; the map is swept when it grows.
        if (windows.size > 50_000) for (const [k, w] of windows) if (w.minute !== minute) windows.delete(k);
        windows.set(key, { minute, count: 1 });
        return perMinute >= 1;
      }
      window.count += 1;
      return window.count <= perMinute;
    },
  };
}
