# 开发说明

面向贡献者 / 本地打包。用户使用说明见根目录 [README.md](../README.md)。

## 架构要点

- `.daw` 文本 → `parseSession` → 调度为 MIDI 事件 → `spessasynth_core` + 内置 GM SoundFont（`media/soundfonts/gm.sf3`）合成 PCM
- 扩展宿主内出声（`node-web-audio-api`），不调用系统播放器
- 侧边栏：播放列表 / 键盘录制为 Webview；创建仍为 TreeView
- Agent 格式约定：`agent/SKILL.md`；设计与计划草案：`docs/superpowers/`

## 本地开发

```bash
npm install
npm test
npm run compile
```

- F5 启动 Extension Development Host
- 监听编译：`npm run compile -- --watch`（若脚本支持）或按 `esbuild.mjs` 的 `--watch`

## 打包与安装

打包前会拉取 / 校验 SoundFont（约 38MB）：

```bash
npm run fetch:sf2   # 仅下载音源
npm run package     # fetch + trim 原生库 + vsce package
```

生成 `cursor-daw-*.vsix` 后，在 Cursor / VS Code 中 **Install from VSIX**。

## 常用路径

| 路径 | 说明 |
|------|------|
| `src/extension.ts` | 激活、Transport、Pad、命令 |
| `src/sidebar/` | 播放列表 / 录制 / 创建 |
| `src/padLayout.ts` | 音高 Pad 键位 |
| `src/library.ts` | `~/.cursor-daw` 谱库 |
| `examples/` | 随扩展同步到谱库的示例 |
| `media/soundfonts/` | GM SoundFont（体积大，勿手改进 git 大文件策略外） |

## 相关文档

- 产品设计 / 实施计划：`docs/superpowers/specs/`、`docs/superpowers/plans/`
- 给 AI 写谱的格式手册：`agent/SKILL.md`
