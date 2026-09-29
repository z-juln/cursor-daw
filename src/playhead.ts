import { cellColumns } from "./mapper";
import { stepDurationSec } from "./schedule";
import { Session } from "./types";

export interface PlayheadCell {
  line: number;
  character: number;
}

export interface PlayheadIndex {
  stepSec: number;
  maxLen: number;
  rows: { line: number; columns: number[] }[];
}

/** 加载谱面后预计算各行格子列，避免播放中反复扫行文本。 */
export function buildPlayheadIndex(
  session: Session,
  getLineText: (lineIndex: number) => string | undefined,
): PlayheadIndex {
  const stepSec = stepDurationSec(session);
  const maxLen = session.tracks.reduce(
    (max, track) => Math.max(max, ...track.rows.map((row) => row.cells.length), 0),
    0,
  );
  const rows: PlayheadIndex["rows"] = [];
  for (const track of session.tracks) {
    for (const row of track.rows) {
      const text = getLineText(row.lineIndex);
      if (text === undefined) continue;
      rows.push({ line: row.lineIndex, columns: cellColumns(text) });
    }
  }
  return { stepSec, maxLen, rows };
}

export function playheadStep(index: PlayheadIndex, positionSec: number): number {
  if (!(index.stepSec > 0) || index.maxLen <= 0) return 0;
  let step = Math.floor(positionSec / index.stepSec);
  return ((step % index.maxLen) + index.maxLen) % index.maxLen;
}

/** 从预计算索引取进度格；可只取可见行范围。 */
export function playheadCellsFromIndex(
  index: PlayheadIndex,
  positionSec: number,
  visible?: { startLine: number; endLine: number },
): PlayheadCell[] {
  if (!(index.stepSec > 0) || index.maxLen <= 0) return [];
  const step = playheadStep(index, positionSec);
  const cells: PlayheadCell[] = [];
  for (const row of index.rows) {
    if (
      visible
      && (row.line < visible.startLine || row.line > visible.endLine)
    ) {
      continue;
    }
    if (row.columns.length === 0) continue;
    const character = row.columns[Math.min(step, row.columns.length - 1)] ?? row.columns[0];
    cells.push({ line: row.line, character });
  }
  return cells;
}

/** 各音高行同一 step 上的格子坐标（装饰用，不改文本）。 */
export function playheadCells(
  session: Session,
  getLineText: (lineIndex: number) => string | undefined,
  positionSec: number,
): PlayheadCell[] {
  return playheadCellsFromIndex(buildPlayheadIndex(session, getLineText), positionSec);
}
