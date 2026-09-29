import { DawEngine } from "../src/engine";
import { FakeAudioContext } from "./fakeAudioContext";

describe("DawEngine", () => {
  it("未播放时不创建音频上下文", () => {
    let created = 0;
    new DawEngine(() => {
      created += 1;
      return new FakeAudioContext();
    }, { sf2Path: "/tmp/missing.sf2" });
    expect(created).toBe(0);
  });
});
