import { BUILTIN_ORDER, canonicalDrumId, ID_WIDTH } from "./drums";
import { DEFAULT_KIT_ID } from "./kits/registry";
import { parseScore } from "./parser";
import { HitKind, Track } from "./types";

const TRACK_RE = /^([A-Za-z][A-Za-z0-9_-]{0,15})(?:\s+|\s*(?=\|))(.*)$/;

const toChar = (cell: HitKind): string =>
  ({ rest: ".", hit: "x", accent: "X", ghost: "o" })[cell];

function formatCells(cells: HitKind[], stepsPerBar: number): string {
  if (cells.length === 0) return "|";
  let result = "";
  cells.forEach((cell, index) => {
    if (index % stepsPerBar === 0) result += "|";
    result += toChar(cell);
  });
  return `${result}|`;
}

function formatTrack(track: Pick<Track, "id" | "cells">, stepsPerBar: number): string {
  return `${track.id.padEnd(ID_WIDTH)} ${formatCells(track.cells, stepsPerBar)}`;
}

export interface EmptyTemplateOptions {
  bpm?: number;
  bars?: number;
  kit?: string;
}

export function emptyTemplate(options: EmptyTemplateOptions = {}): string {
  const bpm = Number.isFinite(options.bpm) ? Math.round(options.bpm!) : 120;
  const bars = Number.isInteger(options.bars) && options.bars! > 0
    ? options.bars!
    : 2;
  const rests: HitKind[] = Array(bars * 16).fill("rest");
  const labels = Array.from({ length: bars }, (_, index) =>
    String(index + 1).padEnd(16, " ")).join("");
  const kit = options.kit?.trim() || DEFAULT_KIT_ID;
  return [
    "# cursor-drum 1",
    `bpm: ${bpm}`,
    "meter: 4/4",
    "steps: 16",
    "swing: 0",
    `kit: ${kit}`,
    "",
    `#        ${labels.trimEnd()}`,
    `#        ${"1e&a2e&a3e&a4e&a".repeat(bars)}`,
    ...BUILTIN_ORDER.map((id) => formatTrack({ id, cells: rests }, 16)),
    "",
  ].join("\n");
}

function findCellColumns(line: string): number[] {
  const match = line.match(TRACK_RE);
  if (!match) return [];
  const payloadStart = line.length - match[2].length;
  const columns: number[] = [];
  for (let column = payloadStart; column < line.length; column += 1) {
    if (line[column] !== "|") columns.push(column);
  }
  return columns;
}

export function writeHit(text: string, drumId: string, stepIndex: number): string {
  let source = text.trim() ? text : emptyTemplate();
  const score = parseScore(source);
  const requested = canonicalDrumId(drumId) ?? drumId.toLowerCase();
  const lines = source.split("\n");
  let targetLine = -1;

  lines.forEach((line, lineIndex) => {
    const match = line.match(TRACK_RE);
    if (!match) return;
    const canonical = canonicalDrumId(match[1]) ?? match[1].toLowerCase();
    if (canonical === requested) targetLine = lineIndex;
  });

  if (targetLine < 0) {
    const length = score.tracks.length > 0
      ? Math.max(...score.tracks.map((track) => track.cells.length))
      : 32;
    const cells: HitKind[] = Array(length).fill("rest");
    const id = canonicalDrumId(drumId) ?? drumId.toLowerCase();
    lines.push(formatTrack({ id, cells }, score.stepsPerBar));
    targetLine = lines.length - 1;
  }

  let columns = findCellColumns(lines[targetLine]);
  if (stepIndex >= columns.length) {
    const match = lines[targetLine].match(TRACK_RE);
    const id = match?.[1] ?? drumId;
    const existing = parseScore(`${lines[targetLine]}\n`).tracks[0]?.cells ?? [];
    while (existing.length <= stepIndex) existing.push("rest");
    lines[targetLine] = formatTrack({ id, cells: existing }, score.stepsPerBar);
    columns = findCellColumns(lines[targetLine]);
  }

  const column = columns[Math.max(0, stepIndex)];
  if (column !== undefined && !/[xXo*]/.test(lines[targetLine][column])) {
    lines[targetLine] =
      `${lines[targetLine].slice(0, column)}x${lines[targetLine].slice(column + 1)}`;
  }
  return lines.join("\n");
}

export function formatScoreText(text: string): string {
  const score = parseScore(text);
  const tracksByLine = new Map(score.tracks.map((track) => [track.lineIndex, track]));
  const knownTrackLines = new Set<number>();
  text.split("\n").forEach((line, index) => {
    if (line.match(TRACK_RE) && !line.match(/^[A-Za-z][A-Za-z0-9_-]*\s*:/)) {
      knownTrackLines.add(index);
    }
  });
  const output = text.split("\n").flatMap((line, index) => {
    const track = tracksByLine.get(index);
    if (track) return [formatTrack(track, score.stepsPerBar)];
    return knownTrackLines.has(index) ? [] : [line];
  });
  return output.join("\n");
}

export function upsertRuler(text: string): string {
  const score = parseScore(text);
  const lines = text.split("\n");
  const firstTrackLine = score.tracks.reduce(
    (min, track) => Math.min(min, track.lineIndex),
    Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(firstTrackLine)) return text;

  const bars = Math.max(
    1,
    Math.ceil(Math.max(...score.tracks.map((track) => track.cells.length)) / score.stepsPerBar),
  );
  const label = Array.from({ length: bars }, (_, index) =>
    String(index + 1).padEnd(score.stepsPerBar, " ")).join("");
  const subdivision = score.stepsPerBar === 16
    ? "1e&a2e&a3e&a4e&a".repeat(bars)
    : Array.from({ length: bars * score.stepsPerBar }, (_, index) =>
        String((index % score.stepsPerBar) + 1).slice(-1)).join("");
  const ruler = [`#        ${label}`, `#        ${subdivision}`];
  lines.splice(firstTrackLine, 0, ...ruler);
  return lines.join("\n");
}
