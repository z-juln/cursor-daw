import * as vscode from "vscode";
import { DEFAULT_KIT_ID, KitId, normalizeKitId } from "./kits/registry";

const CONTEXT_KEY = "cursorDrum.activeKit";

export class KitMode {
  private active: KitId = DEFAULT_KIT_ID;

  constructor() {
    void vscode.commands.executeCommand("setContext", CONTEXT_KEY, this.active);
  }

  get kitId(): KitId {
    return this.active;
  }

  async set(kitId: string): Promise<void> {
    const { kitId: resolved } = normalizeKitId(kitId);
    this.active = resolved;
    await vscode.commands.executeCommand("setContext", CONTEXT_KEY, resolved);
  }
}
