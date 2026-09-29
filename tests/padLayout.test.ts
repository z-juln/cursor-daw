import { resolvePitchPad, PITCH_PAD_KEYS, pitchPadRows } from "../src/padLayout";

test("guitar base octave 2 covers low E string area", () => {
  expect(PITCH_PAD_KEYS).toHaveLength(21);
  expect(resolvePitchPad("z", 2)?.label).toBe("C2");
  expect(resolvePitchPad("c", 2)?.label).toBe("E2"); // 吉他低音开弦
  expect(resolvePitchPad("m", 2)?.label).toBe("B2");
  expect(resolvePitchPad("a", 2)?.label).toBe("C3");
  expect(resolvePitchPad("u", 2)?.label).toBe("B4");
  expect(resolvePitchPad("1", 2)).toBeUndefined();
});

test("three rows span three octaves", () => {
  const low = resolvePitchPad("z", 1)!.midi;
  const mid = resolvePitchPad("a", 1)!.midi;
  const high = resolvePitchPad("q", 1)!.midi;
  expect(mid - low).toBe(12);
  expect(high - mid).toBe(12);
});

test("piano four rows C3–B6 with number row", () => {
  const opts = { numberRow: true };
  expect(resolvePitchPad("z", 3, opts)?.label).toBe("C3");
  expect(resolvePitchPad("m", 3, opts)?.label).toBe("B3");
  expect(resolvePitchPad("a", 3, opts)?.label).toBe("C4");
  expect(resolvePitchPad("j", 3, opts)?.label).toBe("B4");
  expect(resolvePitchPad("q", 3, opts)?.label).toBe("C5");
  expect(resolvePitchPad("u", 3, opts)?.label).toBe("B5");
  expect(resolvePitchPad("1", 3, opts)?.label).toBe("C6");
  expect(resolvePitchPad("7", 3, opts)?.label).toBe("B6");
  expect(resolvePitchPad("5#", 3, opts)?.label).toBe("G#6");
  expect(pitchPadRows(3, opts)).toHaveLength(4);
});

test("shift suffix raises a semitone", () => {
  expect(resolvePitchPad("g", 4)?.label).toBe("G5"); // 中排 g = base+1
  expect(resolvePitchPad("g#", 4)?.label).toBe("G#5");
  expect(resolvePitchPad("g+", 4)?.label).toBe("G#5");
  expect(resolvePitchPad("c#", 2)?.label).toBe("F2"); // 低排 c=E2 → E#
  expect(resolvePitchPad("m#", 2)?.label).toBe("C3"); // B2 → C3
});
