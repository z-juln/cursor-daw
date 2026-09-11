import { DrumId } from "./types";

export const BUILTIN_ORDER: DrumId[] = [
  "kick", "snare", "ch", "oh", "clap",
  "tom1", "tom2", "tom3", "crash", "ride",
];

export const DEFAULT_KEY_MAP: Record<string, DrumId> = {
  a: "kick", s: "snare", d: "ch", f: "oh", g: "clap",
  q: "tom1", w: "tom2", e: "tom3", r: "crash", t: "ride",
};

export const DRUM_LABELS: Record<DrumId, string> = {
  kick: "底鼓",
  snare: "军鼓",
  ch: "闭合踩镲",
  oh: "开音踩镲",
  clap: "拍手",
  tom1: "高音嗵鼓",
  tom2: "中音嗵鼓",
  tom3: "低音嗵鼓",
  crash: "强音镲",
  ride: "叮叮镲",
};

export const ID_WIDTH = 6;

const aliases: Record<string, DrumId> = {
  kick: "kick", bd: "kick", k: "kick",
  snare: "snare", sd: "snare", sn: "snare",
  ch: "ch", hh: "ch", hat: "ch",
  oh: "oh", ho: "oh",
  clap: "clap", cp: "clap",
  tom1: "tom1", ht: "tom1",
  tom2: "tom2", mt: "tom2",
  tom3: "tom3", lt: "tom3",
  crash: "crash", cr: "crash",
  ride: "ride", rd: "ride",
};

export function canonicalDrumId(raw: string): DrumId | null {
  return aliases[raw.toLowerCase()] ?? null;
}
