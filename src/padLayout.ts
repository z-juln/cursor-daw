import { midiToPitch } from "./pitch";

/** Pad 音高键：字母三排；钢琴另加数字排。Shift = 升半音。 */

/** C 大调音级（半音偏移） */
const DEGREES = [0, 2, 4, 5, 7, 9, 11] as const;

export interface PitchPadOptions {
  /** 钢琴：启用数字排 1234567（基准八度 +3） */
  numberRow?: boolean;
}

interface PitchKeyDef {
  key: string;
  /** 相对基准八度的八度偏移 */
  octaveBump: number;
  degreeIndex: number;
}

const ROW_TITLES = ["低音", "中音", "高音", "超高"] as const;

/** 低排 zxcvbnm → 中排 asdfghj → 高排 qwertyu */
export const PITCH_PAD_KEYS: PitchKeyDef[] = [
  ..."zxcvbnm".split("").map((key, degreeIndex) => ({ key, octaveBump: 0, degreeIndex })),
  ..."asdfghj".split("").map((key, degreeIndex) => ({ key, octaveBump: 1, degreeIndex })),
  ..."qwertyu".split("").map((key, degreeIndex) => ({ key, octaveBump: 2, degreeIndex })),
];

/** 钢琴数字排：1234567 → 基准 +3 八度 */
export const PITCH_PAD_NUMBER_KEYS: PitchKeyDef[] = [
  ..."1234567".split("").map((key, degreeIndex) => ({ key, octaveBump: 3, degreeIndex })),
];

export const PITCH_PAD_KEY_LIST = PITCH_PAD_KEYS.map((item) => item.key);

export function getPitchPadKeys(options?: PitchPadOptions): PitchKeyDef[] {
  return options?.numberRow ? [...PITCH_PAD_KEYS, ...PITCH_PAD_NUMBER_KEYS] : PITCH_PAD_KEYS;
}

/** 解析 pad 键：`g` / `1` 白键；`g#` / `1#` 表示 Shift 升半音。 */
export function resolvePitchPad(
  key: string,
  baseOctave: number,
  options?: PitchPadOptions,
): { midi: number; label: string } | undefined {
  const raw = String(key).trim().toLowerCase();
  const sharp = raw.endsWith("#") || raw.endsWith("+");
  const baseKey = raw.replace(/[#+]+$/g, "");
  const def = getPitchPadKeys(options).find((item) => item.key === baseKey);
  if (!def) return undefined;
  const octave = baseOctave + def.octaveBump;
  let midi = (octave + 1) * 12 + DEGREES[def.degreeIndex];
  if (sharp) midi += 1;
  if (midi < 0 || midi > 127) return undefined;
  return { midi, label: midiToPitch(midi) };
}

export function pitchPadRows(
  baseOctave: number,
  options?: PitchPadOptions,
): {
  title: string;
  keys: { key: string; label: string }[];
}[] {
  const defs = getPitchPadKeys(options);
  const bumps = [...new Set(defs.map((item) => item.octaveBump))].sort((a, b) => a - b);
  return bumps.map((bump) => {
    const rowDefs = defs.filter((item) => item.octaveBump === bump);
    const keys = rowDefs.map((item) => {
      const natural = resolvePitchPad(item.key, baseOctave, options)!;
      const sharp = resolvePitchPad(`${item.key}#`, baseOctave, options)!;
      return {
        key: item.key,
        label: `${natural.label} / ⇧${sharp.label}`,
      };
    });
    const lo = resolvePitchPad(rowDefs[0]!.key, baseOctave, options)!.label;
    const hi = resolvePitchPad(rowDefs[rowDefs.length - 1]!.key, baseOctave, options)!.label;
    const title = `${ROW_TITLES[bump] ?? `+${bump}`} ${lo}–${hi}`;
    return { title, keys };
  });
}
