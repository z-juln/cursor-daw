export interface OscVoice {
  kind: "osc";
  from: number;
  to: number;
  decay: number;
  level: number;
  type: "sine" | "triangle" | "square";
  delay: number;
}

export interface NoiseVoice {
  kind: "noise";
  decay: number;
  level: number;
  filter: "highpass" | "bandpass";
  frequency: number;
  /** 滤波器 Q。默认 1 的 bandpass 只留很窄一条带，会丢掉噪声大部分能量。 */
  q: number;
  delay: number;
}

export type Voice = OscVoice | NoiseVoice;

type VoiceTemplate =
  | Omit<OscVoice, "level" | "delay"> & { gain: number; delay?: number }
  | Omit<NoiseVoice, "level" | "delay" | "q"> & {
    gain: number;
    q?: number;
    delay?: number;
  };

const osc = (
  from: number,
  to: number,
  decay: number,
  gain: number,
  type: OscVoice["type"] = "sine",
): VoiceTemplate => ({ kind: "osc", from, to, decay, gain, type });

const noise = (
  decay: number,
  gain: number,
  filter: NoiseVoice["filter"],
  frequency: number,
  options: { q?: number; delay?: number } = {},
): VoiceTemplate => ({
  kind: "noise",
  decay,
  gain,
  filter,
  frequency,
  q: options.q,
  delay: options.delay,
});

/**
 * 音量按 200ms 短时 RMS 对齐，而不是按峰值：峰值 1 的正弦 RMS 约 0.707，
 * 而滤波后的白噪声只有 0.2 上下，按峰值配平会让噪声类音色听感低十几分贝。
 * 调整后的实测值见 `npm run verify:audio`。
 */
const TEMPLATES: Record<string, VoiceTemplate[]> = {
  kick: [osc(150, 40, 0.18, 1)],
  snare: [
    noise(0.16, 0.95, "highpass", 900),
    osc(190, 150, 0.1, 0.3, "triangle"),
  ],
  ch: [noise(0.1, 1.25, "highpass", 2800)],
  oh: [noise(0.34, 0.78, "highpass", 2600)],
  // 三层窄带各自能量有限，所以增益数字看起来比底鼓大，实际输出并不更响。
  clap: [
    noise(0.05, 3, "bandpass", 1300, { q: 0.6 }),
    noise(0.05, 2.5, "bandpass", 1300, { q: 0.6, delay: 0.025 }),
    noise(0.14, 2, "bandpass", 1300, { q: 0.6, delay: 0.05 }),
  ],
  tom1: [osc(220, 150, 0.22, 0.75)],
  tom2: [osc(165, 110, 0.25, 0.78)],
  tom3: [osc(120, 75, 0.3, 0.82)],
  crash: [
    noise(1.2, 0.7, "highpass", 3000),
    osc(420, 390, 0.55, 0.08, "square"),
  ],
  ride: [
    noise(0.75, 0.7, "highpass", 4200),
    osc(780, 760, 0.45, 0.12, "square"),
  ],
};

/** 指数包络不能落到 0，留一个听不见但非零的下限。 */
const MIN_LEVEL = 0.0001;

export function voicesFor(drumId: string, velocity: number): Voice[] {
  const templates = TEMPLATES[drumId];
  if (!templates) return [];
  const scale = Math.max(0, Math.min(127, velocity)) / 127;
  return templates.map((template) => {
    const { gain, delay, ...rest } = template;
    const q = "q" in rest ? rest.q ?? 1 : undefined;
    return {
      ...rest,
      ...(q === undefined ? {} : { q }),
      delay: delay ?? 0,
      level: Math.max(MIN_LEVEL, gain * scale),
    } as Voice;
  });
}

export function voiceDuration(voice: Voice): number {
  return voice.delay + voice.decay;
}
