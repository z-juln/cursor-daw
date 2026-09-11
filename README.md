# Cursor Drum

在 Cursor / VS Code 中用纯文本写鼓机网格、键盘敲鼓并播放当前文件。

## 侧边栏与默认谱库

安装后，Activity Bar 会出现 Cursor Drum 鼓图标，包含三个视图：

- **播放列表**：列出 `~/.cursor-drum` 中的全部 `.drum`。点击条目打开文件；点击行内的播放按钮直接播放，不会打开文件。
- **键盘录制**：分四段——
  - *传输*：切换 Pad、录制、播放/暂停、停止，并显示 BPM、播放位置和音频引擎状态（不是 `running` 就发不出声，点击即可启动）。
  - *鼓组*：Pad 开启后出现「鼓组：…」一行，点击弹出下拉列表切换 Pad 鼓组（合成或 WAV 采样）。播放列表仍按各文件 `kit:` 头播放。
  - *鼓垫*：十件鼓各一行，显示键位和鼓名，**点击即可试听**。键盘没反应时用它可以判断是音频问题还是键位问题。
  - *说明*：打开鼓谱格式手册或使用说明。
- **创建**：设置名称、BPM、小节数，创建实际文件。

视图标题栏也有一个书本图标，直接打开说明书。

扩展首次激活会创建 `~/.cursor-drum`，并将 `examples/` 中缺失的 `.drum` 复制到默认播放列表。已有同名文件不会被覆盖。外部目录中的鼓谱仍可直接编辑和播放，但不会自动复制到默认谱库。

## 音频引擎

内置五套鼓组：三套合成（`default` / `808` / `acoustic`）与两套 WAV 采样（`wav-classic` / `wav-punch`）。音色离线合成或预渲染为 wav，启动时写入 AudioBuffer，敲击只播这段缓冲。
不调用 `afplay` 等系统播放器，也不经过 webview。
`node-web-audio-api` 的 `getChannelData()` 返回分离副本，实时往里面写噪声到不了扬声器，
所以踩镲 / 开镲 / 拍手这类纯噪声鼓必须走内置采样，不能在播放图里现场造噪声。

vsix 内含 macOS 的 `.node` 原生库（arm64 与 x64）。`npm run package` 会先剔除其他平台的二进制。

所有声音汇到一条母线，末端接 tanh 软限幅，所以同时敲多件鼓不会叠加削波失真。

```bash
npm run render:kits                 # 从合成源离线渲染 media/kits 下的 wav
npm run verify:audio                # 校验十件鼓响度对齐、不削波
npm run verify:audio -- --audition   # 逐件试听十件鼓
npm run verify:audio -- --play       # 实时播放 examples/backbeat.drum
```

音色响度按 **200ms 短时 RMS** 对齐，不按峰值：峰值 1 的正弦 RMS 约 0.707，而滤波后的白噪声只有 0.2 上下，
按峰值配平会让噪声类音色（踩镲、开镲、拍手）听感低十几分贝。`verify:audio` 因此要求每件鼓的 RMS 落在
底鼓的 0.5x–2x 之间，并检查四件鼓同时满力度敲击时峰值不超过 1.0。

## 开发与安装

```bash
npm install
npm test
npm run compile
```

开发时用 Cursor 打开本目录并按 `F5` 启动 Extension Development Host。
发布安装包需要先安装 `@vscode/vsce`，再执行 `npm run package`，然后在扩展面板选择 **Install from VSIX**。

## 使用

1. 打开 `examples/backbeat.drum` 或运行 `Cursor Drum: New Score`。
2. `Cmd/Ctrl+Enter` 播放或暂停；`Cmd/Ctrl+Shift+Enter` 从头播放。
3. 开启 Pad 后按键敲鼓。默认快捷键：
   - **切换 Pad**：`Cmd+D`（Windows/Linux：`Ctrl+D`），在侧边栏、资源管理器等非编辑器区域可用
   - **鼓谱编辑器内切换 Pad**：`Cmd/Ctrl+'`（编辑器里 `Cmd+D` 留给 VS Code 多选，避免冲突）
   - **退出 Pad**：`Esc`

   在 Cursor 中打开 **键盘快捷方式**（`Cmd+K Cmd+S`），搜索 `Cursor Drum` 或 `Pad`，即可修改上述快捷键。相关命令：
   - `Cursor Drum: 开启 Pad 模式` — 只打开，不关闭
   - `Cursor Drum: 切换 Pad 模式` — 开/关切换
   - `Cursor Drum: 退出 Pad 模式` — 等同 Esc

Pad 默认键位：

- `A/S/D/F/G`：kick / snare / closed hat / open hat / clap
- `Q/W/E/R/T`：tom1 / tom2 / tom3 / crash / ride
- Pad 模式下 `Esc` 直接关闭 Pad（同时停止播放）；焦点在输入框时不拦截

Pad 开启即进入演奏模式：焦点在侧边栏、资源管理器等非输入区域时，按键直接出声，不需要打开任何鼓谱。焦点在 `.drum` 编辑器里同样出声；焦点在其他代码文件或搜索框中时不拦截按键，正常打字。

Pad 开启但**录制关闭**时只发声，不修改文本；在“键盘录制”视图打开录制并聚焦某个 `.drum` 后，敲击才会写入当前 step。Pad 和录制默认都关闭。

## 文本格式

```text
bpm: 120
meter: 4/4
steps: 16
swing: 0

kick   |x...x...x...x...|
snare  |....x.......x...|
ch     |x.x.x.x.x.x.x.x.|
```

`.` 是休止，`x` 是击打，`X` 是重音，`o` 是弱音。`|` 分隔小节但不占 step。完整规范见 `agent/SKILL.md`。

## 设置

- `cursorDrum.keyMap`：键到鼓件 ID 的映射。
- `cursorDrum.loop`：是否循环整份鼓谱，默认 `true`。
- `cursorDrum.padModeOnOpen`：打开鼓谱时是否自动进入 Pad，默认 `false`。
- `cursorDrum.fileExtensions`：播放命令识别的额外后缀。

自定义后缀还需让编辑器识别语言，例如：

```json
{
  "files.associations": {
    "*.beat": "cursor-drum"
  },
  "cursorDrum.fileExtensions": ["drum", "beat"]
}
```

## Agent

让 Agent 创建或修改 `.drum` 前，请它阅读 `agent/SKILL.md`。短入口见 `agent/AGENTS.md`。
