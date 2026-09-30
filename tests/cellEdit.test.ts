import { nextCellOnClick, applyCellEdit } from "../src/gridEditor/cellEdit";
import { parseSession } from "../src/parser";
import { formatSessionText } from "../src/serialize";

test("plain click toggles rest ↔ default hit", () => {
  expect(nextCellOnClick("rest", false)).toBe("6");
  expect(nextCellOnClick("6", false)).toBe("rest");
  expect(nextCellOnClick("hold", false)).toBe("rest");
});

test("shift-click cycles velocity then rest", () => {
  expect(nextCellOnClick("rest", true)).toBe("4");
  expect(nextCellOnClick("4", true)).toBe("6");
  expect(nextCellOnClick("6", true)).toBe("8");
  expect(nextCellOnClick("8", true)).toBe("rest");
});

test("applyCellEdit updates session and serializes", () => {
  const text = `bpm: 100
meter: 4/4
steps: 4
swing: 0

track piano
role: keys
plugin: keys.gm
program: 0
channel: 1

C4 |....|
`;
  const session = parseSession(text);
  const next = applyCellEdit(session, "piano", "C4", 0, false);
  expect(next.tracks[0].rows[0].cells[0]).toBe("6");
  const out = formatSessionText(next);
  expect(out).toContain("6");
});
