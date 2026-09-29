import * as vscode from "vscode";

const CONTEXT_KEY = "cursorDaw.padMode";

export class PadMode {
  private on = false;

  constructor() {
    void vscode.commands.executeCommand("setContext", CONTEXT_KEY, false);
  }

  get enabled(): boolean {
    return this.on;
  }

  async set(on: boolean): Promise<void> {
    this.on = on;
    await vscode.commands.executeCommand("setContext", CONTEXT_KEY, on);
  }

  async toggle(): Promise<boolean> {
    await this.set(!this.on);
    return this.on;
  }
}
