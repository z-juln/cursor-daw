import * as vscode from "vscode";
import { DEFAULT_KEY_MAP, DRUM_LABELS } from "../drums";
import { pitchPadRows } from "../padLayout";
import { TrackRole } from "../types";

const ROLE_LABEL: Record<TrackRole, string> = {
  drums: "鼓",
  keys: "钢琴",
  guitar: "吉他",
  bass: "贝斯",
};

export interface RecorderViewState {
  padEnabled: boolean;
  recordingEnabled: boolean;
  playing: boolean;
  bpm: number;
  position: string;
  audioState: string;
  keyMap: Record<string, string>;
  tracks: { name: string; role: TrackRole }[];
  armedTrackName: string;
  armedRole: TrackRole;
  octave: number;
}

class RecorderItem extends vscode.TreeItem {
  constructor(
    label: string,
    icon: string,
    command?: { command: string; args?: unknown[]; tooltip?: string },
    children: RecorderItem[] = [],
  ) {
    super(
      label,
      children.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    this.iconPath = new vscode.ThemeIcon(icon);
    this.children = children;
    if (command) {
      this.command = {
        command: command.command,
        title: label,
        arguments: command.args,
      };
      this.tooltip = command.tooltip;
    }
  }

  readonly children: RecorderItem[];
}

const group = (label: string, icon: string, children: RecorderItem[]): RecorderItem =>
  new RecorderItem(label, icon, undefined, children);

export class RecorderProvider implements vscode.TreeDataProvider<RecorderItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly getState: () => RecorderViewState) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: RecorderItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RecorderItem): RecorderItem[] {
    if (element) return element.children;
    const state = this.getState();
    return [
      group("传输", "pulse", [
        new RecorderItem(
          `Pad：${state.padEnabled ? "ON" : "OFF"}`,
          "keyboard",
          {
            command: "cursorDaw.togglePadMode",
            tooltip: "开启后键盘按键出声；Cmd+D 切换，Esc 退出",
          },
        ),
        new RecorderItem(
          `乐器：${ROLE_LABEL[state.armedRole]} · ${state.armedTrackName}`,
          "music",
          {
            command: "cursorDaw.pickTrack",
            tooltip: "切换 Pad / 录制写入的乐器轨",
          },
        ),
        ...(state.armedRole !== "drums" ? [
          new RecorderItem(`低排八度：C${state.octave}（点此升高）`, "arrow-up", {
            command: "cursorDaw.octaveUp",
            tooltip: "升高整个三排音阶",
          }),
          new RecorderItem("降八度", "arrow-down", {
            command: "cursorDaw.octaveDown",
            tooltip: "降低整个三排音阶",
          }),
        ] : []),
        new RecorderItem(
          `录制：${state.recordingEnabled ? "ON" : "OFF"}`,
          state.recordingEnabled ? "record" : "circle-outline",
          {
            command: "cursorDaw.toggleRecording",
            tooltip: "开启后敲击写入当前乐器轨",
          },
        ),
        new RecorderItem(
          state.playing ? "暂停" : "播放",
          state.playing ? "debug-pause" : "play",
          { command: "cursorDaw.playPause" },
        ),
        new RecorderItem("停止并回到开头", "debug-stop", {
          command: "cursorDaw.stop",
        }),
        new RecorderItem(`${state.bpm} BPM · 位置 ${state.position}`, "dashboard"),
        new RecorderItem(
          `音频引擎：${state.audioState}`,
          state.audioState === "running" ? "check" : "warning",
          {
            command: "cursorDaw.warmUpAudio",
            tooltip: "running 之外都发不出声",
          },
        ),
      ]),
      ...this.padGroups(state),
      group("说明", "book", [
        new RecorderItem("工程格式手册", "book", {
          command: "cursorDaw.openManual",
          args: ["skill"],
        }),
        new RecorderItem("使用说明", "question", {
          command: "cursorDaw.openManual",
          args: ["readme"],
        }),
      ]),
    ];
  }

  private padGroups(state: RecorderViewState): RecorderItem[] {
    if (state.armedRole === "drums") {
      const keys = Object.keys(DEFAULT_KEY_MAP).filter((key) => state.keyMap[key]);
      return [
        group("鼓垫（点击试听）", "circuit-board", keys.map((key) => {
          const drumId = state.keyMap[key];
          const label = DRUM_LABELS[drumId as keyof typeof DRUM_LABELS] ?? drumId;
          return new RecorderItem(`${key.toUpperCase()}　${label}`, "debug-stackframe-dot", {
            command: "cursorDaw.padHit",
            args: [key],
            tooltip: `${drumId}`,
          });
        })),
      ];
    }
    return pitchPadRows(state.octave).map((row) => group(
      row.title,
      "circuit-board",
      row.keys.map((item) => new RecorderItem(
        `${item.key.toUpperCase()}　${item.label}`,
        "debug-stackframe-dot",
        {
          command: "cursorDaw.padHit",
          args: [item.key],
        },
      )),
    ));
  }
}
