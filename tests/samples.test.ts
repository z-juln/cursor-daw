import { BUILTIN_ORDER } from "../src/drums";
import { renderSample, sampleDurationSec } from "../src/samples";

const rmsOf = (pcm: Float32Array): number => {
  let sum = 0;
  const n = Math.min(pcm.length, 9600);
  for (let i = 0; i < n; i += 1) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / n);
};

describe("renderSample", () => {
  it("为每一件内置鼓生成非静音采样", () => {
    for (const drumId of BUILTIN_ORDER) {
      const pcm = renderSample(drumId, 48000);
      expect(pcm.length).toBeGreaterThan(100);
      expect(rmsOf(pcm)).toBeGreaterThan(0.01);
    }
  });

  it("纯噪声鼓（踩镲、开镲、拍手）也有足够能量，不依赖实时振荡器", () => {
    for (const drumId of ["ch", "oh", "clap"]) {
      expect(rmsOf(renderSample(drumId, 48000))).toBeGreaterThan(0.02);
    }
  });

  it("未知鼓件返回空缓冲", () => {
    expect(renderSample("nope", 48000)).toHaveLength(0);
    expect(sampleDurationSec("nope")).toBe(0);
  });

  it("采样时长覆盖该鼓全部发声层", () => {
    expect(sampleDurationSec("clap")).toBeGreaterThan(0.18);
    expect(sampleDurationSec("crash")).toBeGreaterThan(1);
    expect(renderSample("clap", 1000).length).toBe(
      Math.ceil(sampleDurationSec("clap") * 1000),
    );
  });

  it("同一鼓件两次渲染波形一致，便于缓存", () => {
    const a = renderSample("ch", 8000);
    const b = renderSample("ch", 8000);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
