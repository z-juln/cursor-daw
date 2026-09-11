# Cursor Drum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个可在 Cursor 里安装的 VS Code 扩展：用纯文本 `.drum` 表示鼓机组，支持手写/Agent 编写、Pad 键盘录入、播放/暂停/从头播放。

**Architecture:** 乐理与文本变换全部放在无 `vscode` 依赖的纯函数里（`parser` / `serialize` / `mapper` / `schedule` / `transport`），用 Jest 单测锁住。扩展层只负责命令、状态栏、装饰器和隐藏 Webview。Webview 持有 `AudioContext`，用合成器发声；扩展把 `ScheduledNote[]` 和 transport 消息 post 过去。

**Tech Stack:** TypeScript 5、VS Code Extension API (`engines.vscode` ^1.90)、Jest + ts-jest、esbuild 打包扩展宿主、静态 `media/webview.html` + `media/webview.js`（Web Audio，无 npm 音频库）。

**Spec:** `docs/superpowers/specs/2026-09-11-cursor-drum-design.md`

仓库目前为空（无 git、无 `package.json`）。第一个任务先搭扩展骨架，再按 TDD 写核心。任务里的 commit 仅在用户明确要求提交时执行；默认跳过 commit 步骤，继续下一任务。

---

## File map

| Path | Responsibility |
|------|----------------|
| `package.json` | 扩展清单、命令、键位、`when` 子句、配置、scripts |
| `tsconfig.json` | 编译 |
| `jest.config.cjs` | 单测 |
| `src/types.ts` | `Score` / `Track` / `HitKind` / `ScheduledNote` |
| `src/drums.ts` | 内置 id、别名、默认键位、显示顺序 |
| `src/parser.ts` | 文本 → `Score` |
| `src/serialize.ts` | 模板、单格写入、补轨、format、ruler |
| `src/mapper.ts` | 列 ↔ step、装饰列 |
| `src/schedule.ts` | `Score` → `ScheduledNote[]` + 总时长 |
| `src/transport.ts` | play/pause/restart/stop/loop 状态机 |
| `src/config.ts` | 读 vscode 配置 |
| `src/audioBridge.ts` | 隐藏 webview 生命周期与消息 |
| `src/padMode.ts` | Pad 上下文键 |
| `src/extension.ts` | activate、命令、装饰、状态栏 |
| `media/webview.html` | Audio 宿主页 |
| `media/webview.js` | 合成器 + 调度 |
| `syntaxes/cursor-drum.tmLanguage.json` | 高亮 |
| `language-configuration.json` | 注释 `#` |
| `agent/SKILL.md` | Agent 手册 |
| `agent/AGENTS.md` | 短入口 |
| `README.md` | 安装与键位 |
| `tests/*.test.ts` | 纯逻辑单测 |

---

### Task 1: 扩展脚手架与 Jest

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.cjs`
- Create: `.gitignore`
- Create: `src/extension.ts`
- Create: `esbuild.mjs`

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "cursor-drum",
  "displayName": "Cursor Drum",
  "description": "纯文本鼓组：键盘录入、网格乐谱、当前文件播放",
  "version": "0.1.0",
  "publisher": "cursor-drum",
  "engines": { "vscode": "^1.90.0" },
  "categories": ["Other"],
  "activationEvents": ["onLanguage:cursor-drum"],
  "main": "./dist/extension.js",
  "contributes": {
    "languages": [
      {
        "id": "cursor-drum",
        "aliases": ["Cursor Drum", "drum"],
        "extensions": [".drum"],
        "configuration": "./language-configuration.json"
      }
    ],
    "grammars": [
      {
        "language": "cursor-drum",
        "scopeName": "source.cursor-drum",
        "path": "./syntaxes/cursor-drum.tmLanguage.json"
      }
    ],
    "commands": [
      { "command": "cursorDrum.playPause", "title": "Cursor Drum: Play/Pause" },
      { "command": "cursorDrum.restart", "title": "Cursor Drum: Restart" },
      { "command": "cursorDrum.stop", "title": "Cursor Drum: Stop" },
      { "command": "cursorDrum.togglePadMode", "title": "Cursor Drum: Toggle Pad Mode" },
      { "command": "cursorDrum.insertRuler", "title": "Cursor Drum: Insert Ruler" },
      { "command": "cursorDrum.formatScore", "title": "Cursor Drum: Format Score" },
      { "command": "cursorDrum.newScore", "title": "Cursor Drum: New Score" },
      { "command": "cursorDrum.padHit", "title": "Cursor Drum: Pad Hit" }
    ],
    "keybindings": [
      { "command": "cursorDrum.playPause", "key": "ctrl+enter", "mac": "cmd+enter", "when": "editorLangId == cursor-drum" },
      { "command": "cursorDrum.restart", "key": "ctrl+shift+enter", "mac": "cmd+shift+enter", "when": "editorLangId == cursor-drum" },
      { "command": "cursorDrum.togglePadMode", "key": "ctrl+'", "mac": "cmd+'", "when": "editorLangId == cursor-drum" },
      { "command": "cursorDrum.stop", "key": "escape", "when": "editorLangId == cursor-drum && cursorDrum.padMode" },
      { "command": "cursorDrum.padHit", "key": "a", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "a" },
      { "command": "cursorDrum.padHit", "key": "s", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "s" },
      { "command": "cursorDrum.padHit", "key": "d", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "d" },
      { "command": "cursorDrum.padHit", "key": "f", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "f" },
      { "command": "cursorDrum.padHit", "key": "g", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "g" },
      { "command": "cursorDrum.padHit", "key": "q", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "q" },
      { "command": "cursorDrum.padHit", "key": "w", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "w" },
      { "command": "cursorDrum.padHit", "key": "e", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "e" },
      { "command": "cursorDrum.padHit", "key": "r", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "r" },
      { "command": "cursorDrum.padHit", "key": "t", "when": "editorLangId == cursor-drum && cursorDrum.padMode && editorTextFocus", "args": "t" }
    ],
    "configuration": {
      "title": "Cursor Drum",
      "properties": {
        "cursorDrum.fileExtensions": { "type": "array", "items": { "type": "string" }, "default": ["drum"] },
        "cursorDrum.keyMap": {
          "type": "object",
          "additionalProperties": { "type": "string" },
          "default": { "a": "kick", "s": "snare", "d": "ch", "f": "oh", "g": "clap", "q": "tom1", "w": "tom2", "e": "tom3", "r": "crash", "t": "ride" }
        },
        "cursorDrum.loop": { "type": "boolean", "default": true },
        "cursorDrum.padModeOnOpen": { "type": "boolean", "default": false }
      }
    }
  },
  "scripts": {
    "compile": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "test": "jest",
    "package": "vsce package --no-dependencies"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^20.17.0",
    "@types/vscode": "^1.90.0",
    "esbuild": "^0.25.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: 写 `tsconfig.json`、`jest.config.cjs`、`.gitignore`、`esbuild.mjs`、占位 `src/extension.ts`**

`tsconfig.json`：`strict` true，`rootDir` `src`，`outDir` `dist`，`module` commonjs，`target` ES2020，exclude `tests` 与 `media`。

`jest.config.cjs`：

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
};
```

