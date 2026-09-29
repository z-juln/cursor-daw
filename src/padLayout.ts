/** Pad 音高键：三排 × 七白键，跨三个八度。 */

const DEGREE_NAMES = ["C", "D", "E", "F", "G", "A", "B"] as const;
/** C 大调音级（半音偏移） */
const DEGREES = [0, 2, 4, 5, 7, 9, 11] as const;

interface PitchKeyDef {
  key: string;
  /** 相对基准八度的八度偏移：0 低 / 1 中 / 2 高 */
  octaveBump: number;
  degreeIndex: number;
}

/** 低排 zxcvbnm → 中排 asdfghj → 高排 qwertyu */
export const PITCH_PAD_KEYS: PitchKeyDef[] = [
  ..."zxcvbnm".split("").map((key, degreeIndex) => ({ key, octaveBump: 0, degreeIndex })),
  ..."asdfghj".split("").map((key, degreeIndex) => ({ key, octaveBump: 1, degreeIndex })),
  ..."qwertyu".split("").map((key, degreeIndex) => ({ key, octaveBump: 2, degreeIndex })),
];

export const PITCH_PAD_KEY_LIST = PITCH_PAD_KEYS.map((item) => item.key);

export function resolvePitchPad(
  key: string,
  baseOctave: number,
): { midi: number; label: string } | undefined {
  const def = PITCH_PAD_KEYS.find((item) => item.key === key);
  if (!def) return undefined;
  const octave = baseOctave + def.octaveBump;
  const midi = (octave + 1) * 12 + DEGREES[def.degreeIndex];
  return { midi, label: `${DEGREE_NAMES[def.degreeIndex]}${octave}` };
}

export function pitchPadRows(baseOctave: number): {
  title: string;
  keys: { key: string; label: string }[];
}[] {
  return [0, 1, 2].map((bump) => {
    const keys = PITCH_PAD_KEYS.filter((item) => item.octaveBump === bump).map((item) => {
      const resolved = resolvePitchPad(item.key, baseOctave)!;
      return { key: item.key, label: resolved.label };
    });
    const lo = keys[0]?.label ?? "";
    const hi = keys[keys.length - 1]?.label ?? "";
    const title = bump === 0 ? `低音 ${lo}–${hi}` : bump === 1 ? `中音 ${lo}–${hi}` : `高音 ${lo}–${hi}`;
    return { title, keys };
  });
}
