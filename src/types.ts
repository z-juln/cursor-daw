export type DrumId =
  | "kick" | "snare" | "ch" | "oh" | "clap"
  | "tom1" | "tom2" | "tom3" | "crash" | "ride";

export type TrackRole = "drums" | "keys" | "guitar" | "bass";

export type CellKind = "rest" | "hit" | "accent" | "ghost" | "hold";

export interface ParseWarning {
  message: string;
  line?: number;
}

export interface GridRow {
  id: string;
  cells: CellKind[];
  lineIndex: number;
}

export interface DawTrack {
  name: string;
  role: TrackRole;
  plugin: string;
  program?: number;
  channel?: number;
  rows: GridRow[];
}

export interface Session {
  bpm: number;
  meter: string;
  stepsPerBar: number;
  swing: number;
  tracks: DawTrack[];
  warnings: ParseWarning[];
  unsupportedVersion: boolean;
}

export interface TimedNote {
  trackName: string;
  role: TrackRole;
  note: number;
  velocity: number;
  timeSec: number;
  durationSec: number;
  channel: number;
  program: number;
}

export type TransportStatus = "stopped" | "playing" | "paused";

/** @deprecated Prefer Session; kept temporarily for migration of leftover imports. */
export type HitKind = CellKind;
export type Track = GridRow & { canonicalId?: DrumId | null };
export type Score = Session & { kit?: string };
export type ScheduledNote = TimedNote;
