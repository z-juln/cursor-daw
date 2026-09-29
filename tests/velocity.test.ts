import { cellVelocity, velocityToCell, charToCell } from "../src/velocity";
import { parseSession } from "../src/parser";
import { scheduleSession } from "../src/schedule";

test("digits 1-9 map across velocity range", () => {
  expect(cellVelocity("1")).toBeLessThan(cellVelocity("5"));
  expect(cellVelocity("5")).toBeLessThan(cellVelocity("9"));
  expect(cellVelocity("9")).toBe(127);
  expect(cellVelocity("rest")).toBe(0);
  expect(cellVelocity("hold")).toBe(0);
});

test("velocity round-trips to nearest digit", () => {
  expect(velocityToCell(14)).toBe("1");
  expect(velocityToCell(70)).toBe("5");
  expect(velocityToCell(127)).toBe("9");
  expect(charToCell("7")).toBe("7");
});

test("schedule preserves digit dynamics", () => {
  const session = parseSession(`bpm: 120
steps: 8
track piano
role: keys
C4 |1.5.9...|
`);
  const notes = scheduleSession(session);
  expect(notes).toHaveLength(3);
  expect(notes[0].velocity).toBeLessThan(notes[1].velocity);
  expect(notes[1].velocity).toBeLessThan(notes[2].velocity);
});
