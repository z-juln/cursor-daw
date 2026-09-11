/**
 * node-web-audio-api 随包发布 7 个平台的原生库（约 40MB）。
 * 打包前只保留当前平台需要的那些，避免 vsix 无谓膨胀。
 */
import { readdirSync, rmSync, statSync } from "fs";
import { join } from "path";

const dir = "node_modules/node-web-audio-api";
const keep = process.platform === "darwin"
  ? ["darwin-arm64", "darwin-x64"]
  : [`${process.platform}-${process.arch}`];

let removed = 0;
let freed = 0;

for (const name of readdirSync(dir)) {
  if (!name.endsWith(".node")) continue;
  if (keep.some((platform) => name.includes(platform))) continue;
  const target = join(dir, name);
  freed += statSync(target).size;
  rmSync(target);
  removed += 1;
}

console.log(
  `已移除 ${removed} 个非本平台原生库，释放 ${(freed / 1024 / 1024).toFixed(1)}MB`
  + `（保留：${keep.join("、")}）`,
);
