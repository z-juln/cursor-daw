---
name: writing-cursor-drum-scores
description: Use when creating or editing Cursor Drum `.drum` rhythm files, drum patterns, beats, or percussion grids.
---

# 编写 Cursor Drum 鼓谱

## 核心格式

`.drum` 是 UTF-8 纯文本：每行是一件鼓，横向每个字符是一个 step，`|` 是小节线且不占 step。

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
```

## 快查

文件头：

- `bpm`: 每分钟四分音符数，默认 120。
- `meter`: 拍号，默认 `4/4`。
- `steps`: 每小节格数，默认 16。
- `swing`: 0–100，默认 0。

格子：

- `.`、`-`、`·`：休止。
- `x`、`*`：普通击打，力度 100。
- `X`：重音，力度 127。
- `o`：弱音/ghost，力度 50。

内置鼓件及别名：

- `kick`: `bd`, `k`
- `snare`: `sd`, `sn`
- `ch`: `hh`, `hat`（闭镲）
- `oh`: `ho`（开镲）
- `clap`: `cp`
- `tom1`: `ht`
- `tom2`: `mt`
- `tom3`: `lt`
- `crash`: `cr`
- `ride`: `rd`

## 编写规则

1. 新文件带完整文件头与标尺注释。
2. 每小节恰好写 `steps` 个格子字符；不要把 `|` 算进去。
3. 所有轨道总格数一致，乐器名建议补到 6 字符宽。
4. 修改现有文件时保留原有注释、小节线和未涉及轨道。
5. Agent 直接修改文本；Pad 模式仅供用户键盘演奏。

## 常见错误

- 不要用 Tab 或格内空格对齐，空格不是合法休止格。
- 不要使用 `HH`、`SD`、`BD` 等未列出的大小写 ID；优先写规范 ID。
- 不要在轨道行尾写解释文字；说明请放在独立 `#` 注释行。
- 不要把一小节拆成多条同名轨道；同名轨道后者会覆盖前者。
