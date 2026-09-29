# VS DAW 侧边栏与谱库增量设计

日期：2026-09-11  
状态：待书面审阅

## 目标

为现有 VS DAW 扩展增加一个 Activity Bar 容器和三个侧边栏视图，并将扩展创建的鼓谱统一持久化到 `~/.vs-daw`。

## 谱库目录

- 固定根目录：`path.join(os.homedir(), ".vs-daw")`。
- 扩展激活时确保目录存在。
- 首次激活时，若 `~/.vs-daw/backbeat.drum` 不存在，则从扩展的 `examples/backbeat.drum` 复制；已存在时绝不覆盖。
- 播放列表递归扫描根目录内所有 `.drum` 文件，按相对路径自然排序。
- 用户从其他目录打开的 `.drum` 仍可编辑和播放，但不自动复制到谱库。
- `VS DAW: New Score` 改为在谱库内创建实际文件，不再创建 Untitled 文档。

## Activity Bar 与视图

新增 Activity Bar 容器 `vsDaw`，包含三个原生视图：

### 1. 播放列表 `vsDaw.playlist`

使用 `TreeDataProvider`。

- 每个项目是一份谱库中的 `.drum` 文件。
- 单击项目打开文件。
- 项目内联操作：播放、删除。
- 顶部操作：刷新、创建。
- “播放”先打开对应文件，再复用当前 `vsDaw.restart` 命令。
- “删除”必须弹出模态确认；确认后删除磁盘文件并刷新列表。
- 空列表显示引导，但正常首次激活至少包含 `backbeat.drum`。

### 2. 键盘录制 `vsDaw.recorder`

使用 `TreeDataProvider` 展示可点击状态项：

- `Pad：ON/OFF`：切换键盘拦截。
- `录制：ON/OFF`：控制 Pad 敲击是否写入文本。
- `播放/暂停`。
- `停止并回到开头`。
- 当前 BPM 和位置（只读状态项）。
- 键位提示（只读）。

行为调整：

- Pad ON + 录制 ON：立即发声，并写入当前 step。
- Pad ON + 录制 OFF：只立即发声，不修改文件。
- 默认 Pad OFF、录制 OFF。
- 录制使用 context key `vsDaw.recording`，侧边栏和状态栏同步。
- 如果录制 ON 但没有活动鼓谱，键盘仍不被 Pad 命令触发（现有 `when` 约束保持）。

### 3. 创建 `vsDaw.creator`

使用原生 TreeView 命令项，不使用网页表单：

- `名称`：点击后弹出 InputBox；默认 `untitled`。
- `BPM`：点击后弹出 InputBox；默认 120，合法范围 20–400。
- `小节数`：点击后弹出 InputBox；默认 2，合法范围 1–128。
- `创建鼓谱`：生成十轨空谱到 `~/.vs-daw/<名称>.drum`，刷新列表并打开。

文件名规则：

- 去除前后空白。
- 将 `/`, `\\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` 替换为 `-`。
- 自动补 `.drum`，并禁止创建空文件名。
- 同名文件存在时弹出覆盖确认；未确认则不写。

## 数据与模块边界

- `src/library.ts`：目录初始化、递归扫描、复制默认谱、创建与删除。
- `src/template.ts` 或扩展现有 `serialize.ts`：支持 `emptyTemplate({ bpm, bars })`。
- `src/sidebar/playlistProvider.ts`：播放列表 TreeView。
- `src/sidebar/recorderProvider.ts`：录制与 transport 状态 TreeView。
- `src/sidebar/creatorProvider.ts`：创建参数状态 TreeView。
- `src/sidebar/registerSidebar.ts`：注册 providers、命令和 view。
- `src/recordingMode.ts`：录制 context key 与状态。
- `src/extension.ts`：连接现有命令；不承载文件扫描逻辑。

纯文件逻辑通过依赖传入根目录，避免测试写入真实 `~/.vs-daw`。

## package.json 贡献点

- `viewsContainers.activitybar`：VS DAW 容器与图标。
- `views`：playlist / recorder / creator。
- `viewsWelcome`：播放列表为空提示。
- 新命令：刷新列表、打开、播放、删除、切换录制、设置名称/BPM/小节、创建。
- `menus.view/title`：播放列表刷新与创建。
- `menus.view/item/context`：播放与删除。

## 错误处理

- 初始化目录失败：显示错误消息，播放已有外部文件不受影响。
- 扫描时单文件权限错误：输出 warning，继续列出其他文件。
- 复制默认谱失败：输出错误但不覆盖用户文件。
- 创建参数非法：InputBox 显示 validation message，不关闭输入框。
- 删除/覆盖属于破坏性操作，必须二次确认。

## 测试与验收

自动化：

- 临时目录首次初始化会复制 `backbeat.drum`，再次初始化不覆盖。
- 递归扫描只返回 `.drum` 且按相对路径排序。
- 文件名清洗、自动后缀、路径不能逃逸根目录。
- 创建模板的 BPM、小节数正确。
- 录制状态机默认 OFF 并可切换。

手工：

- Activity Bar 出现 VS DAW 图标及三个视图。
- 播放列表默认有 `backbeat.drum`。
- 点击打开、播放、删除均正常。
- 录制 OFF 时 Pad 只发声；ON 时写格。
- 创建参数可修改，创建后文件实际位于 `~/.vs-daw`。
- 重启编辑器后谱库仍存在。

## 非目标

- 自定义谱库位置。
- JSON 播放列表索引、拖拽排序、标签和收藏。
- 文件夹创建/重命名 UI。
- 自动导入外部文件。
