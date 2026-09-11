import { BUILTIN_ORDER } from "../src/drums";
import { voicesFor } from "../src/voices";

describe("voicesFor", () => {
  it("为每一件内置鼓都提供发声层", () => {
    for (const drumId of BUILTIN_ORDER) {
      expect(voicesFor(drumId, 100).length).toBeGreaterThan(0);
    }
  });

  it("音量随力度线性缩放", () => {
    const soft = voicesFor("kick", 30)[0];
    const loud = voicesFor("kick", 120)[0];
    expect(loud.level).toBeGreaterThan(soft.level);
    expect(loud.level / soft.level).toBeCloseTo(120 / 30, 5);
  });

  it("力度为 0 时仍保留最小可听音量，避免指数包络出现 0", () => {
    for (const voice of voicesFor("snare", 0)) {
      expect(voice.level).toBeGreaterThan(0);
    }
  });

  it("力度超出 127 时被夹紧", () => {
    const top = voicesFor("kick", 127)[0].level;
    expect(voicesFor("kick", 999)[0].level).toBeCloseTo(top, 5);
  });

  it("拍手由三层带延迟的噪声叠加而成", () => {
    const layers = voicesFor("clap", 100);
    expect(layers).toHaveLength(3);
    expect(layers.every((layer) => layer.kind === "noise")).toBe(true);
    expect(layers.map((layer) => layer.delay)).toEqual([0, 0.025, 0.05]);
  });

  it("拍手用低 Q 保留带宽，默认 Q=1 会滤掉噪声大部分能量", () => {
    for (const layer of voicesFor("clap", 100)) {
      if (layer.kind !== "noise") throw new Error("unreachable");
      expect(layer.q).toBeLessThan(1);
    }
  });

  it("噪声音色未指定 Q 时回落到 1", () => {
    const [layer] = voicesFor("ch", 100);
    if (layer.kind !== "noise") throw new Error("unreachable");
    expect(layer.q).toBe(1);
  });

  it("踩镲与开镲的高通不超过 3kHz，否则只剩空气声", () => {
    for (const drumId of ["ch", "oh"]) {
      const [layer] = voicesFor(drumId, 100);
      if (layer.kind !== "noise") throw new Error("unreachable");
      expect(layer.frequency).toBeLessThanOrEqual(3000);
    }
  });

  it("底鼓是一个下滑的正弦振荡", () => {
    const [voice] = voicesFor("kick", 100);
    expect(voice.kind).toBe("osc");
    if (voice.kind !== "osc") throw new Error("unreachable");
    expect(voice.from).toBeGreaterThan(voice.to);
    expect(voice.decay).toBeGreaterThan(0);
  });

  it("未知鼓件不发声", () => {
    expect(voicesFor("nope", 100)).toEqual([]);
  });
});
