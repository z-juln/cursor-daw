export type ContextSetter = (key: string, value: boolean) => Thenable<void>;

const CONTEXT_KEY = "cursorDrum.recording";

export class RecordingMode {
  private on = false;

  constructor(private readonly setContext: ContextSetter) {
    void this.setContext(CONTEXT_KEY, false);
  }

  get enabled(): boolean {
    return this.on;
  }

  async set(on: boolean): Promise<void> {
    this.on = on;
    await this.setContext(CONTEXT_KEY, on);
  }

  async toggle(): Promise<boolean> {
    await this.set(!this.on);
    return this.on;
  }
}
