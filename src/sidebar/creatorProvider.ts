import * as vscode from "vscode";

export interface CreatorState {
  name: string;
  bpm: number;
  bars: number;
  /** 相对谱库根的目录，空字符串表示根目录。 */
  folder: string;
}

class CreatorItem extends vscode.TreeItem {
  constructor(label: string, icon: string, command: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = { command, title: label };
  }
}

function folderLabel(folder: string): string {
  return folder ? folder : "根目录";
}

export class CreatorProvider implements vscode.TreeDataProvider<CreatorItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  readonly state: CreatorState = { name: "untitled", bpm: 120, bars: 2, folder: "" };

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: CreatorItem): vscode.TreeItem {
    return element;
  }

  getChildren(): CreatorItem[] {
    return [
      new CreatorItem(`名称：${this.state.name}`, "edit", "cursorDaw.creatorSetName"),
      new CreatorItem(`目录：${folderLabel(this.state.folder)}`, "folder", "cursorDaw.creatorSetFolder"),
      new CreatorItem(`BPM：${this.state.bpm}`, "pulse", "cursorDaw.creatorSetBpm"),
      new CreatorItem(`小节数：${this.state.bars}`, "list-ordered", "cursorDaw.creatorSetBars"),
      new CreatorItem("创建工程", "new-file", "cursorDaw.creatorCreate"),
    ];
  }
}