`.gitignore`：`node_modules`、`dist`、`*.vsix`。

`esbuild.mjs` 把 `src/extension.ts` bundle 到 `dist/extension.js`，`external: ["vscode"]`，`platform: "node"`，`format: "cjs"`。

`src/extension.ts`：

```ts
import * as vscode from "vscode";
export function activate(_context: vscode.ExtensionContext): void {}
export function deactivate(): void {}
```

- [ ] **Step 3: 安装依赖并确认测试能跑**

Run: `npm install && npx jest --passWithNoTests`

Expected: Jest 退出码 0。

---

### Task 2: 类型与鼓件表

**Files:**
- Create: `src/types.ts`
- Create: `src/drums.ts`
- Create: `tests/drums.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { canonicalDrumId, BUILTIN_ORDER, DEFAULT_KEY_MAP } from "../src/drums";

test("maps aliases to canonical ids", () => {
  expect(canonicalDrumId("bd")).toBe("kick");
  expect(canonicalDrumId("HAT")).toBe("ch");
  expect(canonicalDrumId("nope")).toBeNull();
});

test("builtin order has ten drums", () => {
  expect(BUILTIN_ORDER).toEqual([
    "kick", "snare", "ch", "oh", "clap", "tom1", "tom2", "tom3", "crash", "ride",
  ]);
});

test("default keymap covers home-row pads", () => {
  expect(DEFAULT_KEY_MAP.a).toBe("kick");
  expect(DEFAULT_KEY_MAP.s).toBe("snare");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/drums.test.ts -v`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/types.ts` 与 `src/drums.ts`**

```ts
export type DrumId =
  | "kick" | "snare" | "ch" | "oh" | "clap"
  | "tom1" | "tom2" | "tom3" | "crash" | "ride";

export type HitKind = "rest" | "hit" | "accent" | "ghost";

export interface ParseWarning {
  message: string;
  line?: number;
}

export interface Track {
  id: string;
  canonicalId: DrumId | null;
  cells: HitKind[];
  lineIndex: number;
}

export interface Score {
  bpm: number;
  meter: string;
  stepsPerBar: number;
  swing: number;
  tracks: Track[];
  warnings: ParseWarning[];
  unsupportedVersion: boolean;
}

export interface ScheduledNote {
  timeSec: number;
  drumId: DrumId;
  velocity: number;
}

export type TransportStatus = "stopped" | "playing" | "paused";

export interface TransportState {
  status: TransportStatus;
  positionSec: number;
  loop: boolean;
}
```

`src/drums.ts`：`ALIAS_TO_ID` 含 spec 全部别名（大小写不敏感查找）；`canonicalDrumId(raw: string): DrumId | null`；`BUILTIN_ORDER: DrumId[]`；`DEFAULT_KEY_MAP: Record<string, DrumId>`；`ID_WIDTH = 6`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest tests/drums.test.ts -v`

Expected: PASS。

---

### Task 3: Parser

**Files:**
- Create: `src/parser.ts`
- Create: `tests/parser.test.ts`

字段名必须用 `stepsPerBar`（对应文件头 `steps`），不要用 `steps` 以免和循环变量混。

