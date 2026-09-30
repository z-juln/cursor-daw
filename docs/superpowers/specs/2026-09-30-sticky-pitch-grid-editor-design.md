# Sticky Pitch Grid Editor Design

日期：2026-09-30  
状态：已对齐需求，待实现计划  
相关：横向滚动时固定左侧音高列；`.daw` 默认用网格编辑器打开

## 目标

解决长谱横向滚动时音高标识（如 `G#6`）被滚出视口的问题，并提供可点格改音的网格视图。

V1 交付：

- `.daw` **默认**以 Custom Text Editor（Webview 网格）打开
- 当前轨网格：**音高列固定在左侧**，格子区可横向滚动
- **单击**开关音符；**Shift+单击**切换力度档
- 顶部：轨切换 + bpm/meter 等简单表单
- 播放时网格列高亮（只读同步播放头）
- 仍可用「以文本编辑器重新打开」编辑纯文本
- 磁盘上的 `.daw` 文本仍是唯一真相源

## 非目标（V1）

- 文本编辑器内叠加 sticky 层（对齐脆弱，已否决）
- 完整钢琴卷帘：拖拽画音、框选、缩放、力度曲线、多轨纵向堆叠同屏编辑
- 网格内复杂编辑延音 `=`（显示为延音样式即可；深度编辑可回文本）
- 替换现有 Pad / Transport / 侧边栏；仅对接，不重写

## 已确认产品选择

| 项 | 选择 |
|---|---|
| 形态 | 专用网格编辑器（非文本叠加） |
| 打开方式 | `.daw` 默认进网格 |
| V1 交互 | 可看可点（非只读、非完整卷帘） |

## 打开与文件模型

- `package.json` 注册 `customEditors`，语言/`filenamePattern` 绑定 `.daw`，`priority: default`
- Provider：`vscode.CustomTextEditorProvider`
- 解析 / 写回：复用 `parseSession`、`formatSessionText`、`writeHit`、力度映射（`velocity.ts`）
- 多轨：顶部下拉或 Tab 切换当前轨；一次只渲染一轨的 sticky 网格
- 全局头（`bpm`、`meter`、`steps`、`swing` 等）：顶部表单，变更后 serialize 写回全文
- 用户可通过编辑器标题菜单 /「以…重新打开」切回默认文本编辑器

## 点格交互与播放头

### 点格

- 单击空格（`.`）：写入默认 onset（与现有 Pad/`writeHit` 默认力度一致，如数字档或 `x`）
- 单击有 onset：清空为 `.`
- Shift+单击：在力度档间循环（例如 `4 → 6 → 8 → .`，具体档位与 `CellKind` 对齐）
- 已有 `=`：V1 显示为延音样式；点按按 rest/onset 简化规则处理，不引入延音绘制工具
- 每次改动即时写回文档（`WorkspaceEdit`），进入 VS Code 撤销栈；无长时间本地草稿

### 滚动

- 音高列：`position: sticky; left: 0`（或等价双层滚动容器）
- 格子区：横向滚动；纵向滚动时音高行与格子行同步移动

### 播放头

- V1：引擎步进 → Provider `postMessage` → Webview 高亮当前列
- V1 可选增强：单击时间轴表头 seek（若工期紧可进 V1.1）
- Pad 录音：网格打开时仍走现有写谱路径；Provider 监听文档变更后刷新网格

## 架构

```text
.daw 文档
  ↔ DawGridEditorProvider
       ↕ postMessage
     grid Webview（sticky 音高 + 格子 + 表单）
  ↔ parseSession / formatSessionText / writeHit
  ↔ 现有 Transport / Pad / 播放引擎（步进回调）
```

### 模块

| 模块 | 职责 |
|---|---|
| `src/gridEditor/DawGridEditorProvider.ts` | 注册编辑器、文档同步、消息路由、写回 |
| `media/gridEditor.*` 或 `src/gridEditor/webview/*` | UI：sticky 列、格子、轨/表单、播放头高亮 |
| 现有 `parser` / `serialize` / `velocity` / `extension` 播放路径 | 复用，不复制业务规则 |

### 数据流

1. 打开或外部改文件 → `parseSession` → `session` 消息 → Webview 渲染  
2. 点格 / 改表单 → Webview 消息 → 更新 Session → serialize → `WorkspaceEdit`  
3. 播放步进 → `playhead` 消息 → 高亮列  

### 冲突与错误

- 外部文档变更：以文档为准，整表重渲染（V1 点格即时写回，基本无未提交草稿）
- 解析失败：警告条 + 行号提示；可切回文本修复
- 未知格子字符：沿用 parser 警告，休止样式显示
- Webview 崩溃：提示 Reload；不丢文件

## 测试

- 单测：点格操作 → Session → serialize 往返与 `writeHit` / 力度规则一致
- 手工：长轨横滚音高不移出；默认打开 `.daw` 进网格；Play 列高亮；撤销/重做；切回文本再打开网格内容一致

## 实现备注

- 不把 Custom Editor 做成第二套解析器；所有语义以 `parser.ts` / `serialize.ts` 为准
- CSS `cursor:` / `editorCursor` 等现有命名约束保持不变
- 与 Marketplace / Open VSX 发布无关；本特性随后续版本号发布
