import { parseSession } from "../src/parser";
import { scheduleSession } from "../src/schedule";
import { encodeMidi } from "../src/midi/encode";
import { decodeMidiToSession } from "../src/midi/decode";

test("encode then decode keeps bpm and note count", () => {
  const session = parseSession(`bpm: 120
steps: 8
track piano
role: keys
C4 |x...x...|
`);
  const bytes = encodeMidi(session, scheduleSession(session));
  const imported = decodeMidiToSession(bytes);
  expect(imported.bpm).toBe(120);
  const scheduled = scheduleSession(imported);
  expect(scheduled.length).toBeGreaterThanOrEqual(2);
});

test("program change is encoded before note-on at tick 0", () => {
  const session = parseSession(`bpm: 120
steps: 4
track guitar
role: guitar
program: 24
E3 |x...|
`);
  const bytes = [...encodeMidi(session, scheduleSession(session))];
  const prog = bytes.findIndex((b, i) => b === 0xc1 && bytes[i + 1] === 24);
  const note = bytes.findIndex((b, i) => b === 0x91 && bytes[i + 1] === 52);
  expect(prog).toBeGreaterThanOrEqual(0);
  expect(note).toBeGreaterThanOrEqual(0);
  expect(prog).toBeLessThan(note);
});
