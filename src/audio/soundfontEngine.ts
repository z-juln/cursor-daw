import { readFileSync } from "fs";
import {
  BasicMIDI,
  SoundBankLoader,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
} from "spessasynth_core";
import { encodeMidi } from "../midi/encode";
import { Session, TimedNote } from "../types";

export interface AudioContextLike {
  currentTime: number;
  sampleRate: number;
  state: string;
  destination: unknown;
  createBufferSource(): any;
  createGain(): any;
  createWaveShaper(): any;
  createBuffer(channels: number, length: number, sampleRate: number): any;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface SoundfontEngineOptions {
  sf2Path: string;
  sampleRate?: number;
  masterGain?: number;
}

const SATURATION_DRIVE = 1.5;
const CEILING = 0.95;

function saturationCurve(points = 1024): Float32Array {
  const curve = new Float32Array(points);
  const normalize = Math.tanh(SATURATION_DRIVE);
  for (let i = 0; i < points; i += 1) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = (Math.tanh(x * SATURATION_DRIVE) / normalize) * CEILING;
  }
  return curve;
}

async function renderMidiPcm(
  midiBytes: Uint8Array,
  sf2Path: string,
  sampleRate: number,
  tailSec = 1,
): Promise<{ left: Float32Array; right: Float32Array }> {
  const midiCopy = midiBytes.buffer.slice(
    midiBytes.byteOffset,
    midiBytes.byteOffset + midiBytes.byteLength,
  );
  const midi = BasicMIDI.fromArrayBuffer(midiCopy as ArrayBuffer);
  const sfBytes = readFileSync(sf2Path);
  const soundBank = SoundBankLoader.fromArrayBuffer(
    sfBytes.buffer.slice(sfBytes.byteOffset, sfBytes.byteOffset + sfBytes.byteLength) as ArrayBuffer,
  );
  const synth = new SpessaSynthProcessor(sampleRate, { eventsEnabled: false });
  synth.soundBankManager.addSoundBank(soundBank, "main");
  await synth.processorInitialized;
  synth.setSystemParameter("autoAllocateVoices", true);
  const seq = new SpessaSynthSequencer(synth);
  seq.loadNewSongList([midi]);
  seq.play();
  const sampleCount = Math.max(sampleRate, Math.ceil(sampleRate * (midi.duration + tailSec)));
  const left = new Float32Array(sampleCount);
  const right = new Float32Array(sampleCount);
  let filled = 0;
  const BUFFER_SIZE = 128;
  while (filled < sampleCount) {
    seq.processTick();
    const size = Math.min(BUFFER_SIZE, sampleCount - filled);
    synth.process(left, right, filled, size);
    filled += size;
  }
  return { left, right };
}

export class SoundfontEngine {
  private ctx?: AudioContextLike;

  private master?: any;

  private source?: any;

  private ready: Promise<void> | undefined;

  private pcm?: { left: Float32Array; right: Float32Array };

  private durationSec = 0;

  private loop = true;

  private playing = false;

  private startedAt = 0;

  private offsetSec = 0;

  private readonly sampleRate: number;

  private readonly masterGain: number;

  onTick?: (positionSec: number) => void;

