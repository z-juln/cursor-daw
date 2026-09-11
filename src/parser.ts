import { canonicalDrumId } from "./drums";
import { DEFAULT_KIT_ID, normalizeKitId } from "./kits/registry";
import { HitKind, ParseWarning, Score, Track } from "./types";

const HEADER_RE = /^([A-Za-z][A-Za-z0-9_-]{0,15})\s*:\s*(.*)$/;
const TRACK_RE = /^([A-Za-z][A-Za-z0-9_-]{0,15})(?:\s+|\s*(?=\|))(.*)$/;

function cellKind(char: string, warnings: ParseWarning[], line: number): HitKind {
  if (char === "." || char === "-" || char === "·") return "rest";
  if (char === "x" || char === "*") return "hit";
  if (char === "X") return "accent";
  if (char === "o") return "ghost";
  warnings.push({ message: `未知格子字符 "${char}"，按休止处理`, line });
  return "rest";
}

function parseGrid(
  raw: string,
  stepsPerBar: number,
  warnings: ParseWarning[],
  line: number,
): HitKind[] {
  const hasBars = raw.includes("|");
  let bars = hasBars
    ? raw.split("|").filter((part, index, all) =>
        part.length > 0 || (index > 0 && index < all.length - 1))
    : [raw.trim()];

  if (!hasBars) {
    const chars = bars[0].split("");
    bars = [];
    for (let index = 0; index < chars.length; index += stepsPerBar) {
      bars.push(chars.slice(index, index + stepsPerBar).join(""));
    }
  }

  return bars.flatMap((bar) => {
    const chars = bar.split("");
    if (chars.length < stepsPerBar) {
      warnings.push({ message: `小节不足 ${stepsPerBar} 格，已补休止`, line });
    } else if (chars.length > stepsPerBar) {
      warnings.push({ message: `小节超过 ${stepsPerBar} 格，已截断`, line });
    }
    return chars
      .slice(0, stepsPerBar)
      .concat(Array(Math.max(0, stepsPerBar - chars.length)).fill("."))
      .map((char) => cellKind(char, warnings, line));
  });
}

export function parseScore(text: string): Score {
  let bpm = 120;
  let meter = "4/4";
  let stepsPerBar = 16;
  let swing = 0;
  let kit = DEFAULT_KIT_ID;
  let unsupportedVersion = false;
  let sawTrack = false;
  const warnings: ParseWarning[] = [];
  const tracks = new Map<string, Track>();

  text.split("\n").forEach((sourceLine, lineIndex) => {
    const line = sourceLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const header = !sawTrack ? line.match(HEADER_RE) : null;
    if (header) {
      const key = header[1].toLowerCase();
      const value = header[2].trim();
      if (key === "bpm") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) bpm = parsed;
        else warnings.push({ message: "bpm 无效，使用 120", line: lineIndex });
      } else if (key === "meter") {
        meter = value || "4/4";
      } else if (key === "steps") {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0) stepsPerBar = parsed;
        else warnings.push({ message: "steps 无效，使用 16", line: lineIndex });
      } else if (key === "swing") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) swing = Math.min(100, Math.max(0, parsed));
        else warnings.push({ message: "swing 无效，使用 0", line: lineIndex });
      } else if (key === "version") {
        unsupportedVersion = value !== "1";
      } else if (key === "kit") {
        const resolved = normalizeKitId(value || DEFAULT_KIT_ID);
        kit = resolved.kitId;
        if (resolved.fallback) {
          warnings.push({ message: `未知 kit "${value}"，使用 ${DEFAULT_KIT_ID}`, line: lineIndex });
        }
      } else {
        warnings.push({ message: `未知文件头 "${key}"`, line: lineIndex });
      }
      return;
    }

    const match = line.match(TRACK_RE);
    if (!match) {
      warnings.push({ message: "无法解析此行", line: lineIndex });
      return;
    }
    sawTrack = true;
    const id = match[1].toLowerCase();
    const track: Track = {
      id,
      canonicalId: canonicalDrumId(id),
      cells: parseGrid(
        match[2].trim(),
        stepsPerBar,
        warnings,
        lineIndex,
      ),
      lineIndex,
    };
    tracks.delete(id);
    tracks.set(id, track);
  });

  const result = [...tracks.values()];
  const maxLength = result.reduce((max, track) => Math.max(max, track.cells.length), 0);
  result.forEach((track) => {
    while (track.cells.length < maxLength) track.cells.push("rest");
  });

  return {
    bpm,
    meter,
    stepsPerBar,
    swing,
    kit,
    tracks: result,
    warnings,
    unsupportedVersion,
  };
}
