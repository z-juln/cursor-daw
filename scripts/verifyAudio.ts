/**
 * 真实音频验证。走与扩展宿主完全相同的加载路径（require 一个纯 ESM 包，
 * 依赖 Node >= 22.12 的 require(esm) 支持），先离线渲染确认每件鼓都有非静音输出，
 * 再按需实时播放示例鼓谱。
 *
 *   npm run verify:audio              仅离线校验，不出声
 *   npm run verify:audio -- --audition 逐件试听十件鼓
 *   npm run verify:audio -- --play     实时播放 examples/backbeat.drum
 */
import { readFileSync } from "fs";
import { BUILTIN_ORDER, DEFAULT_KEY_MAP, DRUM_LABELS } from "../src/drums";
import { AudioContextLike, DrumEngine } from "../src/engine";
import { createNativeContext } from "../src/nativeContext";
import { parseScore } from "../src/parser";
import { scheduleNotes, scoreDurationSec } from "../src/schedule";

interface RenderedBuffer {
  getChannelData(channel: number): Float32Array;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const native = require("node-web-audio-api") as {
  OfflineAudioContext: new (
    channels: number,
    length: number,
    sampleRate: number,
  ) => AudioContextLike & { startRendering(): Promise<RenderedBuffer> };
};

const SAMPLE_RATE = 48000;

/**
 * 人耳对打击乐的响度感受来自约 200ms 的短时积分，所以用这个窗口的 RMS 衡量，
 * 而不是峰值——峰值对又短又高的噪声瞬态最不敏感，正是它让三个听不见的音色蒙混过关。
 */
const WINDOW_SEC = 0.2;

/** 响度允许的区间，相对底鼓归一化后的倍数。 */
const MIN_RATIO = 0.5;
const MAX_RATIO = 2;

interface Measurement {
  peak: number;
  rms: number;
}

const measure = (buffer: RenderedBuffer): Measurement => {
  const data = buffer.getChannelData(0);
  const window = Math.min(data.length, Math.round(SAMPLE_RATE * WINDOW_SEC));
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
  for (let i = 0; i < window; i += 1) sum += data[i] * data[i];
  return { peak, rms: Math.sqrt(sum / window) };
};

const renderHits = async (
  drumIds: string[],
  velocity: number,
): Promise<Measurement> => {
  const ctx = new native.OfflineAudioContext(1, SAMPLE_RATE * 2, SAMPLE_RATE);
  const engine = new DrumEngine(() => ctx, { autoTick: false });
  for (const drumId of drumIds) engine.noteOn(drumId, velocity);
  return measure(await ctx.startRendering());
};

const renderOneShot = (drumId: string, velocity: number): Promise<Measurement> =>
  renderHits([drumId], velocity);

/** 逐件试听，用来区分「音色不响」和「按键没传到扩展」。 */
const audition = async (): Promise<void> => {
  const engine = new DrumEngine(createNativeContext);
  engine.warmUp();
  console.log(`\n逐件试听（音频上下文：${engine.contextState}）`);
  const keyOf = new Map(
    Object.entries(DEFAULT_KEY_MAP).map(([key, drumId]) => [drumId, key]),
  );
  for (const drumId of BUILTIN_ORDER) {
    console.log(`  ${keyOf.get(drumId)?.toUpperCase()}  ${DRUM_LABELS[drumId]}`);
    engine.noteOn(drumId, 110);
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  engine.dispose();
};

const playExample = async (): Promise<void> => {
  const score = parseScore(readFileSync("examples/backbeat.drum", "utf8"));
  const durationSec = scoreDurationSec(score);
  const engine = new DrumEngine(createNativeContext);
  engine.load({ notes: scheduleNotes(score), durationSec, loop: false });
  engine.warmUp();
  console.log(
    `实时播放 examples/backbeat.drum：${score.bpm} BPM，`
    + `${score.tracks.length} 轨，${scheduleNotes(score).length} 个音符，${durationSec.toFixed(2)}s`,
  );
  console.log(`音频上下文状态：${engine.contextState}`);
  engine.play(0);
  await new Promise((resolve) => setTimeout(resolve, durationSec * 1000 + 400));
  engine.dispose();
};

const main = async (): Promise<void> => {
  let failures = 0;
  const measurements = new Map<string, Measurement>();

  for (const drumId of BUILTIN_ORDER) {
    measurements.set(drumId, await renderOneShot(drumId, 100));
  }

  const reference = measurements.get("kick")!.rms;
  console.log(`鼓件    峰值     RMS(${WINDOW_SEC * 1000}ms)  相对底鼓`);
  for (const [drumId, { peak, rms }] of measurements) {
    const ratio = rms / reference;
    const clipping = peak > 1;
    const tooQuiet = ratio < MIN_RATIO;
    const tooLoud = ratio > MAX_RATIO;
    const ok = rms > 0 && !clipping && !tooQuiet && !tooLoud;
    if (!ok) failures += 1;
    const notes = [
      clipping ? "削波" : "",
      tooQuiet ? "过轻" : "",
      tooLoud ? "过响" : "",
    ].filter(Boolean).join("，");
    console.log(
      `${ok ? "✓" : "✗"} ${drumId.padEnd(6)} ${peak.toFixed(4)}  `
      + `${rms.toFixed(4)}      ${ratio.toFixed(2)}x ${notes}`,
    );
  }
  console.log(
    `\n响度区间要求：相对底鼓 ${MIN_RATIO}x – ${MAX_RATIO}x，且峰值不得超过 1.0`,
  );

  // 真实演奏会同时敲多件鼓，母线必须留够余量，否则叠加就会削波失真。
  const chord = await renderHits(["kick", "snare", "ch", "crash"], 127);
  if (chord.peak <= 1) {
    console.log(`✓ 四件鼓同时满力度敲击不削波，峰值 ${chord.peak.toFixed(4)}`);
  } else {
    failures += 1;
    console.log(`✗ 四件鼓同时敲击已削波，峰值 ${chord.peak.toFixed(4)}`);
  }

  const silent = await renderOneShot("nope", 100);
  if (silent.peak !== 0) {
    failures += 1;
    console.log(`✗ 未知鼓件应当静音，实际峰值 ${silent.peak}`);
  } else {
    console.log("✓ 未知鼓件静音");
  }

  const soft = await renderOneShot("kick", 30);
  const loud = await renderOneShot("kick", 127);
  if (loud.rms > soft.rms * 1.5) {
    console.log(
      `✓ 力度有效：30 → RMS ${soft.rms.toFixed(4)}，127 → RMS ${loud.rms.toFixed(4)}`,
    );
  } else {
    failures += 1;
    console.log(
      `✗ 力度无效：30 → RMS ${soft.rms.toFixed(4)}，127 → RMS ${loud.rms.toFixed(4)}`,
    );
  }

  if (process.argv.includes("--audition")) await audition();
  if (process.argv.includes("--play")) await playExample();

  if (failures > 0) {
    console.error(`\n${failures} 项验证失败`);
    process.exit(1);
  }
  console.log("\n音频验证全部通过");
};

void main();
