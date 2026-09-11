import { BUILTIN_ORDER } from "./drums";
import { DEFAULT_KIT_ID, KIT_DEFINITIONS, normalizeKitId } from "./kits/registry";
import { loadSamplePcm, sampleDurationSec } from "./samples";

/** node-web-audio-api 与浏览器 AudioContext 的交集，便于在测试中替换。 */
export interface AudioContextLike {
  currentTime: number;
  sampleRate: number;
  state: string;
  destination: unknown;
  createOscillator(): any;
  createBufferSource(): any;
  createGain(): any;
  createBiquadFilter(): any;
  createWaveShaper(): any;
  createBuffer(channels: number, length: number, sampleRate: number): any;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface EngineNote {
  drumId: string;
  velocity: number;
  timeSec: number;
}

export interface EngineScore {
  notes: EngineNote[];
  durationSec: number;
  loop: boolean;
}

export interface EngineOptions {
  /** 提前排程的时间窗口，越大越稳、越小越跟手。 */
  lookaheadSec?: number;
  intervalMs?: number;
  /** 关掉内部计时器，测试里手动调用 tick。 */
  autoTick?: boolean;
  /** 母线音量。留出余量，避免同时敲多件鼓时叠加削波。 */
  masterGain?: number;
  /** 扩展内 media/kits 目录，用于加载采样 kit 的 wav。 */
  kitsRoot?: string;
}

const DEFAULT_MASTER_GAIN = 0.6;

/** 软限幅的驱动量。越大压得越狠，1.5 对单击几乎透明，只在叠加时起作用。 */
const SATURATION_DRIVE = 1.5;

/** 限幅上限，留一点余量避免逼到满刻度。 */
const CEILING = 0.95;

/** 单击的排程提前量，足够躲开时钟抖动，又听不出延迟。 */
const IMMEDIATE_LEAD_SEC = 0.005;

/** tanh 曲线：同时敲多件鼓时把叠加的峰值柔和地压住，而不是硬切出失真。 */
function saturationCurve(points = 1024): Float32Array {
  const curve = new Float32Array(points);
  const normalize = Math.tanh(SATURATION_DRIVE);
  for (let i = 0; i < points; i += 1) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = (Math.tanh(x * SATURATION_DRIVE) / normalize) * CEILING;
  }
  return curve;
}

interface ActiveNode {
  node: { stop(at?: number): void };
  endsAt: number;
}

export class DrumEngine {
  private ctx?: AudioContextLike;

  private score: EngineScore = { notes: [], durationSec: 0, loop: true };

  private active: ActiveNode[] = [];

  private timer?: ReturnType<typeof setInterval>;

  private startAudioSec = 0;

  private startScoreSec = 0;

  private scheduledUntil = 0;

  private isPlaying = false;

  private readonly lookaheadSec: number;

  private readonly intervalMs: number;

  private readonly autoTick: boolean;

  private readonly masterGain: number;

  private master?: any;

  private readonly bank = new Map<string, { buffer: any; durationSec: number }>();

  private readonly kitsRoot?: string;

  private padKitId = DEFAULT_KIT_ID;

  private playbackKitId = DEFAULT_KIT_ID;

  onTick?: (positionSec: number) => void;

  constructor(
    private readonly factory: () => AudioContextLike,
    options: EngineOptions = {},
  ) {
    this.lookaheadSec = options.lookaheadSec ?? 0.12;
    this.intervalMs = options.intervalMs ?? 25;
    this.autoTick = options.autoTick ?? true;
    this.masterGain = options.masterGain ?? DEFAULT_MASTER_GAIN;
    this.kitsRoot = options.kitsRoot;
  }

  setPadKit(kitId: string): void {
    this.padKitId = normalizeKitId(kitId).kitId;
  }

  setPlaybackKit(kitId: string): void {
    this.playbackKitId = normalizeKitId(kitId).kitId;
  }

  get padKit(): string {
    return this.padKitId;
  }

  get playbackKit(): string {
    return this.playbackKitId;
  }

