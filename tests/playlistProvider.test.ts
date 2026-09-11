import { scoreContextValue } from "../src/sidebar/scoreContext";

const path = "/Users/me/.cursor-drum/backbeat.drum";

describe("scoreContextValue", () => {
  it("非当前曲目显示播放按钮", () => {
    expect(scoreContextValue(path, { status: "playing" })).toBe("cursorDrum.score");
    expect(scoreContextValue(path, {
      currentPath: "/other.drum",
      status: "playing",
    })).toBe("cursorDrum.score");
  });

  it("当前曲目播放中显示暂停按钮", () => {
    expect(scoreContextValue(path, { currentPath: path, status: "playing" }))
      .toBe("cursorDrum.scorePlaying");
  });

  it("当前曲目已暂停显示播放按钮", () => {
    expect(scoreContextValue(path, { currentPath: path, status: "paused" }))
      .toBe("cursorDrum.scorePaused");
  });

  it("当前曲目已停止显示播放按钮", () => {
    expect(scoreContextValue(path, { currentPath: path, status: "stopped" }))
      .toBe("cursorDrum.score");
  });
});
