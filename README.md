# Cursor DAW

在 Cursor / VS Code 中用纯文本编写多轨工程（鼓 / 钢琴 / 吉他 / 贝斯），侧边栏演奏，并经 **MIDI + SoundFont** 出声。

## 侧边栏

- **播放列表**：`~/.cursor-daw` 目录树；播放整首 `.daw`
- **键盘录制**（Webview）：Transport、可拖拽进度条、Pad / 录制 / 当前轨与八度；松手后 seek
- **创建**：名称、目录、BPM、小节数 → 四轨模板

## 文件格式（`.daw`）

音高轨行序：**高音在上、低音在下**（钢琴卷帘方向）。格式化 / 导出 / MIDI 导入都会按此排序。

```text
# cursor-daw 1
bpm: 120
steps: 16

track drums
role: drums
kick   |x...x...x...x...|
snare  |....x.......x...|

track piano
role: keys
C4     |x===........x===|
```

格子：`.` 休止，`x`/`X`/`o` 起音，`=` 延音（鼓轨忽略延音）。

## 音频

- 工程 → 内存 MIDI → `spessasynth_core` + 内置 GM SoundFont（`media/soundfonts/gm.sf3`）
- 扩展宿主内出声（`node-web-audio-api`），不调用系统播放器
- 命令：**导出 MIDI** / **导入 MIDI**

打包前会自动下载 SoundFont（约 38MB）：

```bash
npm run fetch:sf2
npm run package
```

## 开发

```bash
npm install
npm test
npm run compile
```

F5 启动 Extension Development Host。安装：`npm run package` 后 Install from VSIX。

## 编辑器

打开 `.daw` 时，编辑器右上角（`...` 左侧）可显示 **播放/暂停**（单图标切换）与 **克隆**。

> Cursor 2.1+ 默认把扩展的编辑器图标收进 `...`。首次请点标题栏 **`...` → Configure Icon Visibility（配置图标可见性）**，勾选 **播放** / **克隆**（或 Pause / Clone），之后就会固定出现在你标出的位置。

进度竖线仅装饰、不改正文。在音高格子行上**鼠标点击或拖动**可跳转进度（当作定位器/进度条；播放中拖动会 scrub）。

## 快捷键

- Play/Pause：`Cmd/Ctrl+Enter`
- Pad 切换：`Cmd+D`（非编辑器）/ `Cmd+'`（`.daw` 编辑器）
- 退出 Pad：`Esc`
- Pad 半音：`Shift` + 白键（如 `Shift+G` → `G#`；`E`/`B` 升半音为下一白键）
- 钢琴 Pad（默认）：`ZXCVBNM` C3–B3 · `ASDFGHJ` C4–B4 · `QWERTYU` C5–B5 · `1234567` C6–B6
