import { SoundfontEngine, type AudioContextLike } from "./audio/soundfontEngine";
import { Session, TimedNote } from "./types";

export type { AudioContextLike };

/** Thin facade used by extension.ts. */
export class DawEngine {
  private readonly inner: SoundfontEngine;

  onTick?: (positionSec: number) => void;

  constructor(
    createContext: () => AudioContextLike,
    options: { sf2Path: string },
  ) {
    this.inner = new SoundfontEngine(createContext, options);
    this.inner.onTick = (value) => this.onTick?.(value);
  }

  get contextState(): string {
    return this.inner.contextState;
  }

  get positionSec(): number {
    return this.inner.positionSec;
  }

  warmUp(): void {
    void this.inner.warmUp();
  }

  async loadSession(
    session: Session,
    notes: TimedNote[],
    durationSec: number,
    loop: boolean,
  ): Promise<void> {
    await this.inner.load(session, notes, durationSec, loop);
  }

  play(fromSec: number): void {
    this.inner.play(fromSec);
  }

  seek(sec: number): void {
    this.inner.seek(sec);
  }

  pause(): void {
    this.inner.pause();
  }

  stop(): void {
    this.inner.stop();
  }

  noteOn(note: number, velocity: number, channel: number, program: number): void {
    void this.inner.noteOn(note, velocity, channel, program);
  }

  dispose(): void {
    this.inner.dispose();
  }
}
