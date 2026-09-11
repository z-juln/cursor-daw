export type DrumId =
  | "kick" | "snare" | "ch" | "oh" | "clap"
  | "tom1" | "tom2" | "tom3" | "crash" | "ride";

export type HitKind = "rest" | "hit" | "accent" | "ghost";

export interface ParseWarning {
  message: string;
  line?: number;
}

export interface Track {
  id: string;
  canonicalId: DrumId | null;
  cells: HitKind[];
  lineIndex: number;
}

export interface Score {
  bpm: number;
  meter: string;
  stepsPerBar: number;
  swing: number;
  tracks: Track[];
  warnings: ParseWarning[];
  unsupportedVersion: boolean;
}

export interface ScheduledNote {
  timeSec: number;
  drumId: DrumId;
  velocity: number;
}

export type TransportStatus = "stopped" | "playing" | "paused";
