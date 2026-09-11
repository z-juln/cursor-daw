import * as vscode from "vscode";
import { DEFAULT_KEY_MAP, DRUM_LABELS } from "../drums";
import { KitDefinition } from "../kits/registry";

export interface RecorderViewState {
  padEnabled: boolean;
  recordingEnabled: boolean;
  playing: boolean;
  bpm: number;
  position: string;
  /** 原生音频上下文状态，running 之外都发不出声。 */
  audioState: string;
  keyMap: Record<string, string>;
  activeKitId: string;
  kits: KitDefinition[];
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
            command: "cursorDrum.togglePadMode",
            tooltip: "开启后按键直接出声；默认 Cmd+D 切换（非编辑器区域），Esc 退出；可在键盘快捷方式中修改",
          },
        ),
        new RecorderItem(
          `录制：${state.recordingEnabled ? "ON" : "OFF"}`,
          state.recordingEnabled ? "record" : "circle-outline",
          {
            command: "cursorDrum.toggleRecording",
            tooltip: "开启后敲击会写入当前 .drum 文件",
          },
        ),
        new RecorderItem(
          state.playing ? "暂停" : "播放",
          state.playing ? "debug-pause" : "play",
          { command: "cursorDrum.playPause" },
        ),
        new RecorderItem("停止并回到开头", "debug-stop", {
          command: "cursorDrum.stop",
        }),
        new RecorderItem(`${state.bpm} BPM · 位置 ${state.position}`, "dashboard"),
        new RecorderItem(
          `音频引擎：${state.audioState}`,
          state.audioState === "running" ? "check" : "warning",
          {
            command: "cursorDrum.warmUpAudio",
            tooltip: "running 之外都发不出声，点击重新启动音频引擎",
          },
        ),
      ]),
      group("鼓组（Pad）", "library", this.kits(state)),
      group("鼓垫（点击试听）", "circuit-board", this.pads(state)),
      group("说明", "book", [
        new RecorderItem("鼓谱格式手册", "book", {
          command: "cursorDrum.openManual",
          args: ["skill"],
          tooltip: "纵向是鼓件、横向是 step 的纯文本格式规范",
        }),
        new RecorderItem("使用说明与键位", "question", {
          command: "cursorDrum.openManual",
          args: ["readme"],
        }),
      ]),
    ];
  }

  /** 点击切换 Pad 使用的鼓组；播放列表仍按各文件 kit: 头播放。 */
  private kits(state: RecorderViewState): RecorderItem[] {
    return state.kits.map((kit) => new RecorderItem(
      kit.id === state.activeKitId ? `${kit.label} ✓` : kit.label,
      kit.id === state.activeKitId ? "check" : "circle-outline",
      {
        command: "cursorDrum.selectKit",
        args: [kit.id],
        tooltip: kit.kind === "wav" ? "内置 WAV 采样" : "内置合成音色",
      },
    ));
  }

  /** 每个鼓垫都可点击发声，这样不依赖键位就能确认音频通路是否正常。 */
  private pads(state: RecorderViewState): RecorderItem[] {
    const keys = Object.keys(DEFAULT_KEY_MAP).filter((key) => state.keyMap[key]);
    return keys.map((key) => {
      const drumId = state.keyMap[key];
      const label = DRUM_LABELS[drumId as keyof typeof DRUM_LABELS] ?? drumId;
      return new RecorderItem(
        `${key.toUpperCase()}　${label}`,
        "debug-stackframe-dot",
        {
          command: "cursorDrum.padHit",
          args: [key],
          tooltip: `${drumId}　按 ${key.toUpperCase()} 或点此试听`,
        },
      );
    });
  }
}
