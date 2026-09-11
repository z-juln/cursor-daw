# Cursor Drum 设计规格

日期：2026-09-11  
状态：待用户审阅后进入实施计划

## 1. 目标

在 Cursor（VS Code 兼容）里用纯文本编写、键盘录制、即时试听一套鼓组谱。文件本身就是乐谱：纵向是鼓件，横向是时间（小节/拍），观感接近 DAW 鼓机网格，但全部是可手写、可被 Agent 编辑的文本。

成功标准：

1. 打开鼓谱文件后，可用键盘敲击对应鼓件，立刻发声，并在当前拍写入击打。
2. 可播放 / 暂停 / 从头播放当前文件，听到与文本一致的节奏。
3. 用户或 Agent 只改文本即可改谱；无需专用二进制格式。
4. 仓库提供 Agent 手册（Skill），足以让 Agent 正确编写该格式。

非目标（第一版不做）：

- MIDI 设备输入/输出
- 音频/MIDI 导出
- 多音色包、采样替换 UI
- 旋律音轨、和弦、自动化
- 协同编辑、云同步

## 2. 产品形态

可本地安装的 VS Code / Cursor 扩展，仓库即扩展根目录。

- 默认文件后缀：`.drum`
- 设置项 `cursorDrum.fileExtensions`：字符串数组，例如 `["drum", "drums"]`，写入 `files.associations` 等效行为（扩展自己贡献 language + 可配置）
- 鼓谱 Language Id：`cursor-drum`
- 打开匹配文件时提供：语法高亮、键位命令、播放装饰、状态栏 BPM/小节/Pad 模式

两种编辑方式并存：

| 模式 | 行为 |
|------|------|
| 文本模式（默认） | 普通编辑器，手写 `x` / `.`，和改代码一样 |
| Pad 模式 | 映射键被命令截获，不插入字母；发声并在当前拍写入/叠加击打 |

Pad 模式用命令切换，状态栏显示 `Drum Pad: ON/OFF`。关闭时空格等键恢复正常编辑。

## 3. 文本格式

### 3.1 原则

- UTF-8 纯文本，Unix 换行。
- 行 = 一件鼓；列 = 一个最小时间格（step）。
- `|` 只做小节视觉分隔，**不占 step**。
- 空白行、`#` 行是注释。
- 文件头是 `key: value`，大小写不敏感，未知键忽略并 warning（输出到输出面板，不阻断播放）。
- 网格行从第一个看起来像轨道的行开始，直到文件结束。轨道行必须能解析出 id + 格子序列。

### 3.2 推荐骨架

```text
# cursor-drum 1
bpm: 120
meter: 4/4
steps: 16
swing: 0

#        1               2
#        1e&a2e&a3e&a4e&a1e&a2e&a3e&a4e&a
kick   |x...x...x...x...|x...x...x...x...|
snare  |....x.......x...|....x.......x...|
ch     |x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|
oh     |................|..............x.|
clap   |................|................|
tom1   |................|................|
tom2   |................|................|
tom3   |................|............x...|
crash  |x...............|................|
ride   |................|................|
```

### 3.3 文件头

| 键 | 默认 | 含义 |
|----|------|------|
| `bpm` | 120 | 四分音符每分钟 |
| `meter` | 4/4 | 仅用于校验「每小节 step 数是否合理」和状态栏显示；不改变格子含义 |
| `steps` | 16 | **每个小节的 step 数**。4/4 下 16 = 十六分音符网格 |
| `swing` | 0 | 0–100。偶数 step 不动，奇数 step 向后推 `(swing/100) * 半个step时长` |

版本行 `# cursor-drum 1` 可选。解析器按本规格 v1 处理。若出现 `version: 2` 且不支持，播放报错，文本仍可编辑。

### 3.4 格子字符

| 字符 | 含义 | 力度 |
|------|------|------|
| `.` 或 `-` 或 `·` | 休止 | — |
| `x` | 击打 | 100 / 127 |
| `X` | 重音 | 127 |
| `o` | 弱拍/ghost | 50 |
| `*` | 与 `x` 相同（便于视觉） | 100 |

其他非分隔字符：该格视为休止，解析时记 warning。

`|` 和行首乐器名、乐器名与 `|` 之间的空格都不计入 step。

### 3.5 乐器行语法

```
<id><空白><格子...>
```

- `id`：`[A-Za-z][A-Za-z0-9_-]*`，最长 16。
- 同一文件同一 `id` 出现两次：后行覆盖前行（便于 Agent 追加）；播放只用最后一次。
- 格子区去掉 `|` 后的字符序列必须每小节长度等于 `steps`。若某小节长度不符：该小节右侧缺的补休止、多的截断，并 warning。
- 各轨道总 step 数取最长轨道；短的尾部补休止。

### 3.6 内置鼓件 id（第一版固定）

