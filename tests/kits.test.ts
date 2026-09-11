import { KIT_DEFINITIONS, normalizeKitId } from "../src/kits/registry";
import { renderSample } from "../src/samples";

test("内置 kit 列表包含合成与采样", () => {
  const kinds = new Set(KIT_DEFINITIONS.map((kit) => kit.kind));
  expect(kinds.has("synth")).toBe(true);
  expect(kinds.has("wav")).toBe(true);
});

test("未知 kit 回落到 default", () => {
  expect(normalizeKitId("nope")).toEqual({ kitId: "default", fallback: true });
  expect(normalizeKitId("808")).toEqual({ kitId: "808", fallback: false });
});

test("不同合成 kit 的底鼓波形不同", () => {
  const a = renderSample("kick", 8000, "default");
  const b = renderSample("kick", 8000, "808");
  expect(Array.from(a)).not.toEqual(Array.from(b));
});