- [ ] **Step 1: 写失败测试（完整行为）**

```ts
import { parseScore } from "../src/parser";

const sample = `# cursor-drum 1
bpm: 120
meter: 4/4
steps: 16
swing: 0

kick   |x...x...x...x...|x...x...x...x...|
snare  |....x.......x...|....x.......x...|
`;

test("parses header and strips barlines from cells", () => {
  const score = parseScore(sample);
  expect(score.bpm).toBe(120);
  expect(score.meter).toBe("4/4");
  expect(score.stepsPerBar).toBe(16);
  expect(score.swing).toBe(0);
  expect(score.unsupportedVersion).toBe(false);
  const kick = score.tracks.find((t) => t.id === "kick")!;
  expect(kick.cells).toHaveLength(32);
  expect(kick.cells[0]).toBe("hit");
  expect(kick.cells[1]).toBe("rest");
  expect(kick.canonicalId).toBe("kick");
});

test("treats | as visual only", () => {
  const score = parseScore("kick |x.x.|\n");
  expect(score.tracks[0].cells).toEqual(["hit", "rest", "hit", "rest"]);
});

test("maps hit characters and unknown as rest with warning", () => {
  const score = parseScore("kick |xXo*.q|\n");
  expect(score.tracks[0].cells).toEqual([
    "hit", "accent", "ghost", "hit", "rest", "rest",
  ]);
  expect(score.warnings.some((w) => w.message.includes("q"))).toBe(true);
});

test("later duplicate id wins", () => {
  const score = parseScore("kick |x...|\nkick |..x.|\n");
  expect(score.tracks).toHaveLength(1);
  expect(score.tracks[0].cells).toEqual(["rest", "rest", "hit", "rest"]);
  expect(score.tracks[0].lineIndex).toBe(1);
});

test("pads short bars and truncates long bars", () => {
  const score = parseScore("steps: 4\nkick |x.|x....|\n");
  expect(score.tracks[0].cells).toEqual([
    "hit", "rest", "rest", "rest",
    "hit", "rest", "rest", "rest",
  ]);
  expect(score.warnings.length).toBeGreaterThan(0);
});

test("unknown header keys warn; bad bpm falls back to 120", () => {
  const score = parseScore("foo: bar\nbpm: nope\nkick |x|\n");
  expect(score.bpm).toBe(120);
  expect(score.warnings.length).toBeGreaterThan(0);
});

test("version 2 sets unsupportedVersion", () => {
  const score = parseScore("version: 2\nkick |x|\n");
  expect(score.unsupportedVersion).toBe(true);
});

test("unknown drum id kept but canonicalId null", () => {
  const score = parseScore("cowbell |x...|\n");
  expect(score.tracks[0].canonicalId).toBeNull();
  expect(score.tracks[0].id).toBe("cowbell");
});

test("aligns short tracks to longest", () => {
  const score = parseScore("kick |x...x...|\nsnare |x...|\n");
  expect(score.tracks[0].cells).toHaveLength(8);
  expect(score.tracks[1].cells).toHaveLength(8);
  expect(score.tracks[1].cells[7]).toBe("rest");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/parser.test.ts -v`

Expected: FAIL，`parseScore` 未定义。

- [ ] **Step 3: 实现 `parseScore(text: string): Score`**

规则（必须全部实现，不要留缺口）：

1. 按 `\n` 分行，保留 `\r` 去掉。
2. 空行与 trim 后以 `#` 开头的行：跳过（不进 tracks）。
3. 匹配 `/^([A-Za-z][A-Za-z0-9_-]{0,15})\s*:\s*(.*)$/` 且 **尚未出现任何 track 行** 的行：文件头。键小写。`bpm` 用 `Number`，非有限或 ≤0 则 120 并 warning。`steps` → `stepsPerBar`，非正整数则 16。`swing` clamp 到 0–100，非数字则 0。`meter` 原样字符串，空则 `4/4`。`version` 若不是 `1` 则 `unsupportedVersion = true`。其他键 warning。
4. 匹配 `/^([A-Za-z][A-Za-z0-9_-]{0,15})\s+(.*)$/` 的行：track。格子取第二段，去掉所有 `|`，每个字符：`.` `-` `·` → rest；`x` `*` → hit；`X` → accent；`o` → ghost；其他 → rest + warning。按 `stepsPerBar` 切小节：短补 rest，长截断，都 warning。同 `id` 覆盖（Map 保序：先删旧再 append，使「后行赢」且 `tracks` 顺序为最后出现顺序）。
5. 默认：`bpm 120`，`meter 4/4`，`stepsPerBar 16`，`swing 0`。
6. 全部 track 解析完后，`maxLen = max(cells.length)`，短轨尾部补 rest。
7. `canonicalId = canonicalDrumId(id)`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest tests/parser.test.ts -v`

Expected: PASS。

---

### Task 4: Serialize（模板、写格、补轨、format、ruler）

**Files:**
- Create: `src/serialize.ts`
- Create: `tests/serialize.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import {
  emptyTemplate,
  writeHit,
  formatScoreText,
  upsertRuler,
} from "../src/serialize";
import { parseScore } from "../src/parser";