| id | 别名 | 声音 |
|----|------|------|
| `kick` | `bd`, `k` | 底鼓 |
| `snare` | `sd`, `sn` | 军鼓 |
| `ch` | `hh`, `hat` | 闭镲 |
| `oh` | `ho` | 开镲 |
| `clap` | `cp` | 拍手 |
| `tom1` | `ht` | 高通 |
| `tom2` | `mt` | 中通 |
| `tom3` | `lt` | 低通 |
| `crash` | `cr` | 吊镲 |
| `ride` | `rd` | 叮叮镲 |

未知 id：解析保留轨道（可编辑、可显示），播放时静音并 warning。第一版不开放自定义采样。

### 3.7 可视化约定（给人看、给 Agent 看）

- 左列乐器名右对齐到 6 字符宽（`kick␠␠`），后面一个空格再接 `|`。
- 每 `steps` 个格子用 `|` 包一小节：`|` + cells + `|`，小节之间无额外字符。
- 建议在轨道上方放注释标尺（不参与播放）。命令 `cursorDrum.insertRuler` 按当前 `steps`/`meter` 插入或刷新标尺注释。
- 语法高亮：击打亮、休止暗、小节线更暗、乐器名一色、文件头键一色。

### 3.8 序列化（键盘写入时）

扩展改文本时必须：

1. 保持用户已有的 `|` 位置和注释、文件头原样。
2. 只改目标轨道、目标 step 对应的那一个格子字符。
3. 若当前文件还没有该轨道，在文件末尾按内置顺序插入一行空轨道（全休止，长度 = 现有最长轨道，含 `|`）。
4. 若文件完全是空的，插入默认文件头 + 全部内置轨道（2 小节空谱）再写第一击。

不在保存时「格式化全文」，避免和手写/Agent 冲突。另提供命令 `cursorDrum.formatScore` 可选对齐。

## 4. 键盘、命令与播放

### 4.1 Pad 键位（Pad 模式 ON 且活动编辑器是鼓谱）

按键不区分大小写。第一版固定，可用设置覆盖 `cursorDrum.keyMap`（对象：键 → 乐器 id）。

| 键 | 乐器 |
|----|------|
| `a` | kick |
| `s` | snare |
| `d` | ch |
| `f` | oh |
| `g` | clap |
| `q` | tom1 |
| `w` | tom2 |
| `e` | tom3 |
| `r` | crash |
| `t` | ride |

击打时：

1. 立刻发声（力度 = 普通 `x`）。
2. 在 **当前写入拍** 把该轨道格子设为 `x`（已是 `x`/`X`/`o` 则保持，不因连击抹掉；连击同一拍只保留一格，但每次都发声）。
3. 写入拍定义见 4.3。

### 4.2 全局命令（鼓谱文件焦点时）

| 命令 | 默认键 | 行为 |
|------|--------|------|
| `cursorDrum.playPause` | `Ctrl/Cmd+Enter` | 播放↔暂停；暂停保持播放头 |
| `cursorDrum.restart` | `Ctrl/Cmd+Shift+Enter` | 播放头归零并播放 |
| `cursorDrum.stop` | `Escape`（仅 Pad 模式） | 停止，播放头归零，不自动播 |
| `cursorDrum.togglePadMode` | `Ctrl/Cmd+'` | 切换 Pad |
| `cursorDrum.insertRuler` | 无 | 插入/更新标尺注释 |
| `cursorDrum.formatScore` | 无 | 对齐乐器列与 `|` |
| `cursorDrum.newScore` | 无 | 从模板新建 Untitled 鼓谱 |

文本模式不占用字母键和 Escape，避免无法打字。

### 4.3 写入拍与播放头

- 时间轴是线性 step 索引 `0 .. N-1`。
- **播放头**：播放时按 BPM/swing 前进，用 `TextEditorDecorationType` 在每一轨同一 step 上画竖线（改装饰，不改文本）。
- **写入拍**：
  - 正在播放：取「当前发声点」对应 step（向下取整到 step）。
  - 已停止：把光标所在列映射到最近 step；若光标在乐器名或注释行，用该列对应的 step，乐器取键位映射而不是光标行。
- 播放循环：第一版 **整份谱循环**，直到暂停。设置 `cursorDrum.loop` 默认 `true`。

### 4.4 音频

扩展宿主不能可靠发声。使用 **隐藏 Webview** 持有 `AudioContext`：

- 第一版用 Web Audio **合成** 十件鼓（正弦+噪声+包络），不捆绑大采样，离线可用。
- 调度：扩展解析出 `Array<{ timeSec, drumId, velocity }>`，发给 webview；webview 用 `currentTime` 提前 50–100ms 排程。
- 暂停：`suspend()` 或取消 future notes 并记录偏移。
- 从头：偏移归零，重新排程。
- 文本在播放中被改：debounce 250ms 重新解析；已发出的音不收回，后续 step 用新谱。

