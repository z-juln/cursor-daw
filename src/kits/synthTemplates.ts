import type { OscVoice, Voice } from "../voices";

type VoiceTemplate =
  | Omit<OscVoice, "level" | "delay"> & { gain: number; delay?: number }
  | Omit<import("../voices").NoiseVoice, "level" | "delay" | "q"> & {
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
  filter: "highpass" | "bandpass",
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

/** 各合成 kit 的发声层模板（满力度基准，velocity 在 voicesFor 里缩放）。 */
export const SYNTH_KIT_TEMPLATES: Record<string, Record<string, VoiceTemplate[]>> = {
  default: {
    kick: [osc(150, 40, 0.18, 1)],
    snare: [
      noise(0.16, 0.95, "highpass", 900),
      osc(190, 150, 0.1, 0.3, "triangle"),
    ],
    ch: [noise(0.1, 1.25, "highpass", 2800)],
    oh: [noise(0.34, 0.78, "highpass", 2600)],
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
  },
  "808": {
    kick: [osc(55, 28, 0.55, 1.1, "sine")],
    snare: [
      noise(0.08, 1.1, "highpass", 1200),
      osc(180, 120, 0.06, 0.15, "triangle"),
    ],
    ch: [noise(0.04, 1.4, "highpass", 7000)],
    oh: [noise(0.28, 0.95, "highpass", 4800)],
    clap: [
      noise(0.04, 3.2, "bandpass", 1100, { q: 0.55 }),
      noise(0.04, 2.6, "bandpass", 1100, { q: 0.55, delay: 0.02 }),
      noise(0.1, 2.1, "bandpass", 1100, { q: 0.55, delay: 0.045 }),
    ],
    tom1: [osc(160, 90, 0.28, 0.82)],
    tom2: [osc(110, 65, 0.32, 0.85)],
    tom3: [osc(75, 45, 0.38, 0.88)],
    crash: [noise(0.9, 0.65, "highpass", 4500)],
    ride: [noise(0.55, 0.55, "highpass", 6000)],
  },
  acoustic: {
    kick: [osc(110, 55, 0.22, 1), osc(200, 80, 0.08, 0.2, "triangle")],
    snare: [
      noise(0.22, 1.05, "highpass", 750),
      osc(220, 170, 0.14, 0.35, "triangle"),
    ],
    ch: [noise(0.06, 1.1, "highpass", 2400)],
    oh: [noise(0.42, 0.85, "highpass", 2200)],
    clap: [
      noise(0.06, 2.6, "bandpass", 1200, { q: 0.7 }),
      noise(0.08, 2.2, "bandpass", 1200, { q: 0.7, delay: 0.03 }),
      noise(0.16, 1.8, "bandpass", 1200, { q: 0.7, delay: 0.06 }),
    ],
    tom1: [osc(260, 170, 0.28, 0.78)],
    tom2: [osc(190, 120, 0.32, 0.8)],
    tom3: [osc(140, 85, 0.38, 0.84)],
    crash: [
      noise(1.4, 0.75, "highpass", 2800),
      osc(380, 360, 0.65, 0.1, "square"),
    ],
    ride: [
      noise(0.9, 0.65, "highpass", 3800),
      osc(720, 700, 0.55, 0.14, "square"),
    ],
  },
};

/** 采样 kit 对应的合成源（用于离线渲染 wav 资产）。 */
export const WAV_KIT_SYNTH_SOURCE: Record<string, string> = {
  "wav-classic": "acoustic",
  "wav-punch": "808",
};

export function synthTemplatesFor(kitId: string): Record<string, VoiceTemplate[]> | undefined {
  const source = SYNTH_KIT_TEMPLATES[kitId] ?? SYNTH_KIT_TEMPLATES[WAV_KIT_SYNTH_SOURCE[kitId] ?? ""];
  return source;
}
