import { Session } from "../types";
import { cellToChar } from "../velocity";

export interface GridRowView {
  id: string;
  cells: string[];
}

export interface GridSessionView {
  trackName: string;
  trackNames: string[];
  bpm: number;
  meter: string;
  stepsPerBar: number;
  swing: number;
  rows: GridRowView[];
  warnings: { message: string; line?: number }[];
  unsupportedVersion: boolean;
}

export function sessionToView(session: Session, trackName?: string): GridSessionView {
  const trackNames = session.tracks.map((track) => track.name);
  const track = (trackName
    ? session.tracks.find((item) => item.name === trackName)
    : undefined) ?? session.tracks[0];
  const resolvedName = track?.name ?? trackName ?? "";
  return {
    trackName: resolvedName,
    trackNames,
    bpm: session.bpm,
    meter: session.meter,
    stepsPerBar: session.stepsPerBar,
    swing: session.swing,
    rows: (track?.rows ?? []).map((row) => ({
      id: row.id,
      cells: row.cells.map((cell) => cellToChar(cell)),
    })),
    warnings: session.warnings.map((warning) => ({
      message: warning.message,
      line: warning.line,
    })),
    unsupportedVersion: session.unsupportedVersion,
  };
}

export function applyHeaderFields(
  session: Session,
  fields: Partial<{ bpm: number; meter: string; stepsPerBar: number; swing: number }>,
): Session {
  return {
    ...session,
    bpm: fields.bpm ?? session.bpm,
    meter: fields.meter ?? session.meter,
    stepsPerBar: fields.stepsPerBar ?? session.stepsPerBar,
    swing: fields.swing ?? session.swing,
  };
}
