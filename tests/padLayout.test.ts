import { resolvePitchPad, PITCH_PAD_KEYS } from "../src/padLayout";

test("guitar base octave 2 covers low E string area", () => {
  expect(PITCH_PAD_KEYS).toHaveLength(21);
  expect(resolvePitchPad("z", 2)?.label).toBe("C2");
  expect(resolvePitchPad("c", 2)?.label).toBe("E2"); // 吉他低音开弦
  expect(resolvePitchPad("m", 2)?.label).toBe("B2");
  expect(resolvePitchPad("a", 2)?.label).toBe("C3");
  expect(resolvePitchPad("u", 2)?.label).toBe("B4");
});

test("three rows span three octaves", () => {
  const low = resolvePitchPad("z", 1)!.midi;
  const mid = resolvePitchPad("a", 1)!.midi;
  const high = resolvePitchPad("q", 1)!.midi;
  expect(mid - low).toBe(12);
  expect(high - mid).toBe(12);
});
