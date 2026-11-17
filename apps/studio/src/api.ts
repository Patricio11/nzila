// What the Estúdio asks of the API, at /api on its own address (so that the
// token never crosses to another origin). The token lives for this tab only:
// closing the tab signs out.

const KEY = "nzila.estudio";

export const token = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: (value: string | null): void => {
    try {
      if (value) sessionStorage.setItem(KEY, value);
      else sessionStorage.removeItem(KEY);
    } catch {
      // No storage: the session lasts until the page is left.
    }
  },
};

export interface Answer<T> {
  readonly status: number;
  readonly data: T | null;
  /** The one word of a refusal: "wrong", "forbidden", "not_found", "invalid", "slow_down", or "offline" when nothing answered. */
  readonly error: string | null;
}

export async function ask<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<Answer<T>> {
  const kept = token.get();
  try {
    const response = await fetch(`/api${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(kept ? { authorization: `Bearer ${kept}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12_000),
    });
    const json = response.headers.get("content-type")?.includes("json") ? ((await response.json()) as T & { error?: string }) : null;
    return { status: response.status, data: response.ok ? json : null, error: response.ok ? null : (json?.error ?? "failed") };
  } catch {
    return { status: 0, data: null, error: "offline" };
  }
}

export interface Me {
  readonly name: string;
  readonly email: string;
  readonly roles: readonly string[];
}

export interface Report {
  readonly id: number;
  readonly at: string;
  readonly reason: string;
  readonly note: string | null;
  readonly lines: readonly { at: string; text: string; said: boolean }[];
  readonly reporter: { name: string | null; biNumber: string | null };
  readonly reported: { name: string | null; biNumber: string | null };
  readonly against: number;
}

export interface Player {
  readonly name: string | null;
  readonly biNumber: string | null;
  readonly kind: string;
  readonly status: string;
  readonly ageBand: string | null;
  readonly arrivedAt: string;
  readonly bairro: string | null;
  readonly districtId: string | null;
  readonly sanctions: readonly { id: number; at: string; kind: string; reason: string; until: string | null; by: string; lifted: boolean; standing: boolean }[];
  readonly reportsAgainst: number;
  readonly reportsMade: number;
  readonly lines: readonly { at: string; text: string; said: boolean; districtId: string; channel: number }[];
  readonly now: { room: string; channel: number } | null;
}

export interface Zone {
  readonly id: string;
  readonly rooms: readonly {
    name: string;
    channels: readonly { number: number; players: number; meanMs: number | null; worstMs: number | null; who: readonly { name: string | null; biNumber: string | null }[] }[];
  }[];
}

export interface Entry {
  readonly at: string;
  readonly by: string;
  readonly kind: string;
  readonly subject: string;
  readonly reason: string;
}
