import { parseScore } from "../src/parser";

test("解析文件头、轨道和小节线", () => {
  const score = parseScore(`# cursor-drum 1
bpm: 120
meter: 4/4
steps: 16
swing: 0

kick   |x...x...x...x...|x...x...x...x...|
snare  |....x.......x...|....x.......x...|
`);
  expect(score).toMatchObject({
    bpm: 120, meter: "4/4", stepsPerBar: 16, swing: 0,
  });
  expect(score.tracks[0].cells).toHaveLength(32);
  expect(score.tracks[0].cells.slice(0, 2)).toEqual(["hit", "rest"]);
});

test("映射力度字符并警告未知字符", () => {
  const score = parseScore("kick |xXo*.q|\n");
  expect(score.tracks[0].cells.slice(0, 6)).toEqual([
    "hit", "accent", "ghost", "hit", "rest", "rest",
  ]);
  expect(score.tracks[0].cells).toHaveLength(16);
  expect(score.warnings.some((warning) => warning.message.includes("q"))).toBe(true);
});

test("省略 steps 时仍按默认 16 格补齐小节", () => {
  const score = parseScore("kick |x...|\n");
  expect(score.stepsPerBar).toBe(16);
  expect(score.tracks[0].cells).toHaveLength(16);
});

test("显式 steps 时补短小节并截长小节", () => {
  const score = parseScore("steps: 4\nkick |x.|x....|\n");
  expect(score.tracks[0].cells).toEqual([
    "hit", "rest", "rest", "rest",
    "hit", "rest", "rest", "rest",
  ]);
  expect(score.warnings).toHaveLength(2);
});

test("后出现的同名轨覆盖前轨", () => {
  const score = parseScore("kick |x...|\nkick |..x.|\n");
  expect(score.tracks).toHaveLength(1);
  expect(score.tracks[0].lineIndex).toBe(1);
  expect(score.tracks[0].cells[2]).toBe("hit");
});

test("错误头使用默认值且未知鼓件静音保留", () => {
  const score = parseScore("foo: bar\nbpm: nope\ncowbell |x...|\n");
  expect(score.bpm).toBe(120);
  expect(score.tracks[0]).toMatchObject({ id: "cowbell", canonicalId: null });
  expect(score.warnings.length).toBeGreaterThan(0);
});

test("不支持的版本被标记，短轨补到最长轨", () => {
  const score = parseScore("version: 2\nkick |x...x...|\nsnare |x...|\n");
  expect(score.unsupportedVersion).toBe(true);
  expect(score.tracks[1].cells).toHaveLength(16);
  expect(score.tracks[1].cells[7]).toBe("rest");
});
