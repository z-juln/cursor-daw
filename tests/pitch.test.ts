import { midiToPitch, pitchToMidi } from "../src/pitch";

test("pitchToMidi parses sharps and octave", () => {
  expect(pitchToMidi("C4")).toBe(60);
  expect(pitchToMidi("F#3")).toBe(54);
  expect(pitchToMidi("Bb2")).toBe(46);
});

test("midiToPitch round-trips common notes", () => {
  expect(midiToPitch(60)).toBe("C4");
  expect(pitchToMidi(midiToPitch(61))).toBe(61);
});
