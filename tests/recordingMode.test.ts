import { RecordingMode } from "../src/recordingMode";

test("录制默认关闭并把切换状态写入 context", async () => {
  const values: boolean[] = [];
  const recording = new RecordingMode(async (_key, value) => {
    values.push(value);
  });
  expect(recording.enabled).toBe(false);
  expect(values).toEqual([false]);
  expect(await recording.toggle()).toBe(true);
  expect(recording.enabled).toBe(true);
  expect(values).toEqual([false, true]);
});
