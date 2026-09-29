import * as path from "path";
import * as vscode from "vscode";
import {
  createLibraryFolder,
  createLibraryScore,
  deleteLibraryFolder,
  deleteLibraryScore,
  isLibraryFolderEmpty,
  listAllFolders,
  renameLibraryEntry,
  sanitizeFolderPath,
  sanitizeFolderSegment,
  sanitizeScoreName,
} from "../library";
import { emptyTemplate } from "../serialize";
import { CreatorProvider } from "./creatorProvider";
import {
  FolderTreeItem,
  PlaylistProvider,
  PlaylistViewState,
  ScoreTreeItem,
} from "./playlistProvider";
import { RecorderProvider, RecorderViewState } from "./recorderProvider";

export interface SidebarController {
  refreshPlaylist(): void;
  refreshRecorder(): void;
}

export interface SidebarHost {
  getRecorderState(): RecorderViewState;
  getPlaylistState(): PlaylistViewState;
  playScoreFile(absolutePath: string): Promise<void>;
  pauseScoreFile(absolutePath: string): Promise<void>;
  syncLibrary(): Promise<void>;
}

function itemPath(item: ScoreTreeItem | vscode.Uri | string): string | undefined {
  if (item instanceof ScoreTreeItem) return item.absolutePath;
  if (item instanceof vscode.Uri) return item.fsPath;
  return typeof item === "string" ? item : undefined;
}

function folderRelativePath(item: FolderTreeItem | string | undefined): string {
  if (item instanceof FolderTreeItem) return item.relativePath;
  if (typeof item === "string") return sanitizeFolderPath(item);
  return "";
}

const MANUALS: Record<string, { file: string; title: string }> = {
  skill: { file: "agent/SKILL.md", title: "工程格式手册" },
  readme: { file: "README.md", title: "使用说明" },
};

