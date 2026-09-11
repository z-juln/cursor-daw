import * as vscode from "vscode";

export interface CreatorState {
  name: string;
  bpm: number;
  bars: number;
}

class CreatorItem extends vscode.TreeItem {
  constructor(label: string, icon: string, command: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = { command, title: label };
  }
}

export class CreatorProvider implements vscode.TreeDataProvider<CreatorItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  readonly state: CreatorState = { name: "untitled", bpm: 120, bars: 2 };

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: CreatorItem): vscode.TreeItem {
    return element;
  }

  getChildren(): CreatorItem[] {
    return [
      new CreatorItem(`名称：${this.state.name}`, "edit", "cursorDrum.creatorSetName"),
      new CreatorItem(`BPM：${this.state.bpm}`, "pulse", "cursorDrum.creatorSetBpm"),
      new CreatorItem(`小节数：${this.state.bars}`, "list-ordered", "cursorDrum.creatorSetBars"),
      new CreatorItem("创建鼓谱", "new-file", "cursorDrum.creatorCreate"),
    ];
  }
}
