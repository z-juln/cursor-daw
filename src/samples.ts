import { voicesFor, voiceDuration, type NoiseVoice, type OscVoice, type Voice } from "./voices";

/** 用固定种子生成噪声，同一鼓件每次渲染结果相同，才能安全缓存。 */
function makeNoise(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0x100000000) * 2 - 1;
  };
}

/** RBJ Cookbook 二阶滤波，离线渲染噪声层，不走实时 AudioNode。 */
function biquad(
  type: NoiseVoice["filter"],
  frequency: number,
  q: number,
  sampleRate: number,
): (input: number) => number {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.max(0.1, q));
  const cos = Math.cos(w0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1 + alpha;
  let a1 = -2 * cos;
  let a2 = 1 - alpha;
  if (type === "highpass") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  a1 /= a0;
  a2 /= a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x0: number) => {
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    return y0;
  };
}

function envelope(time: number, peak: number, decay: number): number {
  if (time < 0 || time > decay) return 0;
  if (time < 0.003) {
    return 0.0001 + (Math.max(0.0001, peak) - 0.0001) * (time / 0.003);
  }
  const remain = decay - 0.003;
  if (remain <= 0) return 0;
  const ratio = 0.0001 / Math.max(0.0001, peak);
  return Math.max(0.0001, peak) * ratio ** ((time - 0.003) / remain);
}

function oscValue(type: OscVoice["type"], phase: number): number {
  const cycle = ((phase % 1) + 1) % 1;
  if (type === "square") return cycle < 0.5 ? 1 : -1;
  if (type === "triangle") return 1 - 4 * Math.abs(cycle - 0.5);
  return Math.sin(cycle * Math.PI * 2);
}

function renderOsc(voice: OscVoice, sampleRate: number, pcm: Float32Array): void {
  const start = Math.floor(voice.delay * sampleRate);
  const n = Math.floor(voice.decay * sampleRate);
  let phase = 0;
  for (let i = 0; i < n && start + i < pcm.length; i += 1) {
    const t = i / sampleRate;
    const freq = voice.from * (voice.to / voice.from) ** (t / voice.decay);
    phase += Math.max(20, freq) / sampleRate;
    pcm[start + i] += oscValue(voice.type, phase) * envelope(t, voice.level, voice.decay);
  }
}

function renderNoise(voice: NoiseVoice, sampleRate: number, pcm: Float32Array, seed: number): void {
  const start = Math.floor(voice.delay * sampleRate);
  const n = Math.floor(voice.decay * sampleRate);
  const next = makeNoise(seed);
  const filter = biquad(voice.filter, voice.frequency, voice.q, sampleRate);
  for (let i = 0; i < n && start + i < pcm.length; i += 1) {
    const t = i / sampleRate;
    pcm[start + i] += filter(next()) * envelope(t, voice.level, voice.decay);
  }
}

const SEEDS: Record<string, number> = {
  kick: 1,
  snare: 2,
  ch: 3,
  oh: 4,
  clap: 5,
  tom1: 6,
  tom2: 7,
  tom3: 8,
  crash: 9,
  ride: 10,
};

/** 满力度采样的时长，含各层 delay。 */
export function sampleDurationSec(drumId: string): number {
  const voices = voicesFor(drumId, 127);
  if (voices.length === 0) return 0;
  return Math.max(...voices.map((voice) => voiceDuration(voice))) + 0.02;
}

/**
 * 在 JS 里离线合成一件鼓的 PCM。
 * 实时播放只播这段缓冲，不再在 AudioContext 里现场造噪声——
 * node-web-audio-api 的 getChannelData() 返回分离副本，写进去的噪声到不了扬声器。
 */
export function renderSample(drumId: string, sampleRate: number): Float32Array {
  const voices = voicesFor(drumId, 127);
  if (voices.length === 0) return new Float32Array(0);
  const pcm = new Float32Array(Math.max(1, Math.ceil(sampleDurationSec(drumId) * sampleRate)));
  const seed = SEEDS[drumId] ?? 99;
  voices.forEach((voice: Voice, index) => {
    if (voice.kind === "osc") renderOsc(voice, sampleRate, pcm);
    else renderNoise(voice, sampleRate, pcm, seed + index * 17);
  });
  return pcm;
}
