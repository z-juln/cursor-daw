import * as path from "path";
import * as vscode from "vscode";
import { getKeyMap, getLoop, getPadModeOnOpen, isDrumEditor } from "./config";
import { canonicalDrumId } from "./drums";
import { DrumEngine } from "./engine";
import { KitMode } from "./kitMode";
import { KIT_DEFINITIONS } from "./kits/registry";
import { createNativeContext } from "./nativeContext";
import { defaultLibraryRoot, ensureLibrary, readLibraryScore } from "./library";
import { columnToStep, stepToColumn } from "./mapper";
import { PadMode } from "./padMode";
import { parseScore } from "./parser";
import { RecordingMode } from "./recordingMode";
import { scheduleNotes, scoreDurationSec, stepDurationSec } from "./schedule";
import { emptyTemplate, formatScoreText, upsertRuler, writeHit } from "./serialize";
import { registerSidebar, SidebarController } from "./sidebar/registerSidebar";
import {
  createTransport,
  positionAt,
  reduceTransport,
  TransportEngine,
  TransportEvent,
} from "./transport";

interface PlaybackSource {
  uri?: vscode.Uri;
  text: string;
}

let engine: DrumEngine | undefined;

const nowSec = (): number => Date.now() / 1000;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const kitsRoot = vscode.Uri.joinPath(context.extensionUri, "media", "kits").fsPath;
  const audio = new DrumEngine(createNativeContext, { kitsRoot });
  engine = audio;
  const padMode = new PadMode();
  const kitMode = new KitMode();
  audio.setPadKit(kitMode.kitId);
  const recordingMode = new RecordingMode(
    (key, value) => vscode.commands.executeCommand("setContext", key, value),
  );
  const output = vscode.window.createOutputChannel("Cursor Drum");
  const playhead = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editorCursor.foreground"),
  });
  let transport: TransportEngine = createTransport({ loop: getLoop() });
  let currentPosition = 0;
  let currentDuration = 0;
  let source: PlaybackSource | undefined;
  let reloadTimer: NodeJS.Timeout | undefined;
  let sidebar: SidebarController | undefined;
  const libraryRoot = defaultLibraryRoot();

  const bundledExamplesDir = vscode.Uri.joinPath(context.extensionUri, "examples").fsPath;
  let librarySynced = false;
  const syncBundledExamples = async (): Promise<number> => {
    const copied = await ensureLibrary(libraryRoot, bundledExamplesDir);
    librarySynced = true;
    sidebar?.refreshPlaylist();
    return copied.length;
  };
  try {
    const copied = await syncBundledExamples();
    if (copied.length > 0) {
      output.appendLine(`已同步 ${copied.length} 首示例鼓谱：${copied.join("、")}`);
    }
  } catch (error) {
    void vscode.window.showErrorMessage(`初始化鼓谱库失败：${(error as Error).message}`);
  }

  const activeDrumEditor = (): vscode.TextEditor | undefined => {
    const editor = vscode.window.activeTextEditor;
    return isDrumEditor(editor) ? editor : undefined;
  };

  const currentSource = (): PlaybackSource | undefined => {
    const editor = activeDrumEditor();
    if (editor) return { uri: editor.document.uri, text: editor.document.getText() };
    return source;
  };

  const positionLabel = (): { bpm: number; label: string } => {
    const text = currentSource()?.text;
    if (!text) return { bpm: 120, label: "1.1" };
    const score = parseScore(text);
    const step = score.tracks.length > 0
      ? Math.floor(currentPosition / stepDurationSec(score))
      : 0;
    const bar = Math.floor(step / score.stepsPerBar) + 1;
    const beat = Math.floor((step % score.stepsPerBar) / (score.stepsPerBar / 4)) + 1;
    return { bpm: score.bpm, label: `${bar}.${beat}` };
  };

  const updateStatus = (): void => {
    sidebar?.refreshRecorder();
    sidebar?.refreshPlaylist();
  };

  let audioBroken = false;
  /** 原生后端只在第一次使用时创建上下文，失败只提示一次，不在每次敲击时刷屏。 */
  const withAudio = (action: () => void): void => {
    if (audioBroken) return;
    try {
      action();
    } catch (error) {
      audioBroken = true;
      void vscode.window.showErrorMessage(
        `音频引擎启动失败：${(error as Error).message}`,
      );
    }
  };

  const showWarnings = (text: string): void => {
    output.clear();
    parseScore(text).warnings.forEach((warning) => {
      const prefix = warning.line === undefined ? "" : `第 ${warning.line + 1} 行：`;
      output.appendLine(`${prefix}${warning.message}`);
    });
  };

  const decorateAt = (positionSec: number): void => {
    const editor = vscode.window.activeTextEditor;
    if (
      !isDrumEditor(editor)
      || !source?.uri
      || editor.document.uri.toString() !== source.uri.toString()
    ) return;
    const score = parseScore(editor.document.getText());
    if (score.tracks.length === 0) return;
    const step = Math.floor(positionSec / stepDurationSec(score));
    const ranges = score.tracks.flatMap((track) => {
      const localStep = track.cells.length > 0 ? step % track.cells.length : 0;
      const line = editor.document.lineAt(track.lineIndex).text;
      const column = stepToColumn(line, localStep);
      return column < line.length
        ? [new vscode.Range(track.lineIndex, column, track.lineIndex, column + 1)]
        : [];
    });
    editor.setDecorations(playhead, ranges);
  };

  audio.onTick = (positionSec) => {
    currentPosition = positionSec;
    decorateAt(positionSec);
    updateStatus();
  };

  const replaceDocument = async (
    editor: vscode.TextEditor,
    text: string,
  ): Promise<boolean> => editor.edit((builder) => {
    const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
    builder.replace(
      new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length),
      text,
    );
  });

  const loadSource = async (next: PlaybackSource): Promise<boolean> => {
    const score = parseScore(next.text);
    showWarnings(next.text);
    if (score.unsupportedVersion) {
      void vscode.window.showErrorMessage("此鼓谱版本暂不支持播放");
      return false;
    }
    if (score.tracks.every((track) => track.cells.every((cell) => cell === "rest"))) {
      void vscode.window.showInformationMessage("当前是空谱");
    }
    source = next;
    currentDuration = scoreDurationSec(score);
    transport = { ...transport, loop: getLoop() };
    audio.setPlaybackKit(score.kit);
    withAudio(() => audio.warmUp(score.kit));
    audio.load({
      notes: scheduleNotes(score),
      durationSec: currentDuration,
      loop: transport.loop,
    });
    return true;
  };

  const applyTransport = async (
    event: TransportEvent,
    explicit?: PlaybackSource,
  ): Promise<void> => {
    if (event.type === "pause" || event.type === "stop") {
      if (!source) return;
    } else {
      let next = explicit ?? currentSource();
      if (!next) {
        void vscode.window.showWarningMessage("请先打开鼓谱，或在播放列表中选择一首");
        return;
      }
      const editor = activeDrumEditor();
      if (!explicit && editor && next.text.trim() === "") {
        await replaceDocument(editor, emptyTemplate());
        next = { uri: editor.document.uri, text: editor.document.getText() };
        void vscode.window.showInformationMessage("已为当前空文件插入鼓谱模板");
      }
      if (!(await loadSource(next))) return;
    }

    const time = nowSec();
    transport = reduceTransport(transport, event, time);
    currentPosition = positionAt(transport, time, currentDuration);
    if (transport.status === "playing") {
      withAudio(() => audio.play(currentPosition));
    } else if (transport.status === "paused") {
      withAudio(() => audio.pause());
    } else {
      currentPosition = 0;
      withAudio(() => audio.stop());
      decorateAt(0);
    }
    updateStatus();
  };

  const register = (command: string, handler: (...args: any[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));
  };

  const warmPadIfEnabled = (): void => {
    if (padMode.enabled) withAudio(() => audio.warmUp(kitMode.kitId));
  };

  register("cursorDrum.enablePadMode", async () => {
    if (padMode.enabled) return;
    await padMode.set(true);
    updateStatus();
    warmPadIfEnabled();
  });
  register("cursorDrum.togglePadMode", async () => {
    await padMode.toggle();
    updateStatus();
    warmPadIfEnabled();
  });
  register("cursorDrum.exitPadMode", async () => {
    if (!padMode.enabled) return;
    await padMode.set(false);
    await applyTransport({ type: "stop" });
    updateStatus();
  });
  register("cursorDrum.toggleRecording", async () => {
    await recordingMode.toggle();
    updateStatus();
  });
  register("cursorDrum.warmUpAudio", () => {
    audioBroken = false;
    withAudio(() => audio.warmUp());
    updateStatus();
    if (!audioBroken) {
      void vscode.window.showInformationMessage(
        `音频引擎：${audio.contextState}`,
      );
    }
  });
  register("cursorDrum.formatScore", async () => {
    const editor = activeDrumEditor();
    if (editor) await replaceDocument(editor, formatScoreText(editor.document.getText()));
  });
  register("cursorDrum.insertRuler", async () => {
    const editor = activeDrumEditor();
    if (editor) await replaceDocument(editor, upsertRuler(editor.document.getText()));
  });
  register("cursorDrum.playPause", async () => {
    await applyTransport({ type: "playPause" });
  });
  register("cursorDrum.restart", async () => {
    await applyTransport({ type: "restart" });
  });
  register("cursorDrum.stop", async () => {
    await applyTransport({ type: "stop" });
  });
  register("cursorDrum.padHit", async (key: string) => {
    if (typeof key !== "string") return;
    const configuredId = getKeyMap()[key.toLowerCase()];
    const drumId = configuredId ? canonicalDrumId(configuredId) : null;
    if (!drumId) return;
    withAudio(() => audio.noteOn(drumId, 100));

    const editor = activeDrumEditor();
    if (!recordingMode.enabled || !editor) return;

    const score = parseScore(editor.document.getText());
    let step = 0;
    if (transport.status === "playing") {
      step = Math.floor(currentPosition / stepDurationSec(score));
    } else {
      const cursorLine = editor.selection.active.line;
      const trackLine = score.tracks.some((track) => track.lineIndex === cursorLine)
        ? cursorLine
        : score.tracks[0]?.lineIndex;
      if (trackLine !== undefined) {
        step = columnToStep(
          editor.document.lineAt(trackLine).text,
          editor.selection.active.character,
        );
      }
    }
    await replaceDocument(editor, writeHit(editor.document.getText(), drumId, step));
  });

  context.subscriptions.push(
    { dispose: () => audio.dispose() },
    output,
    playhead,
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (isDrumEditor(editor) && getPadModeOnOpen()) await padMode.set(true);
      updateStatus();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        transport.status !== "playing"
        || !source?.uri
        || event.document.uri.toString() !== source.uri.toString()
      ) return;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(async () => {
        if (await loadSource({ uri: event.document.uri, text: event.document.getText() })) {
          withAudio(() => audio.play(currentPosition));
        }
      }, 250);
    }),
  );

  sidebar = registerSidebar(context, libraryRoot, {
    getRecorderState: () => {
      const { bpm, label } = positionLabel();
      return {
        padEnabled: padMode.enabled,
        recordingEnabled: recordingMode.enabled,
        playing: transport.status === "playing",
        bpm,
        position: label,
        audioState: audioBroken
          ? "启动失败"
          : audio.contextState === "closed" ? "未启动" : audio.contextState,
        keyMap: getKeyMap(),
        activeKitId: kitMode.kitId,
        kits: KIT_DEFINITIONS,
      };
    },
    selectKit: async (kitId) => {
      await kitMode.set(kitId);
      audio.setPadKit(kitMode.kitId);
      withAudio(() => audio.warmUp(kitMode.kitId));
      updateStatus();
    },
    syncLibrary: async () => {
      const copied = await syncBundledExamples();
      if (copied === 0) {
        void vscode.window.showInformationMessage("示例鼓谱已全部存在，未覆盖已有文件");
      } else {
        void vscode.window.showInformationMessage(`已同步 ${copied} 首示例鼓谱到 ~/.cursor-drum`);
      }
    },
    getPlaylistState: () => ({
      currentPath: source?.uri?.fsPath ? path.normalize(source.uri.fsPath) : undefined,
      status: transport.status,
    }),
    playScoreFile: async (absolutePath) => {
      const current = source?.uri?.fsPath;
      if (
        current
        && path.normalize(current) === path.normalize(absolutePath)
        && transport.status === "paused"
      ) {
        await applyTransport({ type: "play" });
        return;
      }
      const text = await readLibraryScore(libraryRoot, absolutePath);
      await applyTransport(
        { type: "restart" },
        { uri: vscode.Uri.file(absolutePath), text },
      );
    },
    pauseScoreFile: async (absolutePath) => {
      const current = source?.uri?.fsPath;
      if (
        !current
        || path.normalize(current) !== path.normalize(absolutePath)
        || transport.status !== "playing"
      ) return;
      await applyTransport({ type: "pause" });
    },
  });
  updateStatus();
  if (!librarySynced) void syncBundledExamples().then(() => updateStatus());
  withAudio(() => audio.warmUpAllKits());
}

export function deactivate(): void {
  engine?.dispose();
  engine = undefined;
}
