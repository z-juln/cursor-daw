import {
  buildPlayheadIndex,
  playheadCells,
  playheadCellsFromIndex,
} from "../src/playhead";
import { parseSession } from "../src/parser";
import { stepDurationSec } from "../src/schedule";

const SAMPLE = `# cursor-daw 1
bpm: 120
meter: 4/4
steps: 4

track drums
role: drums
kick   |x...|x...|
snare  |..x.|..x.|
`;

test("playheadCells marks the same step on every row", () => {
  const session = parseSession(SAMPLE);
  const lines = SAMPLE.split("\n");
  const at0 = playheadCells(session, (i) => lines[i], 0);
  expect(at0).toHaveLength(2);
  expect(lines[at0[0].line][at0[0].character]).toBe("x");
  expect(lines[at0[1].line][at0[1].character]).toBe(".");

  // step 2：kick '.'，snare 'x'
  const at2 = playheadCells(session, (i) => lines[i], stepDurationSec(session) * 2 + 0.001);
  expect(lines[at2[0].line][at2[0].character]).toBe(".");
  expect(lines[at2[1].line][at2[1].character]).toBe("x");
});

test("playhead index can filter to visible lines", () => {
  const session = parseSession(SAMPLE);
  const lines = SAMPLE.split("\n");
  const index = buildPlayheadIndex(session, (i) => lines[i]);
  const onlySnare = playheadCellsFromIndex(index, 0, {
    startLine: 8,
    endLine: 8,
  });
  expect(onlySnare).toHaveLength(1);
  expect(onlySnare[0].line).toBe(8);
});
