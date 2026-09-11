import {
  BUILTIN_ORDER,
  canonicalDrumId,
  DEFAULT_KEY_MAP,
  DRUM_LABELS,
} from "../src/drums";

test("鼓件别名映射到规范 id", () => {
  expect(canonicalDrumId("bd")).toBe("kick");
  expect(canonicalDrumId("HAT")).toBe("ch");
  expect(canonicalDrumId("nope")).toBeNull();
});

test("内置十件鼓顺序固定", () => {
  expect(BUILTIN_ORDER).toEqual([
    "kick", "snare", "ch", "oh", "clap",
    "tom1", "tom2", "tom3", "crash", "ride",
  ]);
});

test("默认键位覆盖主要 pad", () => {
  expect(DEFAULT_KEY_MAP.a).toBe("kick");
  expect(DEFAULT_KEY_MAP.s).toBe("snare");
  expect(DEFAULT_KEY_MAP.t).toBe("ride");
});

test("默认键位刚好覆盖全部十件鼓，不重不漏", () => {
  expect(Object.values(DEFAULT_KEY_MAP).sort()).toEqual([...BUILTIN_ORDER].sort());
});

test("每件鼓都有中文名，侧边栏鼓垫才不会显示成裸 id", () => {
  for (const drumId of BUILTIN_ORDER) {
    expect(DRUM_LABELS[drumId]).toBeTruthy();
  }
});
