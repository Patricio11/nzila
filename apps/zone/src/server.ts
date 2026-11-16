// The zone as a process that listens: one district, as many channels of it
// as there are people to fill them.

import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { roomNameOf } from "./district.ts";
import { channelRoom, type ZoneDeps } from "./room.ts";

export interface Zone {
  /** The name a client asks for to be put in a channel of this district. */
  readonly roomName: string;
  readonly port: number;
  close(): Promise<void>;
}

export async function startZone(deps: ZoneDeps, port: number): Promise<Zone> {
  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  const roomName = roomNameOf(deps.district.id);
  server.define(roomName, channelRoom(deps));
  await server.listen(port, "0.0.0.0");
  // Everyone still in is written down on the way out (each room's onLeave), then the port is given back.
  return { roomName, port, close: () => server.gracefullyShutdown(false) };
}
