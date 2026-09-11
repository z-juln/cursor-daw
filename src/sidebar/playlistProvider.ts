import * as vscode from "vscode";
import { LibraryScore, listScores } from "../library";
import {
  isPlayingScore,
  PlaylistViewState,
  scoreContextValue,
} from "./scoreContext";

export type { PlaylistViewState } from "./scoreContext";

export class ScoreTreeItem extends vscode.TreeItem {
  readonly absolutePath: string;

  constructor(score: LibraryScore, state: PlaylistViewState) {
    super(score.relativePath, vscode.TreeItemCollapsibleState.None);
    this.absolutePath = score.absolutePath;
    this.description = isPlayingScore(score.absolutePath, state) ? "播放中" : "鼓谱";
    this.tooltip = score.absolutePath;
    this.resourceUri = vscode.Uri.file(score.absolutePath);
    this.contextValue = scoreContextValue(score.absolutePath, state);
    this.iconPath = new vscode.ThemeIcon(
      this.contextValue === "cursorDrum.scorePlaying" ? "play-circle" : "music",
    );
    this.command = {
      command: "cursorDrum.openLibraryScore",
      title: "打开鼓谱",
      arguments: [this],
    };
  }
}

export class PlaylistProvider implements vscode.TreeDataProvider<ScoreTreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly root: string,
    private readonly getState: () => PlaylistViewState,
  ) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: ScoreTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ScoreTreeItem[]> {
    const state = this.getState();
    return (await listScores(this.root)).map(
      (score) => new ScoreTreeItem(score, state),
    );
  }
}
