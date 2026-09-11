import { DEFAULT_KIT_ID, KitId, normalizeKitId } from "./kits/registry";
import { synthTemplatesFor } from "./kits/synthTemplates";

export interface OscVoice {
  kind: "osc";
  from: number;
  to: number;
  decay: number;
  level: number;
  type: "sine" | "triangle" | "square";
  delay: number;
}

export interface NoiseVoice {
  kind: "noise";
  decay: number;
  level: number;
  filter: "highpass" | "bandpass";
  frequency: number;
  q: number;
  delay: number;
}

export type Voice = OscVoice | NoiseVoice;

const MIN_LEVEL = 0.0001;

export function voicesFor(
  drumId: string,
  velocity: number,
  kitId: string = DEFAULT_KIT_ID,
): Voice[] {
  const { kitId: resolved } = normalizeKitId(kitId);
  const templates = synthTemplatesFor(resolved)?.[drumId]
    ?? synthTemplatesFor(DEFAULT_KIT_ID)?.[drumId];
  if (!templates) return [];
  const scale = Math.max(0, Math.min(127, velocity)) / 127;
  return templates.map((template) => {
    const { gain, delay, ...rest } = template;
    const q = "q" in rest ? rest.q ?? 1 : undefined;
    return {
      ...rest,
      ...(q === undefined ? {} : { q }),
      delay: delay ?? 0,
      level: Math.max(MIN_LEVEL, gain * scale),
    } as Voice;
  });
}

export function voiceDuration(voice: Voice): number {
  return voice.delay + voice.decay;
}

export function resolveKitId(kitId: string): KitId {
  return normalizeKitId(kitId).kitId;
}
