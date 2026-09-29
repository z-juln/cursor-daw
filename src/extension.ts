import * as path from "path";
import * as vscode from "vscode";
import { getKeyMap, getLoop, getPadModeOnOpen, isDrumEditor } from "./config";
import { DawEngine } from "./engine";
import { DEFAULT_CHANNEL, DEFAULT_PROGRAM, DRUM_TO_GM } from "./midi/gm";
import { encodeMidi } from "./midi/encode";
import { decodeMidiToSession } from "./midi/decode";
import { createNativeContext } from "./nativeContext";
import { defaultLibraryRoot, ensureLibrary, readLibraryScore } from "./library";
import { columnToStep } from "./mapper";
import { resolvePitchPad } from "./padLayout";
import { PadMode } from "./padMode";
import { parseSession } from "./parser";
import { midiToPitch } from "./pitch";
import { RecordingMode } from "./recordingMode";
import { scheduleSession, scoreDurationSec, stepDurationSec } from "./schedule";
import { emptyTemplate, formatScoreText, formatSessionText, writeHit } from "./serialize";
import { registerSidebar, SidebarController } from "./sidebar/registerSidebar";
import {
  createTransport,
  positionAt,
  reduceTransport,
  TransportEngine,
  TransportEvent,
} from "./transport";
import { Session, TrackRole } from "./types";

interface PlaybackSource {
  uri?: vscode.Uri;
  text: string;
}

let engine: DawEngine | undefined;

