# Cursor DAW Design

日期：2026-09-29  
状态：已对齐需求，待实现计划  
前身：Cursor Drum（不兼容旧 `.drum` / `~/.cursor-drum`）

## 目标

把扩展从「纯文本鼓机」升级为 **Cursor 内的迷你 DAW**：

- 多乐器多轨文本工程（`.daw`）
- 侧边栏交互贴近 DAW（库 / 演奏 / 创建）
- 发声走开源 **MIDI + SoundFont**，不自研整套乐器合成器
- Agent / 人手仍以纯文本为主；标准 MIDI 负责互通与播放

## 非目标（v1）

- 不嵌入完整 DAW UI（openDAW / LMMS / Ardour）
- 不做音频波形轨、效果器机架、自动化包络
- 不做完整吉他六线指法引擎（吉他走音高网格 + GM 音色）
- 不兼容 Cursor Drum 旧文件与旧谱库路径

## 产品命名与资源

| 项 | 值 |
|---|---|
| 扩展 id / npm name | `cursor-daw` |
| 显示名 | Cursor DAW |
| 语言 id | `cursor-daw` |
| 文件扩展名 | `.daw` |
| 命令前缀 | `cursorDaw.*` |
| 谱库根目录 | `~/.cursor-daw` |
| Activity Bar icon | 新 SVG（波形/音符块，非鼓形） |

GitHub remote 可暂保持现仓库；改名不阻塞实现。

## 架构总览

```text
.daw 文本
  → Parser（全局头 + track 网格 + x===）
  → Session（多轨 note 事件）
  → MIDI Document（内存）
  → spessasynth_core + 内置 GM SF2
  → PCM → node-web-audio-api → 扬声器

导入：.mid → MIDI Document → .daw 文本
导出：Session / MIDI Document → .mid 文件
```

职责划分：

- **本扩展**：面板、Transport、Pad、录制写谱、`.daw` 解析/序列化、MIDI 导入导出、谱库
- **开源引擎**：MIDI 时序 + SoundFont 合成（首选 `spessasynth_core`）
- **出声通路**：扩展宿主内原生音频；不调用系统播放器（`afplay` 等）；不依赖 Webview 音频

## 文件格式（`.daw`）

统一 **step 网格**；一个文件一首歌，多轨共用全局时间轴。

```text
# cursor-daw 1
bpm: 120
meter: 4/4
steps: 16
swing: 0

track drums
role: drums
plugin: drum.gm
kick   |x...x...x...x...|
snare  |....x.......x...|
ch     |x.x.x.x.x.x.x.x.|

track piano
role: keys
plugin: keys.gm
program: 0
C4     |x===........x===|
E4     |....x===........|
G4     |........x=======|

track guitar
role: guitar
plugin: gtr.gm
program: 24
E3     |x===............|

track bass
role: bass
plugin: bass.gm
program: 32
E2     |x=======x=======|
```

### 全局头

- `bpm`：默认 120
- `meter`：默认 `4/4`
- `steps`：每小节格数，默认 16
- `swing`：0–100，默认 0

### Track 块

- `track <name>`：轨名（唯一）
- `role`：`drums` | `keys` | `guitar` | `bass`（决定 Pad 布局与默认 GM 映射）
- `plugin`：语义标签（v1 主要对应 GM 预设名；便于以后换引擎）
- 可选 `program` / `channel`：覆盖 GM program / MIDI channel
- 网格行：
  - 鼓轨：行 id = 鼓件（`kick`/`snare`/…）
  - 音高轨：行 id = 音名（`C4`、`F#3`）；文件中高音在上、低音在下（钢琴卷帘方向）

### 格子字符

| 字符 | 含义 |
|---|---|
| `.` `-` `·` | 休止 |
| `x` `*` | 起音，力度 100 |
| `X` | 重音，力度 127 |
| `o` | 弱音，力度 50 |
| `=` | 延音（接在起音后，决定 note length） |

鼓轨：one-shot；网格中的 `=` 解析时忽略（不改变时长）。  
音高轨：`x===` → noteOn + 持续到最后一个 `=` 的 step 边界 noteOff。

## MIDI + SoundFont

### 播放

1. 将 Session 编成标准 MIDI（多轨）
2. 用内置 GM SoundFont 通过 `spessasynth_core` 合成
3. 输出到现有原生音频通路（母线 + 软限幅可保留）

### 轨 → GM 默认映射（v1）

| role | MIDI |
|---|---|
| `drums` | channel 10；鼓件名 → GM 打击乐 note |
| `keys` | Acoustic Grand Piano（program 0） |
| `guitar` | Nylon/Steel Guitar（如 program 24/25） |
| `bass` | Acoustic/Finger Bass（如 program 32/33） |

### 导入 / 导出

- **导出**：当前 `.daw` → `.mid`
- **导入**：`.mid` → 新建 `.daw`（ch10→鼓轨；其它轨按 program 猜测 role，音高展开为网格行；无法完美往返的信息允许丢弃并 warning）

## 侧边栏（布局 Z）

保留三栏，语义升级为 DAW：

### 库

- 根目录 `~/.cursor-daw`，目录树浏览
- 播放/暂停当前项；同步内置 examples；新建/重命名/删除目录；在目录内创建文件
- 播放 = 整首 Session（全轨混音）

### 演奏

- Transport：Pad / 录制 / 播放 / 停止 / 引擎状态
- **当前轨**下拉（来自打开文件的轨列表，可手动切换）
- 显示 role / program
- Pad：
  - `drums`：鼓件键位（沿用 A/S/D… 思路）
  - `keys` / `guitar` / `bass`：音阶键 + 八度加减
- Pad 只驱动当前轨音色
- 录制 ON：写入当前轨对应网格行（v1：先可靠写入起音；延音可用默认门限或后续补 `=`）

### 创建

- 名称、目录、BPM、小节数
- 生成带四轨模板的 `.daw`（drums/piano/guitar/bass）

## 内置示例

按目录组织（风格 / 节奏 / 多轨 demo），首次激活与「同步示例」递归复制到 `~/.cursor-daw`，已存在不覆盖。

## 测试与验收（v1）

- Parser：多轨、`x===`、未知 program/鼓件 warning
- `.daw` → MIDI → 再解析关键字段一致（bpm、轨数、主要音符）
- 引擎：四角色各能出声；多轨同时播放不削波失控
- 侧边栏：切轨后 Pad 标签与音色变化；播放状态不串项（树节点用相对路径 id）
- 打包安装后谱库同步与三栏可用

## 决策记录

| 决策 | 选择 |
|---|---|
| 工程格式 | 文本为主 + MIDI 导入导出 |
| 记谱 | 统一 step 网格 |
| 长音 | `x===` |
| v1 乐器 | 鼓 / 钢琴 / 吉他 / 贝斯 |
| 面板 | 三栏（库/演奏/创建） |
| 发声 | MIDI + SoundFont（非自研插件合成） |
| 兼容旧鼓谱 | 不做 |

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| SF2 体积偏大 | 选用精简 GM 库；打包前 trim；文档说明 |
| MIDI↔网格往返有损 | 导入加 warning；导出以保证播放为准 |
| SpessaSynth 与 node-web-audio-api 集成 | spike先做「离线渲染一小段 PCM → AudioBuffer 播放」验证通路 |
| Pad 录制延音体验 | v1 可先录点，手册说明如何手补 `=` |
