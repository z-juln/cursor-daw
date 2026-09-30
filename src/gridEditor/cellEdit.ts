import { CellKind, Session } from "../types";

const DEFAULT_HIT: CellKind = "6";
const SHIFT_CYCLE: CellKind[] = ["4", "6", "8", "rest"];

export function nextCellOnClick(cell: CellKind, shift: boolean): CellKind {
  if (shift) {
    if (cell === "rest" || cell === "hold") return "4";
    const idx = SHIFT_CYCLE.indexOf(cell);
    if (idx >= 0) return SHIFT_CYCLE[(idx + 1) % SHIFT_CYCLE.length];
    return "4";
  }
  if (cell === "hold") return "rest";
  if (cell === "rest") return DEFAULT_HIT;
  return "rest";
}

export function applyCellEdit(
  session: Session,
  trackName: string,
  rowId: string,
  stepIndex: number,
  shift: boolean,
): Session {
  const tracks = session.tracks.map((track) => {
    if (track.name !== trackName) return track;
    const rows = track.rows.map((row) => {
      if (row.id.toLowerCase() !== rowId.toLowerCase()) return row;
      const cells = row.cells.slice();
      while (cells.length <= stepIndex) cells.push("rest");
      cells[stepIndex] = nextCellOnClick(cells[stepIndex], shift);
      return { ...row, cells };
    });
    return { ...track, rows };
  });
  return { ...session, tracks };
}
