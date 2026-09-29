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
  positionSec: number;
  durationSec: number;
  audioState: string;
  keyMap: Record<string, string>;
  tracks: { name: string; role: TrackRole }[];
  armedTrackName: string;
  armedRole: TrackRole;
  octave: number;
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export class RecorderProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(private readonly getState: () => RecorderViewState) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.render(this.getState());
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "command" && typeof message.command === "string") {
        await vscode.commands.executeCommand(message.command, ...(message.args ?? []));
      }
      if (message.type === "seek" && Number.isFinite(message.sec)) {
        await vscode.commands.executeCommand("cursorDaw.seek", Number(message.sec));
      }
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.refresh();
    });
  }

  refresh(): void {
    if (!this.view) return;
    const state = this.getState();
    void this.view.webview.postMessage({ type: "state", state: this.serialize(state) });
  }

  private serialize(state: RecorderViewState) {
    return {
      ...state,
      roleLabel: ROLE_LABEL[state.armedRole],
      clock: `${formatClock(state.positionSec)} / ${formatClock(state.durationSec)}`,
      progressMax: Math.max(0.001, state.durationSec),
      pads: this.pads(state),
    };
  }

  private pads(state: RecorderViewState): { key: string; label: string; group: string }[] {
    if (state.armedRole === "drums") {
      return Object.keys(DEFAULT_KEY_MAP)
        .filter((key) => state.keyMap[key])
        .map((key) => {
          const drumId = state.keyMap[key];
          const label = DRUM_LABELS[drumId as keyof typeof DRUM_LABELS] ?? drumId;
          return { key, label: `${key.toUpperCase()}　${label}`, group: "鼓垫" };
        });
    }
    return pitchPadRows(state.octave).flatMap((row) =>
      row.keys.map((item) => ({
        key: item.key,
        label: `${item.key.toUpperCase()}　${item.label}`,
        group: row.title,
      })),
    );
  }

  private render(state: RecorderViewState): string {
    const initial = JSON.stringify(this.serialize(state));
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    color-scheme: light dark;
    --gap: 8px;
    --radius: 6px;
  }
  body {
    margin: 0;
    padding: 10px 12px 16px;
    font: 12px/1.4 var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: transparent;
  }
  h3 {
    margin: 14px 0 8px;
    font-size: 11px;
    font-weight: 600;
    opacity: 0.75;
    text-transform: none;
  }
  h3:first-child { margin-top: 0; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; align-items: center; }
  button, .chip {
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border-radius: var(--radius);
    padding: 4px 8px;
    cursor: pointer;
    font: inherit;
  }
  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  button.on {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  button:hover { filter: brightness(1.08); }
  .meta { opacity: 0.8; flex: 1; min-width: 120px; }
  .seek-wrap { width: 100%; margin: 4px 0 2px; }
  input[type="range"] {
    width: 100%;
    accent-color: var(--vscode-button-background);
    cursor: pointer;
  }
  .clock { font-variant-numeric: tabular-nums; opacity: 0.85; }
  .pads { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .pads button { text-align: left; padding: 6px 8px; }
  .group-label { grid-column: 1 / -1; margin-top: 4px; opacity: 0.65; font-size: 11px; }
  a.link { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; }
  a.link:hover { text-decoration: underline; }
</style>
</head>
<body>
  <h3>传输</h3>
  <div class="row">
    <button id="pad" type="button">Pad</button>
    <button id="rec" type="button">录制</button>
    <button id="play" class="primary" type="button">播放</button>
    <button id="stop" type="button">停止</button>
  </div>
  <div class="row">
    <button id="track" type="button">乐器</button>
    <button id="octUp" type="button">升八度</button>
    <button id="octDown" type="button">降八度</button>
  </div>
  <div class="row">
    <span class="meta" id="meta"></span>
  </div>
  <div class="seek-wrap">
    <input id="seek" type="range" min="0" max="1" step="0.01" value="0" />
  </div>
  <div class="row">
    <span class="clock" id="clock">0:00 / 0:00</span>
    <span class="meta" id="pos"></span>
  </div>
  <div class="row">
    <button id="audio" type="button">音频引擎</button>
  </div>

  <h3 id="padsTitle">垫子</h3>
  <div class="pads" id="pads"></div>

  <h3>说明</h3>
  <div class="row">
    <a class="link" data-cmd="cursorDaw.openManual" data-args='["skill"]'>工程格式手册</a>
    <a class="link" data-cmd="cursorDaw.openManual" data-args='["readme"]'>使用说明</a>
  </div>

<script>
const vscode = acquireVsCodeApi();
let state = ${initial};
let dragging = false;

const $ = (id) => document.getElementById(id);
const post = (type, payload = {}) => vscode.postMessage({ type, ...payload });
const cmd = (command, ...args) => post('command', { command, args });

function render() {
  const s = state;
  $('pad').textContent = 'Pad：' + (s.padEnabled ? 'ON' : 'OFF');
  $('pad').classList.toggle('on', s.padEnabled);
  $('rec').textContent = '录制：' + (s.recordingEnabled ? 'ON' : 'OFF');
  $('rec').classList.toggle('on', s.recordingEnabled);
  $('play').textContent = s.playing ? '暂停' : '播放';
  $('track').textContent = '乐器：' + s.roleLabel + ' · ' + s.armedTrackName;
  $('octUp').style.display = s.armedRole === 'drums' ? 'none' : '';
  $('octDown').style.display = s.armedRole === 'drums' ? 'none' : '';
  $('octUp').textContent = '低排 C' + s.octave + ' ↑';
  $('meta').textContent = s.bpm + ' BPM · 引擎 ' + s.audioState;
  $('pos').textContent = '位置 ' + s.position;
  $('clock').textContent = s.clock;
  $('audio').textContent = '音频引擎：' + s.audioState;
  if (!dragging) {
    $('seek').max = String(s.progressMax);
    $('seek').value = String(Math.min(s.positionSec, s.progressMax));
  }
  const pads = $('pads');
  pads.innerHTML = '';
  let lastGroup = '';
  for (const pad of s.pads || []) {
    if (pad.group !== lastGroup) {
      lastGroup = pad.group;
      const g = document.createElement('div');
      g.className = 'group-label';
      g.textContent = pad.group;
      pads.appendChild(g);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = pad.label;
    b.addEventListener('click', () => cmd('cursorDaw.padHit', pad.key));
    pads.appendChild(b);
  }
  $('padsTitle').textContent = s.armedRole === 'drums' ? '鼓垫（点击试听）' : '音阶（点击试听）';
}

$('pad').onclick = () => cmd('cursorDaw.togglePadMode');
$('rec').onclick = () => cmd('cursorDaw.toggleRecording');
$('play').onclick = () => cmd('cursorDaw.playPause');
$('stop').onclick = () => cmd('cursorDaw.stop');
$('track').onclick = () => cmd('cursorDaw.pickTrack');
$('octUp').onclick = () => cmd('cursorDaw.octaveUp');
$('octDown').onclick = () => cmd('cursorDaw.octaveDown');
$('audio').onclick = () => cmd('cursorDaw.warmUpAudio');

const seek = $('seek');
function endSeek() {
  if (!dragging) return;
  dragging = false;
  post('seek', { sec: Number(seek.value) });
}
seek.addEventListener('pointerdown', () => { dragging = true; });
seek.addEventListener('pointerup', endSeek);
seek.addEventListener('pointercancel', endSeek);
seek.addEventListener('change', endSeek);
window.addEventListener('pointerup', endSeek);
seek.addEventListener('input', () => {
  if (!dragging) dragging = true;
  const sec = Number(seek.value);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const dur = state.durationSec || 0;
  const dm = Math.floor(dur / 60);
  const ds = Math.floor(dur % 60);
  $('clock').textContent = m + ':' + String(s).padStart(2,'0') + ' / ' + dm + ':' + String(ds).padStart(2,'0');
});

document.querySelectorAll('a.link').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const command = el.getAttribute('data-cmd');
    const args = JSON.parse(el.getAttribute('data-args') || '[]');
    cmd(command, ...args);
  });
});

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg && msg.type === 'state') {
    state = msg.state;
    render();
  }
});

render();
</script>
</body>
</html>`;
  }
}