  private tickTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly createContext: () => AudioContextLike,
    private readonly options: SoundfontEngineOptions,
  ) {
    this.sampleRate = options.sampleRate ?? 44100;
    this.masterGain = options.masterGain ?? 0.6;
  }

  get contextState(): string {
    return this.ctx?.state ?? "closed";
  }

  get positionSec(): number {
    if (!this.playing || !this.ctx) return this.offsetSec;
    const raw = this.offsetSec + (this.ctx.currentTime - this.startedAt);
    if (this.loop && this.durationSec > 0) {
      return ((raw % this.durationSec) + this.durationSec) % this.durationSec;
    }
    return Math.min(raw, this.durationSec);
  }

  async warmUp(): Promise<void> {
    this.ensureContext();
    this.ready ??= this.preload();
    await this.ready;
  }

  private async preload(): Promise<void> {
    // Touch SF2 once so first play is faster.
    readFileSync(this.options.sf2Path);
  }

  async load(session: Session, notes: TimedNote[], durationSec: number, loop: boolean): Promise<void> {
    await this.warmUp();
    const bytes = encodeMidi(session, notes);
    this.pcm = await renderMidiPcm(bytes, this.options.sf2Path, this.sampleRate);
    this.durationSec = durationSec;
    this.loop = loop;
  }

  play(fromSec = 0): void {
    if (!this.pcm) return;
    this.ensureContext();
    this.stopSource();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") void ctx.resume();
    const buffer = ctx.createBuffer(2, this.pcm.left.length, this.sampleRate);
    buffer.copyToChannel(this.pcm.left, 0);
    buffer.copyToChannel(this.pcm.right, 1);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = this.loop;
    source.connect(this.ensureMaster());
    const offset = Math.max(0, Math.min(fromSec, this.durationSec || fromSec));
    source.start(0, offset);
    this.source = source;
    this.playing = true;
    this.offsetSec = offset;
    this.startedAt = ctx.currentTime;
    this.tickTimer ??= setInterval(() => {
      if (!this.playing) return;
      const position = this.positionSec;
      this.onTick?.(position);
      if (!this.loop && position >= this.durationSec - 0.01) this.stop();
    }, 50);
  }

  pause(): void {
    if (!this.playing) return;
    this.offsetSec = this.positionSec;
    this.playing = false;
    this.stopSource();
  }

  stop(): void {
    this.playing = false;
    this.offsetSec = 0;
    this.stopSource();
    this.onTick?.(0);
  }

  async noteOn(note: number, velocity: number, channel: number, program: number): Promise<void> {
    await this.warmUp();
    const role = channel === 9
      ? "drums" as const
      : program >= 32 && program <= 39
        ? "bass" as const
        : program >= 24 && program <= 31
          ? "guitar" as const
          : "keys" as const;
    const session: Session = {
      bpm: 120,
      meter: "4/4",
      stepsPerBar: 4,
      swing: 0,
      tracks: [{
        name: "pad",
        role,
        plugin: "pad",
        program,
        channel,
        rows: [],
      }],
      warnings: [],
      unsupportedVersion: false,
    };
    const notes: TimedNote[] = [{
      trackName: "pad",
      role,
      note,
      velocity,
      timeSec: 0,
      durationSec: channel === 9 ? 0.2 : role === "bass" ? 1.0 : 0.8,
      channel,
      program,
    }];
    const bytes = encodeMidi(session, notes);
    const pcm = await renderMidiPcm(bytes, this.options.sf2Path, this.sampleRate, 0.5);
    this.ensureContext();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") void ctx.resume();
    const buffer = ctx.createBuffer(2, pcm.left.length, this.sampleRate);
    buffer.copyToChannel(pcm.left, 0);
    buffer.copyToChannel(pcm.right, 1);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ensureMaster());
    source.start(ctx.currentTime + 0.005);
  }

  noteOff(_note: number, _channel: number): void {
    // One-shot buffers; nothing to stop for v1 Pad.
  }

  dispose(): void {
    this.stop();
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = undefined;
    void this.ctx?.close();
    this.ctx = undefined;
  }

  private ensureContext(): AudioContextLike {
    if (!this.ctx) this.ctx = this.createContext();
    return this.ctx;
  }

  private ensureMaster(): any {
    if (this.master) return this.master;
    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = this.masterGain;
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve();
    gain.connect(shaper);
    shaper.connect(ctx.destination);
    this.master = gain;
    return gain;
  }

  private stopSource(): void {
    try {
      this.source?.stop();
    } catch {
      // already stopped
    }
    this.source = undefined;
  }
}