没有用户手势时浏览器可能暂停 AudioContext。第一次 Play 或第一次 Pad 击打作为手势 resume。

## 5. 架构

目录（扩展根 = 仓库根）：

```
package.json
tsconfig.json
src/
  extension.ts          # activate、命令、状态栏
  padMode.ts            # 键绑定 when 子句协作
  parser.ts             # 文本 ↔ Score
  serialize.ts          # 单格写入、补轨道、模板
  mapper.ts             # 光标列 ↔ step、装饰范围
  transport.ts          # play/pause/restart、循环、与 webview 协议
  audio/
    webview.html
    webview.js          # 合成器 + 调度
    synth.ts            # 若逻辑在扩展侧生成参数，实际发声仍在 webview
  config.ts             # 后缀、keymap、loop
syntaxes/cursor-drum.tmLanguage.json
media/                  # 图标可选
agent/
  SKILL.md              # Agent 手册（安装到用户技能或随仓库）
  AGENTS.md             # 短入口
docs/superpowers/specs/ 本文件
```

边界：

- `parser.ts` 无 vscode API，可单测。
- `serialize.ts` 只做字符串变换，可单测。
- `mapper.ts` 纯函数：列偏移、step、Range，可单测。
- `transport.ts` 依赖 parser + 消息接口，用假 webview 测状态机。
- `extension.ts` 最薄，不写乐理。

数据流：

```
编辑器文本 --parse--> Score --schedule--> 事件列表 --postMessage--> webview synth
键盘 Pad ----score 写入--> 编辑器文本（WorkspaceEdit）
                 \--noteOn--> webview
播放头 <--transport 时钟-- 装饰刷新
```

设置：

- `cursorDrum.fileExtensions`: `string[]`，默认 `["drum"]`
- `cursorDrum.keyMap`: `{ [key: string]: string }`
- `cursorDrum.loop`: `boolean`，默认 true
- `cursorDrum.padModeOnOpen`: `boolean`，默认 false

## 6. 错误处理

| 情况 | 行为 |
|------|------|
| 空文件播放 | 插入模板，不发声，信息提示「空谱」 |
| 解析 warning | 输出面板 `Cursor Drum`，仍播放 |
| 解析致命错误（如 bpm 非数字且无法默认） | 用默认 bpm，warning |
| webview 崩溃 | 下次播放重建；提示重试 |
| 非鼓谱文件执行播放 | 若活动编辑器后缀不匹配，提示并忽略 |
| 未知鼓件 id | 轨道保留，该轨静音 |

## 7. 测试

必须自动化（无 vscode 的纯逻辑优先）：

- 解析：文件头、别名、`|` 不占格、小节长度补齐/截断、未知字符、双轨同 id
- 反写：只改一格、空文件模板、补缺失轨、保留注释
- 列映射：标尺行、带 `|` 的列 → step
- 调度：120 BPM、16 steps、4/4，第一拍 kick 的 timeSec；swing 50 奇数格推后
- transport：play→pause→play 续播；restart 归零；loop 在 N 处回到 0

扩展 UI / 音频：手工清单（见实施计划），不强制 VS Code integration test 第一版。

## 8. Agent 手册

两份内容必须同源（先写一份规范，Skill 引用格式表，禁止两套语法）：

1. `agent/SKILL.md`：何时用、如何写文件头、轨道、字符、小节线、常见节奏模板（四拍底鼓、backbeat、十六分闭镲）、禁止事项（不要用 tab 对齐格子、不要把 `|` 算进拍）。
2. `agent/AGENTS.md`：三句话入口 + 指向 SKILL。

扩展 README 给人装扩展、键位、设置；不把格式细节只写在 README 而漏掉 Skill。

Agent 编写原则：

- 优先改现有 `.drum`，保持原 `|` 和注释。
- 新文件必须带文件头和标尺注释。
- 只使用内置 id 或别名。
- 不要写入解释性散文到格子行。

## 9. 实施顺序（规格级，非任务拆解）

1. Score 类型 + parser/serialize/mapper + 单测
2. 扩展骨架 + language + 高亮 + 模板
3. 隐藏 webview 合成器 + 播放命令
4. Pad 模式写入 + 即时发声 + 播放头装饰
5. 设置（后缀、keymap、loop）
6. Agent 手册与 README

## 10. 明确的单一解释（消歧）

- 「哪个小节有敲击」：靠 `|` 分小节 + 格内 `x`；不是每小节一个字符。
- 横向分辨率：默认每小节 16 格，不是每小节 1 格。
- 键盘打鼓：默认要开 Pad 模式，避免与手写冲突。
- 声音：合成器，不是真鼓采样。
- 循环：默认开。
- 后缀：默认 `.drum`，可配。
