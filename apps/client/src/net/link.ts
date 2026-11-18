// The line to the zone (Task 3.3): a plain WebSocket carrying our own bytes
// (packages/protocol), with nothing else between. The matchmaker (the API)
// has said which zone and given a ticket for a seat; the first thing said on
// the line is that ticket and what this client speaks, and the zone answers
// with a place in the channel, or with why not.
//
// A line that cannot be opened, or that drops, leaves the player in their own
// street, alone: the game never stops for want of a network (Rule 2). Coming
// back by itself is Task 3.4.

import { type TrafficSaid, PROTOCOL_VERSION, ZONE_CLOSE, decodeSnapshot, decodeZoneMessage, encodeChatSend, encodeChatTyping, encodeEmote, encodeInput, encodeJoin, type JoinAccepted, type Snapshot, type Who, type WorldEvent } from "@nzila/protocol";
import { type PlaySeat } from "../world/account.ts";
import { Conditioner, LateLine, askedLine } from "./conditioner.ts";
import { dataMeter } from "./data-meter.ts";
import { type Sent } from "./predict.ts";

/** Snapshots remembered, to read the next difference from: the zone remembers as many. */
const REMEMBERED = 32;
/** How long the zone is waited for before the player is let walk alone. */
const PATIENCE_MS = 8000;
/**
 * The zone speaks ten times a second. A line that has said nothing for this long has fallen, whatever the browser
 * believes: in a tunnel a socket can go on looking open for a minute (finding F-172). It is closed and picked up again.
 */
export const SILENCE_MS = 3500;

export interface LinkEvents {
  snapshot(snapshot: Snapshot): void;
  who(who: Who): void;
  /** Someone spoke: with their words, or without when they are too far to read. */
  heard(from: number, text: string): void;
  typing(from: number, typing: boolean): void;
  /** Something a snapshot does not carry: a gesture, that talk is open here, that a line was not said. */
  event(event: WorldEvent): void;
  /** How the street's traffic is waiting, as the zone decided it for everyone in the channel. */
  traffic?(said: TrafficSaid): void;
  /** The line is gone. `elsewhere` when the same player came in on another phone; `put_out` when staff put them out. */
  closed(why: "dropped" | "elsewhere" | "put_out"): void;
}

export interface Link {
  readonly accepted: JoinAccepted;
  /** Sends the stick: the frames just walked. */
  send(sent: Sent): void;
  /** Says a line to whoever is near; `messageId` so that one sent twice is said once. */
  say(messageId: number, text: string): void;
  /** Says that this player has begun, or stopped, typing. */
  typing(on: boolean): void;
  /** Makes a gesture, by its number (EMOTE_NAMES). */
  gesture(emote: number): void;
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
    const up = weak ? new LateLine(new Conditioner(weak.roundTripMs / 2, weak.lossPercent)) : null;
    const down = weak ? new LateLine(new Conditioner(weak.roundTripMs / 2, weak.lossPercent)) : null;
    const had = new Map<number, Snapshot>();
    let ackTick = 0;
    let accepted: JoinAccepted | null = null;
    /** Closed by this end on purpose: nobody is told. And whether the page has already been told the line is gone. */
    let let_go = false;
    let told = false;
    let lastHeard = performance.now();
    /** The line is gone without a goodbye: said once, however it was found out. */
    const fallen = (why: "dropped" | "elsewhere" | "put_out"): void => {
      if (told || let_go) return;
      told = true;
      clearInterval(listening);
      events.closed(why);
    };
    const listening = setInterval(() => {
      if (!accepted || performance.now() - lastHeard < SILENCE_MS) return;
      // Silence. Closed without a reason, as a fall is, and the page is told at once: the socket's own word may be long in coming.
      socket.close();
      fallen("dropped");
    }, 500);
    const patience = setTimeout(() => {
      if (!accepted) socket.close();
    }, PATIENCE_MS);

    socket.onopen = () => socket.send(encodeJoin({ protocolVersion: PROTOCOL_VERSION, token }) as BufferSource);
    socket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      lastHeard = performance.now();
      if (!down) return heard(event.data);
      down.give(() => heard(event.data));
    };
    /** Everything this end says goes up the same way: at once, or late on a line made weak on purpose. */
    const post = (message: Uint8Array): void => {
      const bytes = message as BufferSource;
      const go = (): void => {
        if (socket.readyState === WebSocket.OPEN) socket.send(bytes);
      };
      if (!up) return go();
      up.give(go);
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
            send: (sent) => post(encodeInput({ seq: sent.seq, ackTick, frames: sent.frames })),
            say: (messageId, text) => post(encodeChatSend({ messageId, text })),
            typing: (on) => post(encodeChatTyping({ from: 0, typing: on })),
            gesture: (emote) => post(encodeEmote({ emote })),
            close: () => {
              let_go = true;
              clearInterval(listening);
              // Leaving on purpose is said: a line that closes without a word is taken for one that fell, and its place is kept.
              socket.close(1000);
            },
            // Closed with no reason given, which is how the zone knows a fallen line from a goodbye. The page is told
            // at once: with no network the socket's own closing can take as long as it likes.
            fall: () => {
              socket.close();
              fallen("dropped");
            },
          });
        } else if (message.type === "traffic") {
          events.traffic?.(message);
        } else if (message.type === "who") {
          events.who(message);
        } else if (message.type === "chat_heard") {
          events.heard(message.from, message.text);
        } else if (message.type === "chat_typing") {
          events.typing(message.from, message.typing);
        } else if (message.type === "event") {
          events.event(message);
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
      clearInterval(listening);
      if (!accepted) return done(null);
      fallen(event.code === ZONE_CLOSE.ELSEWHERE ? "elsewhere" : event.code === ZONE_CLOSE.PUT_OUT ? "put_out" : "dropped");
    };
  });
}
