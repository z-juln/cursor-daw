import { parseSession } from "../src/parser";
import { scheduleSession } from "../src/schedule";

test("hold cells extend duration", () => {
  const session = parseSession(`bpm: 120
steps: 4
track piano
role: keys
C4 |x===|
`);
  const notes = scheduleSession(session);
  expect(notes).toHaveLength(1);
  expect(notes[0].note).toBe(60);
  expect(notes[0].durationSec).toBeCloseTo(2.0, 5);
});

test("drums ignore hold cells for duration", () => {
  const session = parseSession(`bpm: 120
steps: 4
track drums
role: drums
kick |x===|
`);
  const notes = scheduleSession(session);
  expect(notes[0].durationSec).toBeLessThan(0.3);
});
