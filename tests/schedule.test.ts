import { parseScore } from "../src/parser";
import { scheduleNotes, scoreDurationSec, stepDurationSec, stepTimeSec } from "../src/schedule";

test("120 BPM 的 4/4 十六分网格时间正确", () => {
  const context = { bpm: 120, meter: "4/4", stepsPerBar: 16, swing: 0 };
  expect(stepDurationSec(context)).toBeCloseTo(0.125);
  expect(stepTimeSec(context, 4)).toBeCloseTo(0.5);
});

test("swing 推迟奇数格", () => {
  const context = { bpm: 120, meter: "4/4", stepsPerBar: 16, swing: 50 };
  expect(stepTimeSec(context, 1)).toBeCloseTo(0.15625);
  expect(stepTimeSec(context, 2)).toBeCloseTo(0.25);
});

test("调度规范鼓件并映射力度，未知鼓件不发声", () => {
  const notes = scheduleNotes(parseScore(
    "kick |x...X...|\nsnare |....o...|\ncowbell |x.......|\n",
  ));
  expect(notes.map((note) => note.velocity)).toEqual([100, 127, 50]);
  expect(notes.some((note) => (note.drumId as string) === "cowbell")).toBe(false);
});

test("总时长不受 swing 尾部偏移影响", () => {
  expect(scoreDurationSec(parseScore("kick |x...|\n"))).toBeCloseTo(2);
});
