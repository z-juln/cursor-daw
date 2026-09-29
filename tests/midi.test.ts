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
