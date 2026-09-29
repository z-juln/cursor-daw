import { TrackRole } from "../types";

export const DEFAULT_PROGRAM: Record<TrackRole, number> = {
  drums: 0,
  keys: 0,
  guitar: 24,
  bass: 32,
};

/** 0-based MIDI channels; drums use channel 10 → index 9. */
export const DEFAULT_CHANNEL: Record<TrackRole, number> = {
  drums: 9,
  keys: 0,
  guitar: 1,
  bass: 2,
};

export const DRUM_TO_GM: Record<string, number> = {
  kick: 36,
  snare: 38,
  ch: 42,
  oh: 46,
  clap: 39,
  tom1: 50,
  tom2: 47,
  tom3: 45,
  crash: 49,
  ride: 51,
};

export const GM_TO_DRUM: Record<number, string> = Object.fromEntries(
  Object.entries(DRUM_TO_GM).map(([id, note]) => [note, id]),
);

export function roleFromProgram(program: number, channel: number): TrackRole {
  if (channel === 9) return "drums";
  if (program >= 32 && program <= 39) return "bass";
  if (program >= 24 && program <= 31) return "guitar";
  return "keys";
}