const nowSec = (): number => Date.now() / 1000;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const sf2Path = vscode.Uri.joinPath(context.extensionUri, "media", "soundfonts", "gm.sf3").fsPath;
  const audio = new DawEngine(createNativeContext, { sf2Path });
  engine = audio;
  const padMode = new PadMode();
  const recordingMode = new RecordingMode(
    (key, value) => vscode.commands.executeCommand("setContext", key, value),
  );
  const output = vscode.window.createOutputChannel("Cursor DAW");
  const playhead = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editorCursor.foreground"),
  });
  let transport: TransportEngine = createTransport({ loop: getLoop() });
  let currentPosition = 0;
  let currentDuration = 0;
  let source: PlaybackSource | undefined;
  let sessionCache: Session | undefined;
  let armedTrackName = "drums";
  let armedFallbackRole: TrackRole = "drums";
  /**
   * Pad 基准八度（低排 zxcvbnm 的 C）。
   * 三排共跨 3 个八度：钢琴从 C4（中央 C）；吉他 C2；贝斯 C1。
   */
  const DEFAULT_OCTAVE: Record<TrackRole, number> = {
    drums: 4,
    keys: 4,
    guitar: 2,
    bass: 1,
  };
  let octave = DEFAULT_OCTAVE.keys;
  let sidebar: SidebarController | undefined;
  const libraryRoot = defaultLibraryRoot();

  const ROLE_PICK: { role: TrackRole; label: string; name: string }[] = [
    { role: "drums", label: "鼓", name: "drums" },
    { role: "keys", label: "钢琴", name: "piano" },
    { role: "guitar", label: "吉他", name: "guitar" },
    { role: "bass", label: "贝斯", name: "bass" },
  ];

  const applyRoleOctave = (role: TrackRole): void => {
    if (role === "drums") return;
    octave = DEFAULT_OCTAVE[role];
  };

  const bundledExamplesDir = vscode.Uri.joinPath(context.extensionUri, "examples").fsPath;
  try {
    const copied = await ensureLibrary(libraryRoot, bundledExamplesDir);
    if (copied.length > 0) output.appendLine(`已同步 ${copied.length} 首示例`);
  } catch (error) {
    void vscode.window.showErrorMessage(`初始化谱库失败：${(error as Error).message}`);
  }

  const activeDawEditor = (): vscode.TextEditor | undefined => {
    const editor = vscode.window.activeTextEditor;
    return isDrumEditor(editor) ? editor : undefined;
  };

  const currentSource = (): PlaybackSource | undefined => {
    const editor = activeDawEditor();
    if (editor) return { uri: editor.document.uri, text: editor.document.getText() };
    return source;
  };

  const currentSession = (): Session | undefined => {
    const text = currentSource()?.text;
    if (!text) return sessionCache;
    sessionCache = parseSession(text);
    if (!sessionCache.tracks.some((track) => track.name === armedTrackName)) {
      armedTrackName = sessionCache.tracks[0]?.name ?? "drums";
      armedFallbackRole = sessionCache.tracks[0]?.role ?? "drums";
    }
    return sessionCache;
  };

  const armedTrack = () => currentSession()?.tracks.find((track) => track.name === armedTrackName);

  const armedRole = (): TrackRole => armedTrack()?.role ?? armedFallbackRole;

  const positionLabel = (): { bpm: number; label: string } => {
    const session = currentSession();
    if (!session) return { bpm: 120, label: "1.1" };
    const step = Math.floor(currentPosition / stepDurationSec(session));
    const bar = Math.floor(step / session.stepsPerBar) + 1;
    const beat = Math.floor((step % session.stepsPerBar) / (session.stepsPerBar / 4)) + 1;
    return { bpm: session.bpm, label: `${bar}.${beat}` };
  };

  const updateStatus = (): void => {
    sidebar?.refreshRecorder();
    sidebar?.refreshPlaylist();
  };

  let audioBroken = false;
  const withAudio = (action: () => void): void => {
    if (audioBroken) return;
    try {
      action();
    } catch (error) {
      audioBroken = true;
      void vscode.window.showErrorMessage(`音频引擎失败：${(error as Error).message}`);
    }
  };

  audio.onTick = (positionSec) => {
    currentPosition = positionSec;
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
    const session = parseSession(next.text);
    session.warnings.forEach((warning) => {
      const prefix = warning.line === undefined ? "" : `第 ${warning.line + 1} 行：`;
      output.appendLine(`${prefix}${warning.message}`);
    });
    if (session.unsupportedVersion) {
      void vscode.window.showErrorMessage("此工程版本暂不支持");
      return false;
    }
    source = next;
    sessionCache = session;
    if (!session.tracks.some((track) => track.name === armedTrackName)) {
      armedTrackName = session.tracks[0]?.name ?? "drums";
      armedFallbackRole = session.tracks[0]?.role ?? "drums";
    } else {
      armedFallbackRole = session.tracks.find((t) => t.name === armedTrackName)?.role
        ?? armedFallbackRole;
    }
    currentDuration = scoreDurationSec(session);
    transport = { ...transport, loop: getLoop() };
    const notes = scheduleSession(session);
    try {
      await audio.loadSession(session, notes, currentDuration, transport.loop);
    } catch (error) {
      void vscode.window.showErrorMessage(`加载音频失败：${(error as Error).message}`);
      return false;
    }
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
        void vscode.window.showWarningMessage("请先打开 .daw，或在播放列表中选择");
        return;
      }
      const editor = activeDawEditor();
      if (!explicit && editor && next.text.trim() === "") {
        await replaceDocument(editor, emptyTemplate());
        next = { uri: editor.document.uri, text: editor.document.getText() };
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
    }
    updateStatus();
  };

  const register = (command: string, handler: (...args: any[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));
  };

  const resolvePadNote = (key: string): {
    note: number;
    velocity: number;
    channel: number;
    program: number;
    rowId: string;
    role: TrackRole;
  } | undefined => {
    const track = armedTrack();
    const role = track?.role ?? armedFallbackRole;
    const channel = track?.channel ?? DEFAULT_CHANNEL[role];
    const program = track?.program ?? DEFAULT_PROGRAM[role];
    if (role === "drums") {
      const drumId = getKeyMap()[key];
      if (!drumId) return undefined;
      const note = DRUM_TO_GM[drumId];
      if (note === undefined) return undefined;
      return { note, velocity: 100, channel, program, rowId: drumId, role };
    }
    const pitch = resolvePitchPad(key, octave);
    if (!pitch) return undefined;
    return {
      note: pitch.midi,
      velocity: 100,
      channel,
      program,
      rowId: midiToPitch(pitch.midi),
      role,
    };
  };

  register("cursorDaw.enablePadMode", async () => {
    if (padMode.enabled) return;
    await padMode.set(true);
    withAudio(() => audio.warmUp());
    updateStatus();
  });
  register("cursorDaw.togglePadMode", async () => {
    await padMode.toggle();
    if (padMode.enabled) withAudio(() => audio.warmUp());
    updateStatus();
  });
  register("cursorDaw.exitPadMode", async () => {
    if (!padMode.enabled) return;
    await padMode.set(false);
    await applyTransport({ type: "stop" });
    updateStatus();
  });
  register("cursorDaw.toggleRecording", async () => {
    await recordingMode.toggle();
    updateStatus();
  });
  register("cursorDaw.warmUpAudio", () => {
    audioBroken = false;
    withAudio(() => audio.warmUp());
    updateStatus();
  });
  register("cursorDaw.formatScore", async () => {
    const editor = activeDawEditor();
    if (editor) await replaceDocument(editor, formatScoreText(editor.document.getText()));
  });
  register("cursorDaw.playPause", () => applyTransport({ type: "playPause" }));
  register("cursorDaw.restart", () => applyTransport({ type: "restart" }));
  register("cursorDaw.stop", () => applyTransport({ type: "stop" }));
  register("cursorDaw.padHit", async (key: string) => {
    const resolved = resolvePadNote(String(key).toLowerCase());
    if (!resolved) return;
    // 侧边栏点击始终可试听；键盘出声仍由 keybinding 的 padMode when 子句约束
    withAudio(() => audio.noteOn(resolved.note, resolved.velocity, resolved.channel, resolved.program));
    if (!recordingMode.enabled) return;
    const editor = activeDawEditor();
    if (!editor) {
      void vscode.window.showWarningMessage("录制需要先打开 .daw 工程");
      return;
    }
    if (!armedTrack()) {
      void vscode.window.showWarningMessage(`当前工程没有轨「${armedTrackName}」，请先切换乐器`);
      return;
    }
    const session = parseSession(editor.document.getText() || emptyTemplate());
    const step = Math.max(
      0,
      Math.min(
        Math.floor(currentPosition / stepDurationSec(session)),
        Math.max(0, ...session.tracks.flatMap((t) => t.rows.map((r) => r.cells.length))) || 31,
      ),
    );
    const caretStep = columnToStep(
      editor.document.lineAt(editor.selection.active.line).text,
      editor.selection.active.character,
    );
    const targetStep = Number.isFinite(caretStep) ? caretStep : step;
    await replaceDocument(
      editor,
      writeHit(editor.document.getText(), resolved.rowId, targetStep, armedTrackName),
    );
  });
  register("cursorDaw.pickTrack", async () => {
    const session = currentSession();
    const roleLabel: Record<TrackRole, string> = {
      drums: "鼓",
      keys: "钢琴",
      guitar: "吉他",
      bass: "贝斯",
    };
    const items = session?.tracks.length
      ? session.tracks.map((track) => ({
        label: track.name === armedTrackName
          ? `$(check) ${roleLabel[track.role]} · ${track.name}`
          : `${roleLabel[track.role]} · ${track.name}`,
        description: track.role,
        name: track.name,
        role: track.role,
      }))
      : ROLE_PICK.map((item) => ({
        label: item.role === armedFallbackRole
          ? `$(check) ${item.label}`
          : item.label,
        description: "未打开工程时仅试听",
        name: item.name,
        role: item.role,
      }));
    const picked = await vscode.window.showQuickPick(items, {
      title: "切换乐器",
      placeHolder: "Pad 与录制将使用该轨",
    });
    if (!picked) return;
    armedTrackName = picked.name;
    armedFallbackRole = picked.role;
    applyRoleOctave(picked.role);
    updateStatus();
  });
  register("cursorDaw.octaveUp", () => {
    // 基准八度上移；三排最高到约 C7
    const max = armedRole() === "bass" ? 3 : 5;
    octave = Math.min(max, octave + 1);
    updateStatus();
  });
  register("cursorDaw.octaveDown", () => {
    const min = armedRole() === "bass" ? 0 : 1;
    octave = Math.max(min, octave - 1);
    updateStatus();
  });
  register("cursorDaw.seek", (sec: number) => {
    if (!source || !Number.isFinite(sec)) return;
    const target = Math.max(0, Math.min(Number(sec), currentDuration || 0));
    const wall = nowSec();
    currentPosition = target;
    if (transport.status === "playing") {
      transport = {
        ...transport,
        status: "playing",
        anchorScoreSec: target,
        anchorWallSec: wall,
      };
      withAudio(() => audio.seek(target));
    } else if (transport.status === "paused") {
      transport = {
        ...transport,
        anchorScoreSec: target,
        anchorWallSec: wall,
      };
      withAudio(() => audio.seek(target));
    } else {
      // stopped：预览位置，下次播放从此处开始可再点播放
      transport = {
        ...transport,
        status: "paused",
        anchorScoreSec: target,
        anchorWallSec: wall,
      };
      withAudio(() => audio.seek(target));
    }
    updateStatus();
  });
  register("cursorDaw.exportMidi", async () => {
    const text = currentSource()?.text;
    if (!text) {
      void vscode.window.showWarningMessage("没有可导出的工程");
      return;
    }
    const session = parseSession(text);
    const bytes = encodeMidi(session, scheduleSession(session));
    const uri = await vscode.window.showSaveDialog({
      filters: { MIDI: ["mid", "midi"] },
      defaultUri: source?.uri
        ? vscode.Uri.file(source.uri.fsPath.replace(/\.daw$/i, ".mid"))
        : undefined,
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, bytes);
    void vscode.window.showInformationMessage(`已导出 ${path.basename(uri.fsPath)}`);
  });
  register("cursorDaw.importMidi", async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { MIDI: ["mid", "midi"] },
    });
    if (!picked?.[0]) return;
    const bytes = await vscode.workspace.fs.readFile(picked[0]);
    const session = decodeMidiToSession(bytes);
    const content = formatSessionText(session);
    const base = path.basename(picked[0].fsPath).replace(/\.(mid|midi)$/i, "");
    const target = path.join(libraryRoot, `${base}.daw`);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(target), Buffer.from(content, "utf8"));
    sidebar?.refreshPlaylist();
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target));
  });

  context.subscriptions.push(
    playhead,
    output,
    { dispose: () => audio.dispose() },
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (isDrumEditor(editor) && getPadModeOnOpen()) void padMode.set(true);
      updateStatus();
    }),
  );

  sidebar = registerSidebar(context, libraryRoot, {
    getRecorderState: () => {
      const { bpm, label } = positionLabel();
      const session = currentSession();
      return {
        padEnabled: padMode.enabled,
        recordingEnabled: recordingMode.enabled,
        playing: transport.status === "playing",
        bpm,
        position: label,
        positionSec: currentPosition,
        durationSec: currentDuration,
        audioState: audioBroken
          ? "启动失败"
          : audio.contextState === "closed" ? "未启动" : audio.contextState,
        keyMap: getKeyMap(),
        tracks: (session?.tracks ?? []).map((item) => ({ name: item.name, role: item.role })),
        armedTrackName,
        armedRole: armedRole(),
        octave,
      };
    },
    syncLibrary: async () => {
      const copied = await ensureLibrary(libraryRoot, bundledExamplesDir);
      void vscode.window.showInformationMessage(
        copied.length === 0
          ? "示例已全部存在"
          : `已同步 ${copied.length} 首示例到 ~/.cursor-daw`,
      );
      sidebar?.refreshPlaylist();
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
  withAudio(() => audio.warmUp());
}

export function deactivate(): void {
  engine?.dispose();
  engine = undefined;
}