  private bankKey(kitId: string, drumId: string): string {
    return `${kitId}:${drumId}`;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  get positionSec(): number {
    if (!this.isPlaying || !this.ctx) return this.startScoreSec;
    return this.wrap(this.startScoreSec + this.ctx.currentTime - this.startAudioSec);
  }

  private context(): AudioContextLike {
    if (!this.ctx) this.ctx = this.factory();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** 所有声音先汇到母线，再经软限幅出声，避免叠加削波。 */
  private bus(ctx: AudioContextLike): unknown {
    if (!this.master) {
      const limiter = ctx.createWaveShaper();
      limiter.curve = saturationCurve();
      limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.masterGain;
      this.master.connect(limiter);
    }
    return this.master;
  }

  private wrap(value: number): number {
    const { durationSec, loop } = this.score;
    if (loop && durationSec > 0) return ((value % durationSec) + durationSec) % durationSec;
    return Math.max(0, Math.min(value, durationSec || value));
  }

  private prune(now: number): void {
    this.active = this.active.filter((entry) => entry.endsAt > now);
  }

  /**
   * 把 JS 合成的 PCM 写进 AudioBuffer。
   * 必须用 copyToChannel：node-web-audio-api 的 getChannelData() 是分离副本，
   * 写进去的数据到不了实时播放图。
   */
  private bufferFor(
    drumId: string,
    kitId: string,
  ): { buffer: any; durationSec: number } | undefined {
    const { kitId: resolved } = normalizeKitId(kitId);
    const key = this.bankKey(resolved, drumId);
    const cached = this.bank.get(key);
    if (cached) return cached;
    const ctx = this.context();
    const pcm = loadSamplePcm(drumId, ctx.sampleRate, resolved, this.kitsRoot);
    if (pcm.length === 0) return undefined;
    const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    if (typeof buffer.copyToChannel === "function") {
      buffer.copyToChannel(pcm, 0);
    } else {
      buffer.getChannelData(0).set(pcm);
    }
    const durationSec = pcm.length / ctx.sampleRate;
    const entry = { buffer, durationSec: durationSec || sampleDurationSec(drumId, resolved) };
    this.bank.set(key, entry);
    return entry;
  }

  private spawn(drumId: string, velocity: number, at: number, kitId: string): void {
    const sample = this.bufferFor(drumId, kitId);
    if (!sample) return;
    const ctx = this.context();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const level = Math.max(0.02, Math.min(1, velocity / 127));
    source.buffer = sample.buffer;
    gain.gain.setValueAtTime(level, at);
    source.connect(gain);
    gain.connect(this.bus(ctx));
    source.start(at);
    source.stop(at + sample.durationSec);
    this.active.push({ node: source, endsAt: at + sample.durationSec });
  }

  /** 预热音频后端并烘焙指定 kit 的十件鼓采样。 */
  warmUp(kitId?: string): void {
    this.context();
    const targets = kitId
      ? [normalizeKitId(kitId).kitId]
      : [...new Set([this.padKitId, this.playbackKitId])];
    for (const kit of targets) {
      for (const drumId of BUILTIN_ORDER) this.bufferFor(drumId, kit);
    }
  }

  /** 预烘焙全部内置 kit，安装后或切换鼓组时可选调用。 */
  warmUpAllKits(): void {
    this.context();
    for (const kit of KIT_DEFINITIONS) {
      for (const drumId of BUILTIN_ORDER) this.bufferFor(drumId, kit.id);
    }
  }

  get contextState(): string {
    return this.ctx?.state ?? "closed";
  }

  noteOn(drumId: string, velocity: number): void {
    const ctx = this.context();
    this.prune(ctx.currentTime);
    this.spawn(drumId, velocity, ctx.currentTime + IMMEDIATE_LEAD_SEC, this.padKitId);
  }

  load(score: EngineScore): void {
    this.score = score;
  }

  play(positionSec = 0): void {
    const ctx = this.context();
    this.isPlaying = true;
    this.startAudioSec = ctx.currentTime;
    this.startScoreSec = Math.max(0, positionSec);
    this.scheduledUntil = this.startScoreSec;
    this.tick();
    if (this.autoTick && !this.timer) {
      this.timer = setInterval(() => this.tick(), this.intervalMs);
      this.timer.unref?.();
    }
  }

  tick(): void {
    if (!this.isPlaying || !this.ctx) return;
    const ctx = this.ctx;
    const current = this.startScoreSec + ctx.currentTime - this.startAudioSec;
    const until = current + this.lookaheadSec;
    const from = Math.max(current, this.scheduledUntil);
    const { notes, durationSec, loop } = this.score;

    if (durationSec > 0) {
      const firstCycle = loop ? Math.floor(from / durationSec) : 0;
      const lastCycle = loop ? Math.floor(until / durationSec) : 0;
      for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
        for (const note of notes) {
          const absolute = cycle * durationSec + note.timeSec;
          if (absolute < from || absolute >= until) continue;
          if (!loop && absolute >= durationSec) continue;
          this.spawn(
            note.drumId,
            note.velocity,
            ctx.currentTime + absolute - current,
            this.playbackKitId,
          );
        }
      }
    }

    this.scheduledUntil = until;
    this.prune(ctx.currentTime);

    if (!loop && durationSec > 0 && current >= durationSec) {
      this.stop();
      return;
    }
    this.onTick?.(this.wrap(current));
  }

  private halt(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const entry of this.active) {
      try {
        entry.node.stop();
      } catch {
        // 已经结束的节点再次 stop 会抛错，忽略即可。
      }
    }
    this.active = [];
  }

  pause(): void {
    const position = this.positionSec;
    this.isPlaying = false;
    this.halt();
    this.startScoreSec = position;
    this.onTick?.(position);
  }

  stop(): void {
    this.isPlaying = false;
    this.halt();
    this.startScoreSec = 0;
    this.scheduledUntil = 0;
    this.onTick?.(0);
  }

  dispose(): void {
    this.isPlaying = false;
    this.halt();
    void this.ctx?.close();
    this.ctx = undefined;
    this.master = undefined;
    this.bank.clear();
  }
}