export function registerSidebar(
  context: vscode.ExtensionContext,
  root: string,
  host: SidebarHost,
): SidebarController {
  const playlist = new PlaylistProvider(root, () => host.getPlaylistState());
  const recorder = new RecorderProvider(() => host.getRecorderState());
  const creator = new CreatorProvider();

  const register = (command: string, handler: (...args: any[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));
  };

  const openScore = async (value: ScoreTreeItem | vscode.Uri | string): Promise<void> => {
    const target = itemPath(value);
    if (!target) return;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
    await vscode.window.showTextDocument(document);
  };

  const createScore = async (folder?: string): Promise<void> => {
    if (folder !== undefined) creator.state.folder = folder;
    const content = emptyTemplate({ bpm: creator.state.bpm, bars: creator.state.bars });
    let target: string;
    try {
      target = await createLibraryScore(root, creator.state.name, content, {
        folder: creator.state.folder,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        void vscode.window.showErrorMessage(`创建工程失败：${(error as Error).message}`);
        return;
      }
      const fileName = sanitizeScoreName(creator.state.name);
      const folderLabel = creator.state.folder || "根目录";
      const answer = await vscode.window.showWarningMessage(
        `${folderLabel}/${fileName} 已存在，是否覆盖？`,
        { modal: true },
        "覆盖",
      );
      if (answer !== "覆盖") return;
      target = await createLibraryScore(root, creator.state.name, content, {
        folder: creator.state.folder,
        overwrite: true,
      });
    }
    playlist.refresh();
    await openScore(target);
  };

  const pickLibraryFolder = async (title: string, current = ""): Promise<string | undefined> => {
    const folders = await listAllFolders(root);
    const items = [
      { label: "根目录", description: "谱库顶层", folder: "" },
      ...folders.map((folder) => ({ label: folder, description: "目录", folder })),
      { label: "$(new-folder) 新建目录…", description: "输入新的相对路径", folder: "__new__" },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title,
      placeHolder: current ? `当前：${current || "根目录"}` : "选择目录",
    });
    if (!picked) return undefined;
    if (picked.folder === "__new__") {
      const value = await vscode.window.showInputBox({
        title: "新建目录（可嵌套，如 loops/styles/rock）",
        validateInput: (input) => {
          try {
            sanitizeFolderPath(input);
            return undefined;
          } catch (error) {
            return (error as Error).message;
          }
        },
      });
      if (value === undefined) return undefined;
      const safePath = sanitizeFolderPath(value);
      try {
        await createLibraryFolder(root, safePath);
        playlist.refresh();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          void vscode.window.showErrorMessage(`创建目录失败：${(error as Error).message}`);
          return undefined;
        }
      }
      return safePath;
    }
    return picked.folder;
  };

  register("cursorDaw.openManual", async (which: string = "skill") => {
    const manual = MANUALS[which] ?? MANUALS.skill;
    const uri = vscode.Uri.joinPath(context.extensionUri, ...manual.file.split("/"));
    try {
      await vscode.commands.executeCommand("markdown.showPreview", uri);
    } catch {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    }
  });
  register("cursorDaw.syncLibrary", async () => {
    try {
      await host.syncLibrary();
      playlist.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(`同步示例失败：${(error as Error).message}`);
    }
  });
  register("cursorDaw.refreshLibrary", () => playlist.refresh());
  register("cursorDaw.openLibraryScore", openScore);
  register("cursorDaw.playLibraryScore", async (item: ScoreTreeItem) => {
    const target = itemPath(item);
    if (!target) return;
    try {
      await host.playScoreFile(target);
    } catch (error) {
      void vscode.window.showErrorMessage(`播放失败：${(error as Error).message}`);
    }
  });
  register("cursorDaw.pauseLibraryScore", async (item: ScoreTreeItem) => {
    const target = itemPath(item);
    if (!target) return;
    try {
      await host.pauseScoreFile(target);
    } catch (error) {
      void vscode.window.showErrorMessage(`暂停失败：${(error as Error).message}`);
    }
  });
  register("cursorDaw.deleteLibraryScore", async (item: ScoreTreeItem) => {
    const target = itemPath(item);
    if (!target) return;
    const answer = await vscode.window.showWarningMessage(
      `确定删除 ${path.basename(target)}？此操作不可撤销。`,
      { modal: true },
      "删除",
    );
    if (answer !== "删除") return;
    try {
      await deleteLibraryScore(root, target);
      playlist.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(`删除失败：${(error as Error).message}`);
    }
  });
  register("cursorDaw.createLibraryFolder", async (item?: FolderTreeItem) => {
    const parent = folderRelativePath(item);
    const value = await vscode.window.showInputBox({
      title: parent ? `在 ${parent} 下新建目录` : "新建目录",
      placeHolder: parent ? "子目录名" : "如 loops/rock",
      validateInput: (input) => {
        try {
          sanitizeFolderSegment(input);
          return undefined;
        } catch (error) {
          return (error as Error).message;
        }
      },
    });
    if (value === undefined) return;
    const relativePath = parent
      ? sanitizeFolderPath(`${parent}/${value}`)
      : sanitizeFolderPath(value);
    try {
      await createLibraryFolder(root, relativePath);
      playlist.refresh();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        void vscode.window.showWarningMessage("目录已存在");
        return;
      }
      void vscode.window.showErrorMessage(`创建目录失败：${(error as Error).message}`);
    }
  });
  register("cursorDaw.renameLibraryFolder", async (item?: FolderTreeItem) => {
    if (!(item instanceof FolderTreeItem)) return;
    const currentName = item.relativePath.split("/").pop() ?? item.relativePath;
    const parent = item.relativePath.includes("/")
      ? item.relativePath.slice(0, item.relativePath.lastIndexOf("/"))
      : "";
    const value = await vscode.window.showInputBox({
      title: "重命名目录",
      value: currentName,
      validateInput: (input) => {
        try {
          sanitizeFolderSegment(input);
          return undefined;
        } catch (error) {
          return (error as Error).message;
        }
      },
    });
    if (value === undefined) return;
    const nextRelative = parent
      ? sanitizeFolderPath(`${parent}/${value}`)
      : sanitizeFolderPath(value);
    if (nextRelative === item.relativePath) return;
    try {
      await renameLibraryEntry(root, item.relativePath, nextRelative);
      playlist.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(`重命名目录失败：${(error as Error).message}`);
    }
  });
  register("cursorDaw.deleteLibraryFolder", async (item?: FolderTreeItem) => {
    if (!(item instanceof FolderTreeItem)) return;
    const empty = await isLibraryFolderEmpty(root, item.relativePath);
    const answer = await vscode.window.showWarningMessage(
      empty
        ? `确定删除空目录 ${item.relativePath}？`
        : `确定删除目录 ${item.relativePath} 及其中的全部工程？此操作不可撤销。`,
      { modal: true },
      "删除",
    );
    if (answer !== "删除") return;
    try {
      await deleteLibraryFolder(root, item.relativePath);
      playlist.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(`删除目录失败：${(error as Error).message}`);
    }
  });
  register("cursorDaw.newScoreInFolder", async (item?: FolderTreeItem) => {
    const folder = folderRelativePath(item);
    creator.state.folder = folder;
    creator.refresh();
    await createScore(folder);
  });
  register("cursorDaw.creatorSetName", async () => {
    const value = await vscode.window.showInputBox({
      title: "工程名称",
      value: creator.state.name,
      validateInput: (input) => {
        try {
          sanitizeScoreName(input);
          return undefined;
        } catch (error) {
          return (error as Error).message;
        }
      },
    });
    if (value !== undefined) {
      creator.state.name = value.trim();
      creator.refresh();
    }
  });
  register("cursorDaw.creatorSetFolder", async () => {
    const picked = await pickLibraryFolder("创建到哪个目录", creator.state.folder);
    if (picked === undefined) return;
    creator.state.folder = picked;
    creator.refresh();
  });
  register("cursorDaw.creatorSetBpm", async () => {
    const value = await vscode.window.showInputBox({
      title: "BPM（20–400）",
      value: String(creator.state.bpm),
      validateInput: (input) => {
        const bpm = Number(input);
        return Number.isInteger(bpm) && bpm >= 20 && bpm <= 400
          ? undefined
          : "请输入 20–400 的整数";
      },
    });
    if (value !== undefined) {
      creator.state.bpm = Number(value);
      creator.refresh();
    }
  });
  register("cursorDaw.creatorSetBars", async () => {
    const value = await vscode.window.showInputBox({
      title: "小节数（1–128）",
      value: String(creator.state.bars),
      validateInput: (input) => {
        const bars = Number(input);
        return Number.isInteger(bars) && bars >= 1 && bars <= 128
          ? undefined
          : "请输入 1–128 的整数";
      },
    });
    if (value !== undefined) {
      creator.state.bars = Number(value);
      creator.refresh();
    }
  });
  register("cursorDaw.creatorCreate", () => createScore());
  register("cursorDaw.newScore", () => createScore());

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("cursorDaw.playlist", playlist),
    vscode.window.registerTreeDataProvider("cursorDaw.recorder", recorder),
    vscode.window.registerTreeDataProvider("cursorDaw.creator", creator),
  );

  return {
    refreshPlaylist: () => playlist.refresh(),
    refreshRecorder: () => recorder.refresh(),
  };
}
