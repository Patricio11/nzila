// The line to the zone (Task 3.3): a plain WebSocket carrying our own bytes
// (packages/protocol), with nothing else between. The matchmaker (the API)
// has said which zone and given a ticket for a seat; the first thing said on
// the line is that ticket and what this client speaks, and the zone answers
// with a place in the channel, or with why not.
//
// A line that cannot be opened, or that drops, leaves the player in their own
// street, alone: the game never stops for want of a network (Rule 2). Coming
// back by itself is Task 3.4.

import { PROTOCOL_VERSION, ZONE_CLOSE, decodeSnapshot, decodeZoneMessage, encodeInput, encodeJoin, type JoinAccepted, type Snapshot, type Who } from "@nzila/protocol";
import { type PlaySeat } from "../world/account.ts";
import { Conditioner, askedLine } from "./conditioner.ts";
import { dataMeter } from "./data-meter.ts";
import { type Sent } from "./predict.ts";

/** Snapshots remembered, to read the next difference from: the zone remembers as many. */
const REMEMBERED = 32;
/** How long the zone is waited for before the player is let walk alone. */
const PATIENCE_MS = 8000;

export interface LinkEvents {
  snapshot(snapshot: Snapshot): void;
  who(who: Who): void;
  /** The line is gone. `elsewhere` when the same player came in on another phone. */
  closed(why: "dropped" | "elsewhere"): void;
}

export interface Link {
  readonly accepted: JoinAccepted;
  /** Sends the stick: the frames just walked. */
  send(sent: Sent): void;
  /** Leaves on purpose, and says so. */
  close(): void;
  /** For the tests and a developer: the line goes without a word, as in a tunnel. The zone keeps the place. */
  fall(): void;
}

/** Where a zone is reached: the address the matchmaker gave, or `/zone` on the game's own when it gave none. */
function endpoint(address: string): string {
  return address.length > 0 ? address.replace(/\/$/, "") : `${location.origin.replace(/^http/, "ws")}/zone`;
}

/**
 * Opens the line to the seat the matchmaker reserved; `paragem` when the player has just got off a van there, and
 * arrives beside it. Resolves to null when the zone cannot be had: no network, the zone gone, the seat too old or
 * the channel full by now, a client too old.
 */
export function openLink(seat: PlaySeat, paragem: string | undefined, events: LinkEvents): Promise<Link | null> {
  const token = seat.seat;
  return new Promise((done) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${endpoint(seat.address)}/${encodeURIComponent(seat.room)}${paragem ? `?paragem=${encodeURIComponent(paragem)}` : ""}`);
    } catch {
      return done(null);
    }
    socket.binaryType = "arraybuffer";
    // `&rede=250,5` in the address: a weak line on purpose, half its round trip each way (conditioner.ts).
    const weak = askedLine(location.search);
    const up = weak ? new Conditioner(weak.roundTripMs / 2, weak.lossPercent) : null;
    const down = weak ? new Conditioner(weak.roundTripMs / 2, weak.lossPercent) : null;
    const had = new Map<number, Snapshot>();
    let ackTick = 0;
    let accepted: JoinAccepted | null = null;
    /** Closed by this end on purpose: nobody is told. */
    let let_go = false;
    const patience = setTimeout(() => {
      if (!accepted) socket.close();
    }, PATIENCE_MS);

    socket.onopen = () => socket.send(encodeJoin({ protocolVersion: PROTOCOL_VERSION, token }) as BufferSource);
    socket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (!down) return heard(event.data);
      const now = performance.now();
      setTimeout(() => heard(event.data), down.due(now) - now);
    };
    const heard = (data: ArrayBuffer): void => {
      const bytes = new Uint8Array(data);
      // Megabytes are money: what the zone says is counted like everything else that comes down.
      dataMeter.add(bytes.length);
      try {
        const message = decodeZoneMessage(bytes);
        if (message.type === "join_accepted") {
          accepted = message;
          clearTimeout(patience);
          done({
            accepted,
            send: (sent) => {
              const bytes = encodeInput({ seq: sent.seq, ackTick, frames: sent.frames }) as BufferSource;
              const go = (): void => {
                if (socket.readyState === WebSocket.OPEN) socket.send(bytes);
              };
              if (!up) return go();
              const now = performance.now();
              setTimeout(go, up.due(now) - now);
            },
            close: () => {
              let_go = true;
              // Leaving on purpose is said: a line that closes without a word is taken for one that fell, and its place is kept.
              socket.close(1000);
            },
            // Closed with no reason given, which is how the zone knows a fallen line from a goodbye.
            fall: () => socket.close(),
          });
        } else if (message.type === "who") {
          events.who(message);
        } else if (message.type === "snapshot") {
          const snapshot = decodeSnapshot(bytes, (tick) => had.get(tick));
          had.set(snapshot.tick, snapshot);
          ackTick = snapshot.tick;
          for (const tick of had.keys()) {
            if (had.size <= REMEMBERED) break;
            had.delete(tick);
          }
          events.snapshot(snapshot);
        }
        // Refused: the zone closes the line itself, and the close below says the rest.
      } catch {
        // A message that cannot be read is skipped; saying "I have nothing" brings the next snapshot whole.
        ackTick = 0;
      }
    };
    socket.onclose = (event: CloseEvent) => {
      clearTimeout(patience);
      if (!accepted) return done(null);
      if (!let_go) events.closed(event.code === ZONE_CLOSE.ELSEWHERE ? "elsewhere" : "dropped");
    };
  });
}
