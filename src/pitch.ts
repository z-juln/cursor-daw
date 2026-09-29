const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const ENHARMONIC: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, FB: 4, "E#": 5,
  F: 5, "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11, CB: 11, "B#": 0,
};

/** Convert pitch name like C4 / F#3 / Bb2 to MIDI note number. */
export function pitchToMidi(raw: string): number | null {
  const match = raw.trim().match(/^([A-Ga-g])([#bB]?)(-?\d+)$/);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = match[2] === "#" ? "#" : match[2] ? "B" : "";
  const octave = Number(match[3]);
  const key = `${letter}${accidental}`;
  const pc = ENHARMONIC[key];
  if (pc === undefined || !Number.isInteger(octave)) return null;
  return (octave + 1) * 12 + pc;
}

/** Convert MIDI note number to pitch name with sharps (C4 = 60). */
export function midiToPitch(note: number): string {
  const n = Math.max(0, Math.min(127, Math.round(note)));
  const pc = n % 12;
  const octave = Math.floor(n / 12) - 1;
  return `${NAMES[pc]}${octave}`;
}
