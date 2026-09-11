import { mkdirSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";
import { BUILTIN_ORDER } from "../drums";
import { KitId, wavFolderFor } from "./registry";

/** 将 Float32 PCM 写成 16-bit 单声道 WAV。 */
export function writeWavFile(filePath: string, pcm: Float32Array, sampleRate: number): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const buffer = Buffer.alloc(44 + pcm.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcm.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i += 1) {
    buffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767))),
      44 + i * 2,
    );
  }
  writeFileSync(filePath, buffer);
}

/** 读取扩展内置的 16-bit mono WAV，返回归一化 Float32 PCM。 */
export function readKitWav(
  kitsRoot: string,
  kitId: KitId,
  drumId: string,
): Float32Array {
  const folder = wavFolderFor(kitId);
  if (!folder) return new Float32Array(0);
  const filePath = path.join(kitsRoot, folder, `${drumId}.wav`);
  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    return new Float32Array(0);
  }
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    return new Float32Array(0);
  }
  const sampleRate = buffer.readUInt32LE(24);
  const dataOffset = 44;
  const samples = Math.floor((buffer.length - dataOffset) / 2);
  const pcm = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    pcm[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768;
  }
  void sampleRate;
  return pcm;
}

export function kitWavPaths(kitsRoot: string, kitId: KitId): string[] {
  const folder = wavFolderFor(kitId);
  if (!folder) return [];
  return BUILTIN_ORDER.map((drumId) => path.join(kitsRoot, folder, `${drumId}.wav`));
}
