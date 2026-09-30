import { parseSession } from "../src/parser";
import { formatSessionText } from "../src/serialize";
import { sessionToView, applyHeaderFields } from "../src/gridEditor/sessionView";

const SAMPLE = `bpm: 120
meter: 4/4
steps: 4
swing: 0

track keys
role: keys
plugin: keys.gm

C4 |.6..|
`;

test("sessionToView exposes sticky row labels and cells", () => {
  const view = sessionToView(parseSession(SAMPLE), "keys");
  expect(view.trackName).toBe("keys");
  expect(view.rows[0].id).toBe("C4");
  expect(view.rows[0].cells[1]).toBe("6");
  expect(view.bpm).toBe(120);
  expect(view.stepsPerBar).toBe(4);
});

test("applyHeaderFields updates bpm and serializes", () => {
  const session = applyHeaderFields(parseSession(SAMPLE), { bpm: 90 });
  expect(session.bpm).toBe(90);
  expect(formatSessionText(session)).toMatch(/bpm:\s*90/);
});
