# VS DAW Sidebar Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task with checkbox tracking.

**Goal:** 增加三个原生侧边栏视图，并把默认谱库持久化到 `~/.vs-daw`。

**Architecture:** 文件系统能力集中在无 VS Code 依赖的 `library.ts` 并以临时目录单测；模板生成扩展为可配置 BPM/小节。三个 TreeDataProvider 只负责展示，`registerSidebar` 注册命令并通过回调复用现有 transport/Pad 状态。

**Tech Stack:** TypeScript、VS Code TreeView API、Node `fs/promises`、Jest。

---

### Task 1: 可配置模板

**Files:** `tests/serialize.test.ts`, `src/serialize.ts`

- [ ] 先写测试：`emptyTemplate({ bpm: 90, bars: 4 })` 可解析为 BPM 90、每轨 64 格。
- [ ] 运行测试确认因 API 未实现失败。
- [ ] 实现 options，并保持无参数时现有两小节模板不变。
- [ ] 运行测试通过。

### Task 2: 谱库文件系统

**Files:** `tests/library.test.ts`, `src/library.ts`

- [ ] 先写临时目录测试：初始化复制且不覆盖 `backbeat.drum`；递归扫描只返回 `.drum` 并排序；文件名清洗；创建文件不能逃逸根目录。
- [ ] 运行测试确认模块不存在。
- [ ] 实现 `defaultLibraryRoot`, `ensureLibrary`, `listScores`, `sanitizeScoreName`, `createLibraryScore`, `deleteLibraryScore`。
- [ ] 运行测试通过。

### Task 3: 录制状态

**Files:** `tests/recordingMode.test.ts`, `src/recordingMode.ts`

- [ ] 先写测试：默认 OFF，toggle 后 ON，并调用 context setter。
- [ ] 运行测试确认失败。
- [ ] 实现带依赖注入 setter 的 `RecordingMode`。
- [ ] 运行测试通过。

### Task 4: Activity Bar 贡献点

**Files:** `package.json`, `media/drum.svg`

- [ ] 版本升至 0.2.0，增加 `onStartupFinished`。
- [ ] 增加 activity bar container、playlist/recorder/creator views、欢迎内容、命令和菜单。
- [ ] 新增单色鼓图标 SVG。

### Task 5: 三个 TreeDataProvider

**Files:** `src/sidebar/playlistProvider.ts`, `src/sidebar/recorderProvider.ts`, `src/sidebar/creatorProvider.ts`

- [ ] PlaylistProvider 递归展示谱库文件，点击打开，item context 支持播放/删除。
- [ ] RecorderProvider 展示 Pad、录制、transport、BPM/位置和键位提示。
- [ ] CreatorProvider 持有 name/BPM/bars 并展示四个操作项。

### Task 6: 注册侧边栏与命令

**Files:** `src/sidebar/registerSidebar.ts`, `src/extension.ts`

- [ ] `registerSidebar` 注册 providers、刷新/打开/播放/删除、录制、设置创建参数和创建命令。
- [ ] 删除/覆盖必须模态确认；输入用 validation。
- [ ] `activate` 改为 async，先初始化谱库；`newScore` 改为调用创建流程。
- [ ] Pad hit 仅在 `recording.enabled` 时写文本；任何 Pad hit 都发声。
- [ ] transport/status/tick/Pad/录制变化时刷新 recorder view。

### Task 7: 文档、验证、安装

**Files:** `README.md`

- [ ] README 增加侧边栏、谱库与录制说明。
- [ ] 运行 `npm test -- --runInBand`, `npm run check`, `npm run compile`, `node --check media/webview.js`。
- [ ] 运行 `npm run package` 生成 0.2.0 VSIX。
- [ ] 用 `code --install-extension vs-daw-0.2.0.vsix --force` 安装并确认扩展列表。
