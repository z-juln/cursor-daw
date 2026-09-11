import * as path from "path";
import * as vscode from "vscode";
import {
  createLibraryScore,
  deleteLibraryScore,
  sanitizeScoreName,
} from "../library";
import { emptyTemplate } from "../serialize";
import { CreatorProvider } from "./creatorProvider";
import { PlaylistProvider, PlaylistViewState, ScoreTreeItem } from "./playlistProvider";
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
  selectKit(kitId: string): Promise<void>;
  syncLibrary(): Promise<void>;
}

function itemPath(item: ScoreTreeItem | vscode.Uri | string): string | undefined {
  if (item instanceof ScoreTreeItem) return item.absolutePath;
  if (item instanceof vscode.Uri) return item.fsPath;
  return typeof item === "string" ? item : undefined;
}

const MANUALS: Record<string, { file: string; title: string }> = {
  skill: { file: "agent/SKILL.md", title: "鼓谱格式手册" },
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

  const createScore = async (): Promise<void> => {
    const content = emptyTemplate({ bpm: creator.state.bpm, bars: creator.state.bars });
    let target: string;
    try {
      target = await createLibraryScore(root, creator.state.name, content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        void vscode.window.showErrorMessage(`创建鼓谱失败：${(error as Error).message}`);
        return;
      }
      const fileName = sanitizeScoreName(creator.state.name);
      const answer = await vscode.window.showWarningMessage(
        `${fileName} 已存在，是否覆盖？`,
        { modal: true },
        "覆盖",
      );
      if (answer !== "覆盖") return;
      target = await createLibraryScore(root, creator.state.name, content, true);
    }
    playlist.refresh();
    await openScore(target);
  };

  register("cursorDrum.openManual", async (which: string = "skill") => {
    const manual = MANUALS[which] ?? MANUALS.skill;
    const uri = vscode.Uri.joinPath(context.extensionUri, ...manual.file.split("/"));
    try {
      await vscode.commands.executeCommand("markdown.showPreview", uri);
    } catch {
      // 没有 Markdown 预览时退回纯文本打开。
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    }
  });
  register("cursorDrum.selectKit", async (kitId: string) => {
    if (typeof kitId !== "string") return;
    try {
      await host.selectKit(kitId);
      recorder.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(`切换鼓组失败：${(error as Error).message}`);
    }
  });
  register("cursorDrum.pickKit", async () => {
    const state = host.getRecorderState();
    if (!state.padEnabled) {
      void vscode.window.showInformationMessage("请先开启 Pad 模式");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      state.kits.map((kit) => ({
        label: kit.id === state.activeKitId ? `${kit.label}（当前）` : kit.label,
        description: kit.kind === "wav" ? "WAV 采样" : "合成",
        kitId: kit.id,
        picked: kit.id === state.activeKitId,
      })),
      {
        title: "Pad 鼓组",
        placeHolder: "选择 Pad 敲击使用的鼓组",
      },
    );
    if (!picked) return;
    try {
      await host.selectKit(picked.kitId);
      recorder.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(`切换鼓组失败：${(error as Error).message}`);
    }
  });
  register("cursorDrum.syncLibrary", async () => {
    try {
      await host.syncLibrary();
      playlist.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(`同步示例鼓谱失败：${(error as Error).message}`);
    }
  });
  register("cursorDrum.refreshLibrary", () => playlist.refresh());
  register("cursorDrum.openLibraryScore", openScore);
  register("cursorDrum.playLibraryScore", async (item: ScoreTreeItem) => {
    const target = itemPath(item);
    if (!target) return;
    try {
      await host.playScoreFile(target);
    } catch (error) {
      void vscode.window.showErrorMessage(`播放鼓谱失败：${(error as Error).message}`);
    }
  });
  register("cursorDrum.pauseLibraryScore", async (item: ScoreTreeItem) => {
    const target = itemPath(item);
    if (!target) return;
    try {
      await host.pauseScoreFile(target);
    } catch (error) {
      void vscode.window.showErrorMessage(`暂停鼓谱失败：${(error as Error).message}`);
    }
  });
  register("cursorDrum.deleteLibraryScore", async (item: ScoreTreeItem) => {
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
      void vscode.window.showErrorMessage(`删除鼓谱失败：${(error as Error).message}`);
    }
  });
  register("cursorDrum.creatorSetName", async () => {
    const value = await vscode.window.showInputBox({
      title: "鼓谱名称",
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
  register("cursorDrum.creatorSetBpm", async () => {
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
  register("cursorDrum.creatorSetBars", async () => {
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
  register("cursorDrum.creatorCreate", createScore);
  register("cursorDrum.newScore", createScore);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("cursorDrum.playlist", playlist),
    vscode.window.registerTreeDataProvider("cursorDrum.recorder", recorder),
    vscode.window.registerTreeDataProvider("cursorDrum.creator", creator),
  );

  return {
    refreshPlaylist: () => playlist.refresh(),
    refreshRecorder: () => recorder.refresh(),
  };
}
