import { TransportStatus } from "./types";

export interface TransportEngine {
  status: TransportStatus;
  loop: boolean;
  anchorWallSec: number;
  anchorScoreSec: number;
}

export type TransportEvent =
  | { type: "play" }
  | { type: "pause" }
  | { type: "playPause" }
  | { type: "restart" }
  | { type: "stop" };

export function createTransport(options: { loop: boolean }): TransportEngine {
  return {
    status: "stopped",
    loop: options.loop,
    anchorWallSec: 0,
    anchorScoreSec: 0,
  };
}

export function positionAt(
  transport: TransportEngine,
  wallSec: number,
  durationSec = Number.POSITIVE_INFINITY,
): number {
  if (transport.status !== "playing") return transport.anchorScoreSec;
  const raw = transport.anchorScoreSec + wallSec - transport.anchorWallSec;
  if (transport.loop && Number.isFinite(durationSec) && durationSec > 0) {
    return ((raw % durationSec) + durationSec) % durationSec;
  }
  return Math.min(Math.max(0, raw), durationSec);
}

export function reduceTransport(
  transport: TransportEngine,
  event: TransportEvent,
  nowSec: number,
): TransportEngine {
  const type = event.type === "playPause"
    ? transport.status === "playing" ? "pause" : "play"
    : event.type;
  if (type === "play") {
    return {
      ...transport,
      status: "playing",
      anchorWallSec: nowSec,
    };
  }
  if (type === "pause") {
    return {
      ...transport,
      status: "paused",
      anchorScoreSec: positionAt(transport, nowSec),
      anchorWallSec: nowSec,
    };
  }
  if (type === "restart") {
    return {
      ...transport,
      status: "playing",
      anchorWallSec: nowSec,
      anchorScoreSec: 0,
    };
  }
  return {
    ...transport,
    status: "stopped",
    anchorWallSec: nowSec,
    anchorScoreSec: 0,
  };
}
