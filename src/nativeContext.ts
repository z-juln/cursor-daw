import type { AudioContextLike } from "./engine";

interface NativeModule {
  AudioContext: new (options?: { latencyHint?: string }) => AudioContextLike;
}

let cached: NativeModule | undefined;

/**
 * node-web-audio-api 是纯 ESM 包，靠 Node >= 22.12 的 require(esm) 加载；
 * Cursor 的扩展宿主是 Electron 39 / Node 22，满足要求。
 * esbuild 里它被标记为 external，因此这里的 require 会原样保留到运行时。
 */
function loadNative(): NativeModule {
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    cached = require("node-web-audio-api") as NativeModule;
  } catch (error) {
    throw new Error(
      `无法加载原生音频后端 node-web-audio-api：${(error as Error).message}`,
    );
  }
  return cached;
}

/**
 * 扩展宿主内的原生音频上下文。相比 webview，它不受浏览器自动播放策略限制，
 * 不需要用户先在界面点一下就能发声。
 */
export function createNativeContext(): AudioContextLike {
  return new (loadNative().AudioContext)({ latencyHint: "interactive" });
}
