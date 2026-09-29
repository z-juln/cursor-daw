import { BUILTIN_ORDER, ID_WIDTH } from "./drums";
import { parseSession } from "./parser";
import { CellKind, DawTrack, Session, TrackRole } from "./types";

const toChar = (cell: CellKind): string =>
  ({ rest: ".", hit: "x", accent: "X", ghost: "o", hold: "=" })[cell];

function formatCells(cells: CellKind[], stepsPerBar: number): string {
  if (cells.length === 0) return "|";
  let result = "";
  cells.forEach((cell, index) => {
    if (index % stepsPerBar === 0) result += "|";
    result += toChar(cell);
  });
  return `${result}|`;
}

function formatRow(id: string, cells: CellKind[], stepsPerBar: number): string {
  return `${id.padEnd(ID_WIDTH)} ${formatCells(cells, stepsPerBar)}`;
}

export interface EmptyTemplateOptions {
  bpm?: number;
  bars?: number;
}

const TEMPLATE_TRACKS: { name: string; role: TrackRole; plugin: string }[] = [
  { name: "drums", role: "drums", plugin: "drum.gm" },
  { name: "piano", role: "keys", plugin: "keys.gm" },
  { name: "guitar", role: "guitar", plugin: "gtr.gm" },
  { name: "bass", role: "bass", plugin: "bass.gm" },
];

export function emptyTemplate(options: EmptyTemplateOptions = {}): string {
  const bpm = Number.isFinite(options.bpm) ? Math.round(options.bpm!) : 120;
  const bars = Number.isInteger(options.bars) && options.bars! > 0 ? options.bars! : 2;
  const rests: CellKind[] = Array(bars * 16).fill("rest");
  const lines = [
    "# cursor-daw 1",
    `bpm: ${bpm}`,
    "meter: 4/4",
    "steps: 16",
    "swing: 0",
    "",
  ];
  for (const track of TEMPLATE_TRACKS) {
    lines.push(`track ${track.name}`);
    lines.push(`role: ${track.role}`);
    lines.push(`plugin: ${track.plugin}`);
    if (track.role === "drums") {
      for (const drumId of BUILTIN_ORDER) {
        lines.push(formatRow(drumId, rests, 16));
      }
    } else {
      const seed = track.role === "bass" ? "E2" : track.role === "guitar" ? "E3" : "C4";
      lines.push(formatRow(seed, rests, 16));
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function formatSessionText(session: Session): string {
  const lines = [
    "# cursor-daw 1",
    `bpm: ${session.bpm}`,
    `meter: ${session.meter}`,
    `steps: ${session.stepsPerBar}`,
    `swing: ${session.swing}`,
    "",
  ];
  for (const track of session.tracks) {
    lines.push(`track ${track.name}`);
    lines.push(`role: ${track.role}`);
    lines.push(`plugin: ${track.plugin}`);
    if (track.program !== undefined) lines.push(`program: ${track.program}`);
    if (track.channel !== undefined) lines.push(`channel: ${track.channel + 1}`);
    for (const row of track.rows) {
      lines.push(formatRow(row.id, row.cells, session.stepsPerBar));
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Format arbitrary text by parse → serialize. */
export function formatScoreText(text: string): string {
  return formatSessionText(parseSession(text));
}

export function formatTrack(track: DawTrack, stepsPerBar: number): string {
  return track.rows.map((row) => formatRow(row.id, row.cells, stepsPerBar)).join("\n");
}
