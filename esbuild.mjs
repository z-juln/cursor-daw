import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  // 原生音频后端是纯 ESM + .node 二进制，必须留在 bundle 外由宿主 require。
  external: ["vscode", "node-web-audio-api"],
  platform: "node",
  format: "cjs",
  sourcemap: true,
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
