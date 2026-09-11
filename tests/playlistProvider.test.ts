import { ScoreTreeItem } from "../src/sidebar/playlistProvider";
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

describe("ScoreTreeItem", () => {
  it("同名文件以相对路径为 id，切换播放时不会串状态", () => {
    const state = { status: "stopped" as const };
    const root = new ScoreTreeItem("backbeat.drum", "/lib/backbeat.drum", state);
    const legacy = new ScoreTreeItem("legacy/backbeat.drum", "/lib/legacy/backbeat.drum", state);
    expect(root.id).toBe("backbeat.drum");
    expect(legacy.id).toBe("legacy/backbeat.drum");
    expect(root.id).not.toBe(legacy.id);
  });
});
