import * as vscode from "vscode";
import { listLibraryDirectory } from "../library";
import {
  isPlayingScore,
  PlaylistViewState,
  scoreContextValue,
} from "./scoreContext";

export type { PlaylistViewState } from "./scoreContext";

export class FolderTreeItem extends vscode.TreeItem {
  readonly relativePath: string;

  readonly absolutePath: string;

  constructor(relativePath: string, absolutePath: string) {
    const name = relativePath.split("/").pop() ?? relativePath;
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = relativePath;
    this.relativePath = relativePath;
    this.absolutePath = absolutePath;
    this.contextValue = "cursorDaw.folder";
    this.iconPath = new vscode.ThemeIcon("folder");
    this.tooltip = relativePath;
  }
}

export class ScoreTreeItem extends vscode.TreeItem {
  readonly absolutePath: string;

  readonly relativePath: string;

  constructor(relativePath: string, absolutePath: string, state: PlaylistViewState) {
    const name = relativePath.split("/").pop() ?? relativePath;
    super(name, vscode.TreeItemCollapsibleState.None);
    this.id = relativePath;
    this.relativePath = relativePath;
    this.absolutePath = absolutePath;
    this.description = isPlayingScore(absolutePath, state) ? "播放中" : undefined;
    this.tooltip = relativePath;
    this.resourceUri = vscode.Uri.file(absolutePath);
    this.contextValue = scoreContextValue(absolutePath, state);
    this.iconPath = new vscode.ThemeIcon(
      this.contextValue === "cursorDaw.scorePlaying" ? "play-circle" : "music",
    );
    this.command = {
      command: "cursorDaw.openLibraryScore",
      title: "打开工程",
      arguments: [this],
    };
  }
}

export type PlaylistTreeItem = FolderTreeItem | ScoreTreeItem;

export class PlaylistProvider implements vscode.TreeDataProvider<PlaylistTreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly root: string,
    private readonly getState: () => PlaylistViewState,
  ) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: PlaylistTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PlaylistTreeItem): Promise<PlaylistTreeItem[]> {
    const state = this.getState();
    const relativeDir = element instanceof FolderTreeItem ? element.relativePath : "";
    const listing = await listLibraryDirectory(this.root, relativeDir);
    return [
      ...listing.folders.map((folder) =>
        new FolderTreeItem(folder.relativePath, folder.absolutePath)),
      ...listing.scores.map((score) =>
        new ScoreTreeItem(score.relativePath, score.absolutePath, state)),
    ];
  }
}
