import * as path from "path";
import { BUILTIN_ORDER } from "../src/drums";
import { WAV_KIT_SYNTH_SOURCE } from "../src/kits/synthTemplates";
import { writeWavFile } from "../src/kits/wav";
import { renderSample } from "../src/samples";

const SAMPLE_RATE = 44100;
const kitsRoot = path.join(__dirname, "..", "media", "kits");

for (const [wavKit, synthSource] of Object.entries(WAV_KIT_SYNTH_SOURCE)) {
  for (const drumId of BUILTIN_ORDER) {
    const pcm = renderSample(drumId, SAMPLE_RATE, synthSource);
    const filePath = path.join(kitsRoot, wavKit, `${drumId}.wav`);
    writeWavFile(filePath, pcm, SAMPLE_RATE);
    process.stdout.write(`${filePath}\n`);
  }
}
