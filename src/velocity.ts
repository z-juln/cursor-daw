import { CellKind } from "./types";

/** Map grid cell → MIDI velocity (0 = not an onset). */
export function cellVelocity(cell: CellKind): number {
  if (cell === "rest" || cell === "hold") return 0;
  if (cell === "ghost") return 42;
  if (cell === "hit") return 84;
  if (cell === "accent") return 120;
  if (/^[1-9]$/.test(cell)) {
    return Math.round((Number(cell) * 127) / 9);
  }
  return 0;
}

/** Map MIDI velocity → preferred grid char (digits 1–9; aliases for round-trip). */
export function velocityToCell(velocity: number): CellKind {
  const v = Math.max(1, Math.min(127, Math.round(velocity)));
  const level = Math.max(1, Math.min(9, Math.round((v * 9) / 127)));
  return String(level) as CellKind;
}

export function cellToChar(cell: CellKind): string {
  if (cell === "rest") return ".";
  if (cell === "hit") return "x";
  if (cell === "accent") return "X";
  if (cell === "ghost") return "o";
  if (cell === "hold") return "=";
  return cell; // "1"–"9"
}

export function charToCell(char: string): CellKind | null {
  if (char === "." || char === "-" || char === "·") return "rest";
  if (char === "x" || char === "*") return "hit";
  if (char === "X") return "accent";
  if (char === "o") return "ghost";
  if (char === "=") return "hold";
  if (/^[1-9]$/.test(char)) return char as CellKind;
  return null;
}
