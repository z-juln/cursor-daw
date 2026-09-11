import { DrumEngine } from "../src/engine";
import { FakeAudioContext } from "./fakeAudioContext";

const notes = [
  { drumId: "kick", velocity: 100, timeSec: 0 },
  { drumId: "snare", velocity: 100, timeSec: 0.5 },
];

const setup = (lookaheadSec = 0.12) => {
  const ctx = new FakeAudioContext();
  const engine = new DrumEngine(() => ctx, { lookaheadSec, autoTick: false });
  return { ctx, engine };
};

describe("DrumEngine", () => {
  it("未播放时不创建音频上下文", () => {
    let created = 0;
    new DrumEngine(() => {
      created += 1;
      return new FakeAudioContext();
    });
    expect(created).toBe(0);
  });

  it("单击留 5ms 提前量，避免刚建好的上下文吞掉第一击", () => {
    const { ctx, engine } = setup();
    ctx.currentTime = 2;
    engine.noteOn("kick", 100);
    expect(ctx.started).toHaveLength(1);
    expect(ctx.started[0].at).toBeCloseTo(2.005, 5);
  });

  it("未知鼓件不产生任何节点", () => {
    const { ctx, engine } = setup();
    engine.noteOn("nope", 100);
    expect(ctx.started).toHaveLength(0);
  });

  it("播放时按谱面时间排程，且相对上下文时钟偏移", () => {
    const { ctx, engine } = setup(1);
    engine.load({ notes, durationSec: 1, loop: false });
    ctx.currentTime = 10;
    engine.play(0);
    // 预排程窗口内应排上 0s 的底鼓与 0.5s 的军鼓（每件鼓一个采样源）。
    expect(ctx.started.map((node) => node.at)).toEqual([10, 10.5]);
  });

  it("从中途播放时跳过已过去的音符", () => {
    const { ctx, engine } = setup(1);
    engine.load({ notes, durationSec: 1, loop: false });
    ctx.currentTime = 4;
    engine.play(0.5);
    expect(ctx.started.map((node) => node.at)).toEqual([4]);
  });

  it("同一个音符不会被重复排程", () => {
    const { ctx, engine } = setup();
    engine.load({ notes, durationSec: 1, loop: false });
    engine.play(0);
    const first = ctx.started.length;
    engine.tick();
    expect(ctx.started).toHaveLength(first);
  });

  it("时间推进后继续排程后续音符", () => {
    const { ctx, engine } = setup();
    engine.load({ notes, durationSec: 4, loop: false });
    engine.play(0);
    expect(ctx.started).toHaveLength(1);
    ctx.currentTime += 0.45;
    engine.tick();
    expect(ctx.started).toHaveLength(2);
  });

  it("长时间卡顿后不补发早已错过的音符", () => {
    const { ctx, engine } = setup();
    engine.load({ notes, durationSec: 4, loop: false });
    engine.play(0);
    ctx.currentTime += 3;
    engine.tick();
    expect(ctx.started).toHaveLength(1);
  });

  it("循环播放会排入下一轮的音符", () => {
    const { ctx, engine } = setup();
    engine.load({ notes, durationSec: 0.5, loop: true });
    engine.play(0.45);
    // 0.45s 起的窗口跨过循环点，应排上下一轮开头的底鼓。
    expect(ctx.started.length).toBeGreaterThan(0);
    expect(engine.positionSec).toBeCloseTo(0.45, 5);
  });

  it("不循环时播放到结尾自动停止并归零", () => {
    const { ctx, engine } = setup();
    engine.load({ notes, durationSec: 0.2, loop: false });
    engine.play(0);
    ctx.currentTime += 1;
    engine.tick();
    expect(engine.playing).toBe(false);
    expect(engine.positionSec).toBe(0);
  });

  it("暂停保留位置，停止归零", () => {
    const { ctx, engine } = setup();
    engine.load({ notes, durationSec: 4, loop: false });
    engine.play(0);
    ctx.currentTime += 1.25;
    engine.pause();
    expect(engine.playing).toBe(false);
    expect(engine.positionSec).toBeCloseTo(1.25, 2);
    engine.stop();
    expect(engine.positionSec).toBe(0);
  });

  it("停止会掐断仍在响的声音", () => {
    const { ctx, engine } = setup();
    engine.noteOn("crash", 100);
    engine.stop();
    expect(ctx.started.every((node) => node.stoppedEarly)).toBe(true);
  });

  it("每次 tick 汇报播放位置", () => {
    const { ctx, engine } = setup();
    const ticks: number[] = [];
    engine.onTick = (value) => ticks.push(value);
    engine.load({ notes, durationSec: 4, loop: false });
    engine.play(0);
    ctx.currentTime += 0.5;
    engine.tick();
    expect(ticks[ticks.length - 1]).toBeCloseTo(0.5, 2);
  });

  it("纯噪声鼓也通过 copyToChannel 写入内置采样，不依赖 getChannelData", () => {
    const { ctx, engine } = setup();
    engine.noteOn("ch", 100);
    engine.noteOn("oh", 100);
    engine.noteOn("clap", 100);
    expect(ctx.started).toHaveLength(3);
    expect(ctx.copied).toHaveLength(3);
    for (const pcm of ctx.copied) {
      let energy = 0;
      for (let i = 0; i < pcm.length; i += 1) energy += pcm[i] * pcm[i];
      expect(energy).toBeGreaterThan(0);
    }
  });

  it("所有声音都汇到同一条母线，母线只建一次", () => {
    const { ctx, engine } = setup();
    engine.noteOn("kick", 100);
    engine.noteOn("snare", 100);
    expect(ctx.gainValues.filter((value) => value === 0.6)).toHaveLength(1);
  });

  it("母线末端接软限幅，避免叠加削波", () => {
    const { ctx, engine } = setup();
    engine.noteOn("kick", 100);
    expect(ctx.shapers).toHaveLength(1);
    const curve = ctx.shapers[0].curve as Float32Array;
    expect(Math.max(...Array.from(curve))).toBeLessThanOrEqual(0.95);
    expect(Math.min(...Array.from(curve))).toBeGreaterThanOrEqual(-0.95);
  });

  it("上下文被挂起时会尝试恢复", () => {
    const ctx = new FakeAudioContext();
    ctx.state = "suspended";
    const engine = new DrumEngine(() => ctx);
    engine.noteOn("kick", 100);
    expect(ctx.resumeCalls).toBe(1);
  });
});
