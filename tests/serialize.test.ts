import { parseScore } from "../src/parser";
import {
  emptyTemplate,
  formatScoreText,
  upsertRuler,
  writeHit,
} from "../src/serialize";

test("空模板包含文件头、标尺和十条两小节休止轨", () => {
  const text = emptyTemplate();
  const score = parseScore(text);
  expect(score.tracks).toHaveLength(10);
  expect(score.tracks[0].cells).toHaveLength(32);
  expect(score.tracks.every((track) => track.cells.every((cell) => cell === "rest"))).toBe(true);
  expect(text).toContain("#        1");
});

test("空模板支持自定义 BPM 和小节数", () => {
  const score = parseScore(emptyTemplate({ bpm: 90, bars: 4 }));
  expect(score.bpm).toBe(90);
  expect(score.tracks[0].cells).toHaveLength(64);
});

test("空文件写入时创建模板并命中单格", () => {
  const score = parseScore(writeHit("", "kick", 0));
  expect(score.tracks.find((track) => track.id === "kick")?.cells[0]).toBe("hit");
});

test("仅修改目标格且保留注释和其他轨道", () => {
  const source = "# keep me\nkick   |....|\nsnare  |....|\n";
  const next = writeHit(source, "kick", 2);
  expect(next).toContain("# keep me");
  expect(next).toContain("snare  |....|");
  expect(parseScore(next).tracks.find((track) => track.id === "kick")?.cells.slice(0, 4))
    .toEqual(["rest", "rest", "hit", "rest"]);
});

test("已有重音或弱音不会降级", () => {
  const source = "kick |X.o.|\n";
  expect(writeHit(source, "kick", 0)).toContain("X");
  expect(writeHit(source, "kick", 2)).toContain("o");
});

test("缺少轨道时追加同长度轨道", () => {
  const next = writeHit("kick |x...x...|\n", "snare", 4);
  const snare = parseScore(next).tracks.find((track) => track.id === "snare");
  expect(snare?.cells).toHaveLength(16);
  expect(snare?.cells[4]).toBe("hit");
});

test("格式化对齐鼓名并按 steps 插入小节线", () => {
  const next = formatScoreText("bpm: 120\nsteps: 4\nkick x...x...\n");
  expect(next).toMatch(/kick {2} \|x\.\.\.\|x\.\.\.\|/);
});

test("标尺插入到第一条轨道之前", () => {
  const next = upsertRuler("bpm: 120\nsteps: 4\nkick |x...|\n");
  const lines = next.split("\n");
  const kick = lines.findIndex((line) => line.startsWith("kick"));
  expect(lines[kick - 1]).toMatch(/^#\s+/);
  expect(lines[kick - 2]).toMatch(/^#\s+1/);
});
