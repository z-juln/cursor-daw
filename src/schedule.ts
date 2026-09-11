import { ScheduledNote, Score } from "./types";

export interface TimingContext {
  bpm: number;
  meter: string;
  stepsPerBar: number;
  swing: number;
}

function meterParts(meter: string): [number, number] {
  const match = meter.match(/^(\d+)\/(\d+)$/);
  const numerator = Number(match?.[1]);
  const denominator = Number(match?.[2]);
  return numerator > 0 && denominator > 0 ? [numerator, denominator] : [4, 4];
}

export function stepDurationSec(context: TimingContext): number {
  const [numerator, denominator] = meterParts(context.meter);
  const barSec = numerator * (60 / context.bpm) * (4 / denominator);
  return barSec / context.stepsPerBar;
}

export function stepTimeSec(context: TimingContext, step: number): number {
  const duration = stepDurationSec(context);
  const swingDelay = step % 2 === 1
    ? (context.swing / 100) * (duration / 2)
    : 0;
  return step * duration + swingDelay;
}

export function scheduleNotes(score: Score): ScheduledNote[] {
  const notes: ScheduledNote[] = [];
  score.tracks.forEach((track) => {
    if (!track.canonicalId) return;
    track.cells.forEach((cell, step) => {
      const velocity = cell === "hit" ? 100 : cell === "accent" ? 127 : cell === "ghost" ? 50 : 0;
      if (velocity > 0) {
        notes.push({
          timeSec: stepTimeSec(score, step),
          drumId: track.canonicalId!,
          velocity,
        });
      }
    });
  });
  return notes.sort((left, right) => left.timeSec - right.timeSec);
}

export function scoreDurationSec(score: Score): number {
  const length = Math.max(0, ...score.tracks.map((track) => track.cells.length));
  return length * stepDurationSec(score);
}
