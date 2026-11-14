// The data meter. Megabytes are money (Rule 2): the game counts every byte it
// downloads and tells the player, this session and this month. Everything the
// world streams goes through `meteredFetch`, so nothing is downloaded that
// the meter does not see.
//
// It counts what the network really carried: a file answered from the
// browser's own store (and later from the service worker's, Task 1.8) costs
// nothing, and is counted as nothing.

type Listener = () => void;

const MONTH_KEY = "nzila.data";

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function readMonth(): number {
  try {
    const stored = JSON.parse(localStorage.getItem(MONTH_KEY) ?? "null") as { month?: string; bytes?: number } | null;
    return stored?.month === thisMonth() && typeof stored.bytes === "number" ? stored.bytes : 0;
  } catch {
    return 0;
  }
}

class DataMeter {
  private sessionBytes = 0;
  private monthBytes = readMonth();
  private readonly listeners = new Set<Listener>();

  /** Bytes downloaded since the page was opened. */
  get session(): number {
    return this.sessionBytes;
  }

  /** Bytes downloaded this calendar month on this device, this session included. */
  get month(): number {
    return this.monthBytes;
  }

  add(bytes: number): void {
    if (!(bytes > 0)) return;
    this.sessionBytes += bytes;
    this.monthBytes += bytes;
    try {
      localStorage.setItem(MONTH_KEY, JSON.stringify({ month: thisMonth(), bytes: this.monthBytes }));
    } catch {
      // Storage is off: the month's count lasts for this visit only.
    }
    for (const listener of this.listeners) listener();
  }

  /** Calls `listener` whenever the count changes. Returns the way to stop. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const dataMeter = new DataMeter();

/** What a download cost on the network, from the browser's own record of it, or null when it kept none. */
function carried(url: string): number | null {
  const entries = performance.getEntriesByName(new URL(url, location.href).href, "resource") as PerformanceResourceTiming[];
  const entry = entries[entries.length - 1];
  if (!entry) return null;
  // Zero with a body means it came from a cache: it cost nothing.
  return entry.transferSize;
}

/** Downloads a file and counts it. Throws when the server does not have it. */
export async function meteredFetch(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const body = await response.arrayBuffer();
  const cost = carried(url);
  // Without the browser's record, the length the server declared; without that, the size of what arrived.
  dataMeter.add(cost ?? (Number(response.headers.get("content-length")) || body.byteLength));
  return body;
}
