import { asPlaylistRef, dropTargetFolder, parentOfPath } from "../src/sidebar/playlistProvider";
import { scoreContextValue } from "../src/sidebar/scoreContext";

const path = "/Users/me/.cursor-drum/backbeat.daw";

describe("scoreContextValue", () => {
  it("非当前曲目显示播放按钮", () => {
    expect(scoreContextValue(path, { status: "playing" })).toBe("cursorDaw.score");
    expect(scoreContextValue(path, {
      currentPath: "/other.daw",
      status: "playing",
    })).toBe("cursorDaw.score");
  });

  it("当前曲目播放中显示暂停按钮", () => {
    expect(scoreContextValue(path, { currentPath: path, status: "playing" }))
      .toBe("cursorDaw.scorePlaying");
  });

  it("当前曲目已暂停显示播放按钮", () => {
    expect(scoreContextValue(path, { currentPath: path, status: "paused" }))
      .toBe("cursorDaw.scorePaused");
  });

  it("当前曲目已停止显示播放按钮", () => {
    expect(scoreContextValue(path, { currentPath: path, status: "stopped" }))
      .toBe("cursorDaw.score");
  });
});

describe("dropTargetFolder / parentOfPath", () => {
  it("投放目标：文件夹用自身，工程用父目录", () => {
    expect(dropTargetFolder(undefined)).toBe("");
    expect(dropTargetFolder({
      kind: "folder",
      relativePath: "demo",
      absolutePath: "/lib/demo",
    })).toBe("demo");
    expect(dropTargetFolder({
      kind: "score",
      relativePath: "demo/a.daw",
      absolutePath: "/lib/demo/a.daw",
    })).toBe("demo");
  });

  it("重命名父路径不能用自身", () => {
    expect(parentOfPath("demo/loops")).toBe("demo");
    expect(parentOfPath("loops")).toBe("");
    expect(parentOfPath("demo/a.daw")).toBe("demo");
  });
});

describe("asPlaylistRef", () => {
  it("识别显式 ref 与仅含路径的对象", () => {
    expect(asPlaylistRef({
      kind: "score",
      relativePath: "a.daw",
      absolutePath: "/a.daw",
    })?.kind).toBe("score");
    expect(asPlaylistRef({
      relativePath: "demo",
      absolutePath: "/demo",
    })?.kind).toBe("folder");
  });
});
