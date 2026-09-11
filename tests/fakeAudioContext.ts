import type { AudioContextLike } from "../src/engine";

interface StartedNode {
  at: number;
  stopAt?: number;
  stoppedEarly: boolean;
}

class FakeParam {
  events: Array<{ kind: string; value: number; at: number }> = [];

  constructor(private readonly onSet?: (value: number) => void) {}

  #value = 0;

  get value(): number {
    return this.#value;
  }

  set value(next: number) {
    this.#value = next;
    this.onSet?.(next);
  }

  setValueAtTime(value: number, at: number): void {
    this.events.push({ kind: "set", value, at });
  }

  exponentialRampToValueAtTime(value: number, at: number): void {
    this.events.push({ kind: "ramp", value, at });
  }
}

class FakeNode {
  frequency = new FakeParam();

  gain: FakeParam;

  Q = new FakeParam();

  type = "";

  buffer: unknown;

  curve: unknown;

  constructor(
    private readonly record?: StartedNode[],
    onGainSet?: (value: number) => void,
  ) {
    this.gain = new FakeParam(onGainSet);
  }

  private entry?: StartedNode;

  connect<T>(target: T): T {
    return target;
  }

  start(at: number): void {
    this.entry = { at, stoppedEarly: false };
    this.record?.push(this.entry);
  }

  stop(at?: number): void {
    if (!this.entry) return;
    if (at === undefined) this.entry.stoppedEarly = true;
    else if (at < this.entry.at) this.entry.stoppedEarly = true;
    else this.entry.stopAt = at;
  }
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;

  sampleRate = 48000;

  state = "running";

  destination = {};

  started: StartedNode[] = [];

  resumeCalls = 0;

  closed = false;

  /** 被直接赋值的 gain.value，用来确认母线只建了一次。 */
  gainValues: number[] = [];

  shapers: FakeNode[] = [];

  createOscillator(): any {
    return new FakeNode(this.started);
  }

  createBufferSource(): any {
    return new FakeNode(this.started);
  }

  createGain(): any {
    return new FakeNode(undefined, (value) => this.gainValues.push(value));
  }

  createBiquadFilter(): any {
    return new FakeNode();
  }

  createWaveShaper(): any {
    const node = new FakeNode();
    this.shapers.push(node);
    return node;
  }

  copied: Float32Array[] = [];

  createBuffer(_channels: number, length: number): any {
    const native = new Float32Array(length);
    return {
      length,
      copyToChannel: (source: Float32Array) => {
        native.set(source.subarray(0, native.length));
        this.copied.push(Float32Array.from(native));
      },
      // 模拟 node-web-audio-api：返回分离副本，写入不会进原生缓冲。
      getChannelData: () => Float32Array.from(native),
    };
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}
