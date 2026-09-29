import { readFileSync, writeFileSync } from "fs";
import * as path from "path";
import {
  BasicMIDI,
  SoundBankLoader,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
  audioToWav,
} from "spessasynth_core";
import { encodeMidi } from "../src/midi/encode";
import { parseSession } from "../src/parser";
import { scheduleSession } from "../src/schedule";

async function main(): Promise<void> {
  const sf2Path = process.argv[2]
    || path.join(process.cwd(), "media", "soundfonts", "gm.sf3");
  const session = parseSession(`bpm: 120
steps: 8
track piano
role: keys
C4 |x===....|
E4 |..x=====|
`);
  const mid = encodeMidi(session, scheduleSession(session));
  const midi = BasicMIDI.fromArrayBuffer(
    mid.buffer.slice(mid.byteOffset, mid.byteOffset + mid.byteLength),
  );
  const soundBank = SoundBankLoader.fromArrayBuffer(readFileSync(sf2Path).buffer);
  const sampleRate = 44100;
  const synth = new SpessaSynthProcessor(sampleRate, { eventsEnabled: false });
  synth.soundBankManager.addSoundBank(soundBank, "main");
  await synth.processorInitialized;
  const seq = new SpessaSynthSequencer(synth);
  seq.loadNewSongList([midi]);
  seq.play();
  const sampleCount = Math.ceil(sampleRate * (midi.duration + 1));
  const left = new Float32Array(sampleCount);
  const right = new Float32Array(sampleCount);
  let filled = 0;
  const BUFFER_SIZE = 128;
  while (filled < sampleCount) {
    seq.processTick();
    const size = Math.min(BUFFER_SIZE, sampleCount - filled);
    synth.process(left, right, filled, size);
    filled += size;
  }
  const wav = audioToWav([left, right], sampleRate);
  writeFileSync("/tmp/cursor-daw-spike.wav", Buffer.from(wav));
  let energy = 0;
  for (let i = 0; i < left.length; i += 1) energy += left[i] * left[i];
  console.log(JSON.stringify({ ok: energy > 0.0001, energy, out: "/tmp/cursor-daw-spike.wav" }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
