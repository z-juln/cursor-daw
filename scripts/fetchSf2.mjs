import { createWriteStream, existsSync, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import * as path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "media", "soundfonts", "gm.sf3");
const url = "https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3";

if (existsSync(out)) {
  console.log("SoundFont already present:", out);
  process.exit(0);
}

mkdirSync(path.dirname(out), { recursive: true });
console.log("Downloading MuseScore General SF3…");
const response = await fetch(url);
if (!response.ok) throw new Error(`download failed: ${response.status}`);
await pipeline(Readable.fromWeb(response.body), createWriteStream(out));
console.log("Saved", out);
