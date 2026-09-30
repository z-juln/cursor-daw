#!/usr/bin/env node
/**
 * 打包「本地测试」VSIX：保持 publisher/name 与商店一致，
 * 但 version 用 0.0.0-local.*（低于已发布版本），displayName 加 (Local)。
 * 装到 Cursor 后，商店出现更高正式版（如 1.0.1 / 1.0.2）时可正常更新覆盖。
 *
 * 勿把 local 包发布到 Marketplace / Open VSX。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const original = fs.readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(original);

const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const localVersion = `0.0.0-local.${stamp}`;

pkg.version = localVersion;
if (!String(pkg.displayName).includes("(Local)")) {
  pkg.displayName = `${pkg.displayName} (Local)`;
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  }
};

try {
  run("node", ["scripts/fetchSf2.mjs"]);
  run("node", ["scripts/trimNative.mjs"]);
  run("npx", ["@vscode/vsce", "package", "--no-rewrite-relative-links", "--skip-license"]);
  const vsix = path.join(root, `${pkg.name}-${localVersion}.vsix`);
  console.log(`\nLocal test VSIX: ${vsix}`);
  console.log("Install: cursor --install-extension <vsix> --force");
  console.log("Later: marketplace newer version can update over this install.");
} finally {
  fs.writeFileSync(pkgPath, original);
}
