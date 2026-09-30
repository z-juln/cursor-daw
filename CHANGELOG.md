# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-09-30

### Added

- 纯文本多轨 `.daw` 工程：鼓 / 钢琴 / 吉他 / 贝斯，MIDI + SoundFont 播放
- 侧边栏播放列表（拖拽、重命名、内联新建）与键盘录制面板
- Pad 模式、力度档 `1–9`、编辑器播放头与标题栏播放 / 暂停 / 克隆
- **默认网格编辑器**：打开 `.daw` 进入表格视图，左侧音高列横向滚动时固定
- 网格双击改音、单击 / 拖拽格子或表头跳播；Shift+双击切换力度档
- `.daw` 资源管理器 / 标签页文件图标
- Marketplace 图标、MIT 许可证；可发布至 VS Marketplace 与 Open VSX

### Changed

- 扩展品牌由 Cursor DAW 重命名为 **VS DAW**（`vs-daw` / `vsDaw.*`）
- Marketplace README 面向用户；开发说明见 `docs/DEVELOPMENT.md`

### Fixed

- 播放列表改为 `vscode.openWith` 打开网格，避免 `showTextDocument` 强制进纯文本
- 网格编辑器标题栏按钮在自定义编辑器下也能显示（`activeCustomEditorId`）
- 网格布局去掉多余滚动条与多余进度条滑块
