/**
 * SoundFont 音频验证：离线渲染 demo 工程，确认 PCM 非静音。
 *
 *   npm run fetch:sf2 && npm run verify:audio
 */
import { existsSync, readFileSync } from "fs";
import * as path from "path";
import {
  BasicMIDI,
  SoundBankLoader,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
} from "spessasynth_core";
import { encodeMidi } from "../src/midi/encode";
import { parseSession } from "../src/parser";
import { scheduleSession } from "../src/schedule";

const root = path.join(__dirname, "..");
const sf2Path = path.join(root, "media", "soundfonts", "gm.sf3");
const demoPath = path.join(root, "examples", "demo", "band.daw");
const SAMPLE_RATE = 44100;

const main = async (): Promise<void> => {
  if (!existsSync(sf2Path)) {
    throw new Error(`缺少 SoundFont：${sf2Path}（先 npm run fetch:sf2）`);
  }
  const session = parseSession(readFileSync(demoPath, "utf8"));
  const notes = scheduleSession(session);
  const midiBytes = encodeMidi(session);
  const midi = BasicMIDI.fromArrayBuffer(
    midiBytes.buffer.slice(midiBytes.byteOffset, midiBytes.byteOffset + midiBytes.byteLength) as ArrayBuffer,
  );
  const sfBytes = readFileSync(sf2Path);
  const soundBank = SoundBankLoader.fromArrayBuffer(
    sfBytes.buffer.slice(sfBytes.byteOffset, sfBytes.byteOffset + sfBytes.byteLength) as ArrayBuffer,
  );
  const synth = new SpessaSynthProcessor(SAMPLE_RATE, { eventsEnabled: false });
  synth.soundBankManager.addSoundBank(soundBank, "main");
  await synth.processorInitialized;
  synth.setSystemParameter("autoAllocateVoices", true);
  const seq = new SpessaSynthSequencer(synth);
  seq.loadNewSongList([midi]);
  seq.play();

  const seconds = Math.min(midi.duration + 0.5, 3);
  const sampleCount = Math.ceil(SAMPLE_RATE * seconds);
  const left = new Float32Array(sampleCount);
  const right = new Float32Array(sampleCount);
  let filled = 0;
  while (filled < sampleCount) {
    seq.processTick();
    const size = Math.min(128, sampleCount - filled);
    synth.process(left, right, filled, size);
    filled += size;
  }
  let peak = 0;
  for (let i = 0; i < left.length; i += 1) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  console.log(`offline peak=${peak.toFixed(4)} notes=${notes.length} seconds=${seconds}`);
  if (peak < 0.001) throw new Error("渲染结果接近静音");
  console.log("ok");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
