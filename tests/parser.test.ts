import { parseSession } from "../src/parser";

test("parses global header and multi tracks with sustain", () => {
  const session = parseSession(`# cursor-daw 1
bpm: 100
steps: 8
track drums
role: drums
kick |x...x...|
track piano
role: keys
program: 0
C4   |x===....|
`);
  expect(session.bpm).toBe(100);
  expect(session.tracks).toHaveLength(2);
  expect(session.tracks[1].rows[0].cells.slice(0, 4)).toEqual([
    "hit", "hold", "hold", "hold",
  ]);
});

test("unknown role falls back to keys with warning", () => {
  const session = parseSession(`track x
role: harp
C4 |x...|
`);
  expect(session.tracks[0].role).toBe("keys");
  expect(session.warnings.some((w) => w.message.includes("role"))).toBe(true);
});

test("global steps with velocity chars", () => {
  const session = parseSession(`steps: 8
track drums
role: drums
kick |xXo*.q..|
`);
  expect(session.tracks[0].rows[0].cells.slice(0, 6)).toEqual([
    "hit", "accent", "ghost", "hit", "rest", "rest",
  ]);
  expect(session.warnings.some((w) => w.message.includes("q"))).toBe(true);
});