test("emptyTemplate has header and ten rest tracks of two bars", () => {
  const text = emptyTemplate();
  const score = parseScore(text);
  expect(score.bpm).toBe(120);
  expect(score.tracks).toHaveLength(10);
  expect(score.tracks[0].cells).toHaveLength(32);
  expect(score.tracks.every((t) => t.cells.every((c) => c === "rest"))).toBe(true);
  expect(text).toContain("kick");
  expect(text).toMatch(/^# /m);
});

test("writeHit on empty file inserts template then sets cell", () => {
  const next = writeHit("", "kick", 0);
  expect(parseScore(next).tracks.find((t) => t.id === "kick")!.cells[0]).toBe("hit");
});

test("writeHit only changes one cell and keeps comments", () => {
  const src = "# keep me\nkick   |....|\nsnare  |....|\n";
  const next = writeHit(src, "kick", 2);
  expect(next).toContain("# keep me");
  expect(parseScore(next).tracks.find((t) => t.id === "kick")!.cells).toEqual([
    "rest", "rest", "hit", "rest",
  ]);
  expect(next.split("\n").find((l) => l.startsWith("snare"))).toContain("....");
});

test("writeHit does not downgrade accent or ghost", () => {
  const src = "kick |X.o.|\n";
  expect(writeHit(src, "kick", 0)).toContain("X");
  expect(writeHit(src, "kick", 2)).toContain("o");
});

test("writeHit appends missing track with same length and barlines", () => {
  const src = "kick |x...x...|\n";
  const next = writeHit(src, "snare", 4);
  const snare = parseScore(next).tracks.find((t) => t.id === "snare")!;
  expect(snare.cells[4]).toBe("hit");
  expect(snare.cells).toHaveLength(8);
});

test("formatScoreText pads ids to 6 and inserts barlines every stepsPerBar", () => {
  const next = formatScoreText("bpm: 120\nsteps: 4\nkick x...x...\n");
  expect(next).toMatch(/kick {2}\|x\.\.\.\|x\.\.\.\|/);
});

test("upsertRuler inserts two comment lines before first track", () => {
  const src = "bpm: 120\nsteps: 4\nkick |x...|\n";
  const next = upsertRuler(src);
  expect(next).toMatch(/#.*1/);
  const lines = next.split("\n");
  const kick = lines.findIndex((l) => l.startsWith("kick"));
  expect(lines[kick - 1].startsWith("#")).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/serialize.test.ts -v`

Expected: FAIL。

- [ ] **Step 3: 实现**

`emptyTemplate()`：固定字符串，header 如 spec，十轨两小节 16 格全 `.`，乐器名宽度 6，含标尺注释。

`writeHit(text, drumId, stepIndex): string`：

- trim 空 → `emptyTemplate()` 再写。
- 找到该 canonical（或 id 等于 drumId / 别名解析后）的最后一行轨道；没有则按 `formatTrackLine(id, rests)` append，长度 = 现有最长轨的 cells 长度（无轨则 32），`stepsPerBar` 来自 parse。
- 在该行字符串上：扫描字符，跳过 `|`，第 `stepIndex` 个格子字符若为 `.` `-` `·` 或未知，改为 `x`；若已是 `x` `X` `o` `*` 则不变。
- 若 `stepIndex` 超出当前行格子数：先把该行右侧按 format 规则扩到够长（补 `.` 和 `|`），再写。

`formatScoreText(text)`：parse 得到 header+tracks，重发行：保留非 track 行原样（除将被重写的 track 行）；每个 track 用 `id.padStart(6)` + ` ` + 按 `stepsPerBar` 分组 `|cells|`。hit 字符：rest `.`，hit `x`，accent `X`，ghost `o`。

`upsertRuler(text)`：若已有紧贴第一轨之前的连续 `#` 标尺（含 `1e&a` 或纯数字小节），替换这两行；否则在第一轨前插入。小节数 = `ceil(maxCells / stepsPerBar)`。第一行注释：空出 7 列后每小节写小节号。第二行：空出 7 列后按 `stepsPerBar` 写 `1e&a` 循环切片（`stepsPerBar===16` 时用 `1e&a2e&a3e&a4e&a`；其他值用 `1234...` 循环或重复 `.*` 计数，至少每格一个可见字符）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest tests/serialize.test.ts -v`

Expected: PASS。

---

### Task 5: 列 ↔ step 映射

**Files:**
- Create: `src/mapper.ts`
- Create: `tests/mapper.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { columnToStep, stepToColumn } from "../src/mapper";

const line = "kick   |x...x...|x...x...|";

test("skips id and barlines when mapping column to step", () => {
  expect(columnToStep(line, 0)).toBe(0);
  const firstCell = line.indexOf("x");
  expect(columnToStep(line, firstCell)).toBe(0);
  expect(columnToStep(line, firstCell + 1)).toBe(1);
  const secondBarFirst = line.lastIndexOf("|x") + 1;
  expect(columnToStep(line, secondBarFirst)).toBe(8);
});

test("stepToColumn lands on the cell character not the barline", () => {
  expect(line[stepToColumn(line, 0)]).toBe("x");
  expect(line[stepToColumn(line, 4)]).toBe("x");
  expect(line[stepToColumn(line, 8)]).toBe("x");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/mapper.test.ts -v`

Expected: FAIL。

- [ ] **Step 3: 实现**

`columnToStep(line, column)`：从该行第一个格子字符开始（第一个 `|` 之后；若无 `|`，则 id 后空白结束处）向右数非 `|` 字符。`column` 若落在 id 区或 `|` 上，取右侧最近格子，若没有则 0。

`stepToColumn(line, step)`：同样扫描，返回第 `step` 个非 `|` 格子的列索引；不够长则返回行长。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest tests/mapper.test.ts -v`

Expected: PASS。

---

### Task 6: 调度时间

**Files:**
- Create: `src/schedule.ts`
- Create: `tests/schedule.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { parseScore } from "../src/parser";
import { scheduleNotes, scoreDurationSec, stepTimeSec } from "../src/schedule";

test("120bpm 16 steps 4/4: step 0 at 0, step 4 at 0.5s (quarter)", () => {
  expect(stepTimeSec({ bpm: 120, meter: "4/4", stepsPerBar: 16, swing: 0 }, 0)).toBe(0);
  expect(stepTimeSec({ bpm: 120, meter: "4/4", stepsPerBar: 16, swing: 0 }, 4)).toBeCloseTo(0.5, 8);
});

test("swing 50 delays odd steps by a quarter of a step", () => {
  const even = stepTimeSec({ bpm: 120, meter: "4/4", stepsPerBar: 16, swing: 50 }, 0);
  const odd = stepTimeSec({ bpm: 120, meter: "4/4", stepsPerBar: 16, swing: 50 }, 1);
  const step = 0.5 / 4;
  expect(even).toBe(0);
  expect(odd).toBeCloseTo(step + 0.5 * (step / 2), 8);
});

test("scheduleNotes emits kick and snare with velocities", () => {
  const score = parseScore(`bpm: 120
steps: 16
kick   |x...X...|
snare  |....o...|
cowbell|x.......|
`);
  const notes = scheduleNotes(score);
  expect(notes.find((n) => n.drumId === "kick" && n.timeSec === 0)?.velocity).toBe(100);
  expect(notes.some((n) => n.drumId === "kick" && n.velocity === 127)).toBe(true);
  expect(notes.some((n) => n.drumId === "snare" && n.velocity === 50)).toBe(true);
  expect(notes.every((n) => n.drumId !== undefined)).toBe(true);
  expect(notes.filter((n) => (n as { drumId: string }).drumId === "cowbell")).toHaveLength(0);
});

test("scoreDurationSec is length * step duration", () => {
  const score = parseScore("kick |x...|\n");
  expect(scoreDurationSec(score)).toBeCloseTo(0.5, 8);
});
```

说明：`meter` `4/4` 表示每小节 4 个四分音符。`barSec = 4 * (60 / bpm)`（分子=4，分母=4 → `numerator * 60 / bpm`；一般公式 `barSec = (numerator * 60 / bpm) * (4 / denominator)`）。`stepSec = barSec / stepsPerBar`。奇数 step（index `% 2 === 1`）再加 `(swing/100) * (stepSec/2)`。

力度：hit/rest 中 hit=100，accent=127，ghost=50。`canonicalId === null` 的轨不发 note。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/schedule.test.ts -v`

Expected: FAIL。

- [ ] **Step 3: 实现 `parseMeter(meter)` 默认 4/4；`stepTimeSec(ctx, index)`；`scheduleNotes`；`scoreDurationSec` = `maxCells * stepSec`（swing 不加在总长上，循环按无 swing 栅格时长）。**

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest tests/schedule.test.ts -v`

Expected: PASS。

---

### Task 7: Transport 状态机

**Files:**
- Create: `src/transport.ts`
- Create: `tests/transport.test.ts`

不碰真实时钟。纯函数：给定状态 + 事件 + `nowSec`（调用方传入的单调时钟）→ 新状态。

- [ ] **Step 1: 写失败测试**

```ts
import { createTransport, reduceTransport } from "../src/transport";

test("play from stopped starts at 0", () => {
  let t = createTransport({ loop: true });
  t = reduceTransport(t, { type: "play" }, 10);
  expect(t.status).toBe("playing");
  expect(t.anchorWallSec).toBe(10);
  expect(t.anchorScoreSec).toBe(0);
});

test("pause freezes position; play resumes from there", () => {
  let t = createTransport({ loop: true });
  t = reduceTransport(t, { type: "play" }, 0);
  t = reduceTransport(t, { type: "pause" }, 1.25);
  expect(t.status).toBe("paused");
  expect(t.anchorScoreSec).toBeCloseTo(1.25, 8);
  t = reduceTransport(t, { type: "play" }, 100);
  expect(positionAt(t, 100)).toBeCloseTo(1.25, 8);
});

test("restart seeks 0 and plays", () => {
  let t = createTransport({ loop: true });
  t = reduceTransport(t, { type: "play" }, 0);
  t = reduceTransport(t, { type: "restart" }, 3);
  expect(t.status).toBe("playing");
  expect(positionAt(t, 3)).toBe(0);
});

test("stop seeks 0 and does not play", () => {
  let t = createTransport({ loop: true });
  t = reduceTransport(t, { type: "play" }, 0);
  t = reduceTransport(t, { type: "stop" }, 2);
  expect(t.status).toBe("stopped");
  expect(positionAt(t, 99)).toBe(0);
});

test("loop wraps at duration", () => {
  let t = createTransport({ loop: true });
  t = reduceTransport(t, { type: "play" }, 0);
  expect(positionAt(t, 5, 4)).toBeCloseTo(1, 8);
});

test("playPause toggles", () => {
  let t = createTransport({ loop: true });
  t = reduceTransport(t, { type: "playPause" }, 0);
  expect(t.status).toBe("playing");
  t = reduceTransport(t, { type: "playPause" }, 1);
  expect(t.status).toBe("paused");
});

import { positionAt } from "../src/transport";
```

把 `positionAt` 的 import 挪到文件顶部（实现时测试文件 import 只写一次）。

`positionAt(t, wallSec, durationSec = Infinity)`：若非 playing，返回 `anchorScoreSec`。若 playing，`raw = anchorScoreSec + (wallSec - anchorWallSec)`；若 loop 且 duration 有限正数，`((raw % duration) + duration) % duration`；否则 clamp 到 `[0, duration]`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest tests/transport.test.ts -v`

Expected: FAIL。

- [ ] **Step 3: 实现 `TransportEngine` 状态：`status`、`loop`、`anchorWallSec`、`anchorScoreSec`。`createTransport({loop})` 初始 stopped、anchors 0。**

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest tests/transport.test.ts -v`

Expected: PASS。

---

### Task 8: 语法高亮与 language-configuration

**Files:**
- Create: `language-configuration.json`
- Create: `syntaxes/cursor-drum.tmLanguage.json`

- [ ] **Step 1: `language-configuration.json`**

```json
{ "comments": { "lineComment": "#" } }
```

- [ ] **Step 2: TextMate grammar**

scope `source.cursor-drum`：

- `#` 到行尾：`comment.line`
- `^[A-Za-z][\w-]*\s*:` 的键：`keyword.other.cursor-drum`
- 行首乐器 id：`variable.other.drum`
- `[xXo*]`：`markup.inserted`
- `[.\-·]`：`comment.punctuation.rest`（暗）
- `\|`：`punctuation.separator.bar`

不需要单测。用一个最小 `.drum` 在 Cursor 里看颜色（Task 13 手工验）。

---

### Task 9: Webview 合成器

**Files:**
- Create: `media/webview.html`
- Create: `media/webview.js`

消息协议（扩展 → webview）：

```ts
type ToWebview =
  | { type: "resume" }
  | { type: "noteOn"; drumId: string; velocity: number }
  | { type: "load"; notes: { timeSec: number; drumId: string; velocity: number }[]; durationSec: number; loop: boolean }
  | { type: "play"; positionSec: number }
  | { type: "pause" }
  | { type: "stop" };
```

webview → 扩展：`{ type: "ready" }`、`{ type: "tick"; positionSec: number }`（约 50ms，仅 playing）。

- [ ] **Step 1: `media/webview.html`** 全屏黑 1×1，加载 `webview.js`（用 `{{scriptUri}}` 占位，扩展 `asWebviewUri` 替换）。

- [ ] **Step 2: `media/webview.js` 实现**

- `acquireVsCodeApi()`，load 后 `postMessage({type:"ready"})`。
- `AudioContext` 懒创建于第一次 `resume` / `noteOn` / `play`。
- 十个鼓用噪声+振荡器：kick 正弦 150→40Hz 0.15s；snare 噪声+180Hz 0.12s；ch 高通噪声 0.04s；oh 高通噪声 0.25s；clap 噪声多峰；tom 正弦按高低；crash/ride 带通噪声长包络。velocity/127 乘 gain。
- `load` 存谱。`play` 记录 `ctx.currentTime` 与 `positionSec`，用 `setTimeout`/`currentTime` 把未来 100ms 内的 notes `noteOn` 到精确时间（循环时 notes.timeSec + n*duration）。`pause`/`stop` 清 pending（保存 oscillator 列表并 stop）。
- `tick`：`positionSec = (startPos + ctx.currentTime - t0)` 再按 loop/duration wrap。

合成器可以简陋，但十个 `drumId` 都必须能出声，未知 id 忽略。

---

### Task 10: audioBridge + 配置

**Files:**
- Create: `src/config.ts`
- Create: `src/audioBridge.ts`

- [ ] **Step 1: `src/config.ts`**

```ts
import * as vscode from "vscode";
import { DEFAULT_KEY_MAP, DrumId } from "./drums";

export function getLoop(): boolean {
  return vscode.workspace.getConfiguration("cursorDrum").get("loop", true);
}
export function getPadModeOnOpen(): boolean {
  return vscode.workspace.getConfiguration("cursorDrum").get("padModeOnOpen", false);
}
export function getKeyMap(): Record<string, string> {
  const raw = vscode.workspace.getConfiguration("cursorDrum").get<Record<string, string>>("keyMap", DEFAULT_KEY_MAP);
  return { ...DEFAULT_KEY_MAP, ...raw };
}
export function isDrumEditor(editor: vscode.TextEditor | undefined): boolean {
  return editor?.document.languageId === "cursor-drum";
}
```

`getKeyMap` 的值不在本任务单测（vscode）。`DrumId` 若未使用可去掉 import。

- [ ] **Step 2: `src/audioBridge.ts`**

类 `AudioBridge`：

- 构造 `context: vscode.ExtensionContext`
- `ensure(): Thenable<void>` 创建 `webviewPanel` 或 `WebviewView`？规格是隐藏 Webview。用 `vscode.window.createWebviewPanel("cursorDrumAudio", "Cursor Drum Audio", { viewColumn: vscode.ViewColumn.Two, preserveFocus: true }, { enableScripts: true, localResourceRoots: [media] })` 然后立刻 `panel.reveal(undefined, true)` 并设置 `panel.viewColumn` 不可行隐藏。

**隐藏方式（必须按此做）：** 用 `context.subscriptions` 里一个永不 dispose 的 `WebviewPanel`，`viewColumn: vscode.ViewColumn.Beside` 会打扰。改为：

```ts
const panel = vscode.window.createWebviewPanel(
  "cursorDrumAudio",
  "Cursor Drum Audio",
  { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
  { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] }
);
await vscode.commands.executeCommand("workbench.action.closePanel"); // 不要用这个，会关错面板
```

正确做法：创建 panel 后调用 `panel.dispose` 不能发声。VS Code 没有官方 hidden webview。采用：

`createWebviewPanel(..., vscode.ViewColumn.Two, { preserveFocus: true, enableScripts: true, retainContextWhenHidden: true })`，创建后立刻 `vscode.commands.executeCommand("workbench.action.moveEditorToNewWindow")` **不要**。

**定案：** 使用 `WebviewPanel`，`retainContextWhenHidden: true`，放在编辑器第二列会抢布局。改为 output 风格：panel 创建在 `ViewColumn.Beside`，然后 `panel.reveal(vscode.ViewColumn.Two, true)` 并把 html 设为 0 尺寸；同时在 `package.json` 增加 view container 太重。

**最终定案（实现必须遵守）：** `AudioBridge` 用 `vscode.window.createWebviewPanel("cursorDrumAudio", "Drum Audio", { viewColumn: 1, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots })`。第一次发声时创建。用户可手动关掉；关掉后 `onDidDispose` 把引用置空，下次 play 再建。标题叫 `Drum Audio`，README 写「可把该标签拖到边上，关掉后下次播放会重开」。不要写关编辑器的命令。

- `post(msg)` 在 ready 前排队。
- `onTick?: (positionSec: number) => void`

html 读取 `media/webview.html`，替换 `{{scriptUri}}` 与 `{{cspSource}}`。CSP 允许 `'nonce'` script。

---

### Task 11: Pad 上下文 + extension 接线

**Files:**
- Create: `src/padMode.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: `padMode.ts`**

```ts
import * as vscode from "vscode";

const KEY = "cursorDrum.padMode";

export class PadMode {
  private on = false;
  constructor() {
    void vscode.commands.executeCommand("setContext", KEY, false);
  }
  get enabled(): boolean { return this.on; }
  async set(on: boolean): Promise<void> {
    this.on = on;
    await vscode.commands.executeCommand("setContext", KEY, on);
  }
  async toggle(): Promise<boolean> {
    await this.set(!this.on);
    return this.on;
  }
}
```

- [ ] **Step 2: 重写 `activate`**

持有：`PadMode`、`AudioBridge`、`transport` 状态、`statusBar` 两项（Pad、BPM/pos）、`playheadDecoration`。

命令：

- `cursorDrum.togglePadMode`：toggle，更新状态栏 `Drum Pad: ON/OFF`。若 `padModeOnOpen`，`onDidChangeActiveTextEditor` 进入 drum 语言时 set true。
- `cursorDrum.newScore`：`openTextDocument({ language: "cursor-drum", content: emptyTemplate() })` 再 `showTextDocument`。
- `cursorDrum.formatScore` / `insertRuler`：对活动鼓谱文档 `edit` 替换全文为 `formatScoreText` / `upsertRuler`。
- `cursorDrum.playPause` / `restart` / `stop`：见下。
- `cursorDrum.padHit`：`args` 为键字符。

播放逻辑：

1. 若无活动鼓谱编辑器：`showWarningMessage("请先打开 .drum 文件")` 返回。
2. `parseScore(document.getText())`。`unsupportedVersion` 则 `showErrorMessage` 且不 play（仍允许 pad 写）。warnings 写到 `OutputChannel` 名 `Cursor Drum`。
3. 空 tracks 或全 rest：`showInformationMessage("空谱")` 仍允许 play（静音循环）。规格「空文件播放插入模板」：若 `document.getText().trim()===""`，先 `edit` 插入 `emptyTemplate()` 再提示空谱（模板全 rest）。
4. `notes = scheduleNotes(score)`，`duration = scoreDurationSec(score)`，`loop = getLoop()`。
5. `audio.ensure()`，`post({type:"resume"})`，`post({type:"load", notes, durationSec, loop})`，`reduceTransport` 对应事件，`post({type:"play", positionSec})` 等。
6. `onTick`：更新装饰：对每个 track 行 `stepToColumn(line, currentStep)`，`currentStep = floor(positionSec / stepSec)` wrap；`editor.setDecorations`。
7. 文档 `onDidChangeTextDocument` debounce 250ms：若 playing 且是当前文档，重新 parse+load，**不**重置 position（post load 后 post play 用当前 position）。

`padHit`：

1. `resume` + `noteOn` velocity 100。
2. `drumId = getKeyMap()[key.toLowerCase()]`，没有则 return。
3. 写入拍：playing 则 `floor(positionAt / stepSec)`；否则用活动选择的 `active.character` + **光标所在行若是 track 则用该行，否则用第一轨行** 做 `columnToStep`（乐器仍来自 keymap，不是光标行）。
4. `writeHit` 后 `WorkspaceEdit` 替换全文（或只替换那一行——优先整篇替换更简单，但会抖光标：用 `editor.edit` 替换那一行文本，光标尽量保留）。

状态栏：`Drum Pad: OFF`、`120 BPM  |  1.3` 点击 toggle / playPause。

`deactivate`：dispose panel、status bar、decoration。

---

### Task 12: Agent 手册与 README

**Files:**
- Create: `agent/SKILL.md`
- Create: `agent/AGENTS.md`
- Create: `README.md`
- Create: `examples/backbeat.drum`

手册字符表、文件头、轨道规则必须与 parser 一致（从 spec 抄，不要发明新语法）。

- [ ] **Step 1: `agent/SKILL.md`**

包含：何时使用（用户要鼓点、节奏、`.drum`）；文件头默认；格子字符表；`|` 不算拍；内置 id+别名；Pad 与手写区别（Agent 只改文件，不要依赖 Pad）；模板：四拍底鼓、backbeat 军鼓、十六分闭镲（与 spec 骨架相同）；禁止 tab；禁止在格子行写中文；改现有文件时保持 `|` 和注释。

- [ ] **Step 2: `agent/AGENTS.md`**

三句：这是 Cursor Drum 纯文本鼓谱；语法见 `agent/SKILL.md`；用 `x` 和 `.` 画网格，纵向乐器横向时间。

- [ ] **Step 3: `README.md`**

如何在 Cursor 加载未打包扩展（扩展面板 → Install from VSIX 或打开本文件夹 F5）。键位表。设置项。说明会弹出 `Drum Audio` 标签。指向 Skill。

- [ ] **Step 4: `examples/backbeat.drum`** 使用 spec 第 3.2 节骨架全文。

---

### Task 13: 手工验收（无浏览器自动化也可；在 Cursor 扩展开发宿主里做）

- [ ] 打开 `examples/backbeat.drum`，语法高亮可见。
- [ ] `Cmd+Enter` 能听到 kick/snare/hat 循环；再按暂停；再按续播不从头。
- [ ] `Cmd+Shift+Enter` 从头。
- [ ] `Cmd+'` 开 Pad，按 `a`/`s`/`d` 发声且对应格变为 `x`；字母不插入到光标处。
- [ ] 关 Pad 后键入 `x` 正常插入。
- [ ] 空文件新建后 `newScore` 有十轨。
- [ ] 改 `bpm: 80` 播放中 250ms 内变慢。
- [ ] `cursorDrum.fileExtensions` 不在这一版动态改 language association（默认 `.drum` 足够）；若有余量：文档写「改后缀需在 `files.associations` 把 `*.drums` 映射到 `cursor-drum`」，配置项仍读但不自动注册——**与 spec 略差**。为覆盖 spec：`activate` 里对 `fileExtensions` 调 `vscode.languages.setTextDocumentLanguage` 做不到关联。用 `package.json` 默认 `.drum`，README 写用户可在 `files.associations` 加 `"*.drums": "cursor-drum"`。配置 `cursorDrum.fileExtensions` 仅用于 `isDrumEditor` 的 fallback：`languageId===cursor-drum` **或** 后缀在列表里。无 languageId 的文件仍可播放。

把 `isDrumEditor` 改为：`languageId === "cursor-drum" || fileExtensions 包含 document.fileName 后缀`。键位 `when` 仍是 `editorLangId == cursor-drum`，所以自定义后缀要靠 associations。README 写清楚。

- [ ] `npx jest` 全绿。

---

## Spec coverage

| Spec | Task |
|------|------|
| 文本格式 3.x | 3, 4 |
| 键盘 Pad 4.1 | 1 keybindings, 11 |
| 命令 4.2 | 1, 11 |
| 播放头/写入拍 4.3 | 5, 7, 11 |
| 音频 4.4 | 9, 10, 11 |
| 设置 | 1, 10, 11, 13 |
| 错误处理 | 11 |
| Agent 手册 | 12 |
| 单测列表 §7 | 3–7 |

## Type consistency

- `Score.stepsPerBar` 不是 `steps`
- `HitKind`: `rest | hit | accent | ghost`
- `Transport` 事件：`play` `pause` `playPause` `restart` `stop`
- Webview `ToWebview` 五种 type 字符串固定
- 力度 100 / 127 / 50
