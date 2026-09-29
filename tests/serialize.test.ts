import { parseSession } from "../src/parser";
import { emptyTemplate, formatSessionText } from "../src/serialize";

test("emptyTemplate has four role tracks", () => {
  const session = parseSession(emptyTemplate({ bpm: 120, bars: 2 }));
  expect(session.tracks.map((t) => t.role).sort()).toEqual([
    "bass", "drums", "guitar", "keys",
  ]);
});

test("formatSessionText preserves sustain cells", () => {
  const src = emptyTemplate();
  const again = formatSessionText(parseSession(src));
  expect(parseSession(again).tracks.length).toBe(4);
});
