# Cursor DAW Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Cursor Drum into Cursor DAW: multi-track `.daw` text, sidebar DAW shell, and MIDI+SoundFont playback via `spessasynth_core`.

**Architecture:** Parse `.daw` grids into a Session → encode MIDI in memory → synthesize with an embedded GM SF2 through `spessasynth_core` → play PCM on `node-web-audio-api`. Sidebar keeps Library / Performance / Create; Performance switches the armed track and Pad map. No legacy `.drum` support.

**Tech Stack:** TypeScript, VS Code Extension API, Jest, `spessasynth_core`, `node-web-audio-api`, esbuild, vsce.

**Spec:** `docs/superpowers/specs/2026-09-29-cursor-daw-design.md`

---

## File map (target)

| Path | Responsibility |
|---|---|
| `package.json` | Rename to `cursor-daw`, `.daw` language, `cursorDaw.*` commands |
| `media/daw.svg` | Activity bar icon (replace `media/drum.svg`) |
| `media/soundfonts/gm.sf2` | Bundled GM SoundFont (binary asset) |
| `syntaxes/cursor-daw.tmLanguage.json` | TextMate grammar for `.daw` |
| `src/types.ts` | `Session`, `DawTrack`, `GridRow`, `CellKind`, transport types |
| `src/pitch.ts` | Pitch name ↔ MIDI note number |
| `src/drums.ts` | Drum id ↔ GM percussion note (keep compact map) |
| `src/parser.ts` | Parse `.daw` text → `Session` |
| `src/serialize.ts` | Format / empty multi-track template |
| `src/schedule.ts` | Session → timed note events (with sustain) |
| `src/midi/types.ts` | In-memory MIDI song model |
| `src/midi/encode.ts` | Session/events → MIDI bytes / `BasicMIDI` |
| `src/midi/decode.ts` | MIDI → Session (import) |
| `src/midi/gm.ts` | role/program/channel defaults + drum note table |
| `src/audio/soundfontEngine.ts` | Load SF2, play MIDI / live noteOn, feed AudioContext |
| `src/engine.ts` | Thin transport wrapper around soundfont engine (or merge) |
| `src/library.ts` | `~/.cursor-daw`, recursive examples sync (already mostly done) |
| `src/sidebar/*` | Rename commands; Performance track picker + role pads |
| `src/extension.ts` | Activate wiring, import/export commands |
| `examples/**` | Multi-track `.daw` demos under styles/rhythms |
| `agent/SKILL.md` / `README.md` | New format + MIDI docs |
| Delete / stop shipping | `src/kits/**`, `src/voices.ts`, `src/samples.ts`, `media/kits/**` (after engine switch) |

---

### Task 1: Rename extension scaffold + icon

**Files:**
- Modify: `package.json`
- Create: `media/daw.svg`
- Create: `syntaxes/cursor-daw.tmLanguage.json`
- Modify: `language-configuration.json` (keep)
- Delete later: `media/drum.svg`, `syntaxes/cursor-drum.tmLanguage.json` (after Task 1 swap)

- [ ] **Step 1: Update `package.json` identity**

Set at minimum:

```json
{
  "name": "cursor-daw",
  "displayName": "Cursor DAW",
  "description": "纯文本多轨 DAW：鼓/钢琴/吉他/贝斯、MIDI+SoundFont 播放",
  "version": "1.0.0",
  "publisher": "cursor-daw"
}
```

Replace language contribution:

```json
"languages": [{
  "id": "cursor-daw",
  "aliases": ["Cursor DAW", "daw"],
  "extensions": [".daw"],
  "configuration": "./language-configuration.json"
}],
"grammars": [{
  "language": "cursor-daw",
  "scopeName": "source.cursor-daw",
  "path": "./syntaxes/cursor-daw.tmLanguage.json"
}],
"viewsContainers": {
  "activitybar": [{
    "id": "cursorDaw",
    "title": "Cursor DAW",
    "icon": "media/daw.svg"
  }]
}
```

Rename view ids to `cursorDaw.playlist` / `cursorDaw.recorder` / `cursorDaw.creator`.  
Rename every command from `cursorDrum.*` → `cursorDaw.*` and context keys similarly (`cursorDaw.padMode`, etc.).  
Activation: `onLanguage:cursor-daw`, `onStartupFinished`.

- [ ] **Step 2: Add grammar + icon**

Create `syntaxes/cursor-daw.tmLanguage.json` scoped `source.cursor-daw` (headers, `track`, grid pipes).  
Create `media/daw.svg`: simple monochrome waveform/note mark (24×24 viewBox), no purple glow.

- [ ] **Step 3: Commit**

```bash
git add package.json media/daw.svg syntaxes/cursor-daw.tmLanguage.json
git commit -m "chore: rename extension scaffold to cursor-daw"
```

---

### Task 2: Core types + pitch helpers (TDD)

**Files:**
- Create/Rewrite: `src/types.ts`
- Create: `src/pitch.ts`
- Create: `tests/pitch.test.ts`

- [ ] **Step 1: Write failing pitch tests**

```ts
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
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- tests/pitch.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `src/pitch.ts` + rewrite `src/types.ts`**

```ts
// src/types.ts (essential shapes)
export type TrackRole = "drums" | "keys" | "guitar" | "bass";
export type CellKind = "rest" | "hit" | "accent" | "ghost" | "hold";

export interface ParseWarning {
  message: string;
  line?: number;
}

export interface GridRow {
  id: string; // drum id or pitch name
  cells: CellKind[];
  lineIndex: number;
}

export interface DawTrack {
  name: string;
  role: TrackRole;
  plugin: string;
  program?: number;
  channel?: number;
  rows: GridRow[];
}

export interface Session {
  bpm: number;
  meter: string;
  stepsPerBar: number;
  swing: number;
  tracks: DawTrack[];
  warnings: ParseWarning[];
  unsupportedVersion: boolean;
}

export interface TimedNote {
  trackName: string;
  role: TrackRole;
  note: number; // MIDI note
  velocity: number;
  timeSec: number;
  durationSec: number;
  channel: number;
  program: number;
}

export type TransportStatus = "stopped" | "playing" | "paused";
```

Implement `pitchToMidi` / `midiToPitch` with standard 12-TET and `C4=60`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/pitch.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/pitch.ts tests/pitch.test.ts
git commit -m "feat: add Session types and pitch helpers"
```

---

### Task 3: `.daw` parser (TDD)

**Files:**
- Rewrite: `src/parser.ts`
- Rewrite: `tests/parser.test.ts`
- Modify: `src/drums.ts` (keep `canonicalDrumId` / `BUILTIN_ORDER`)

- [ ] **Step 1: Write failing parser tests**

```ts
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
  const session = parseSession(`track x\nrole: harp\nC4 |x...|\n`);
  expect(session.tracks[0].role).toBe("keys");
  expect(session.warnings.some((w) => w.message.includes("role"))).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/parser.test.ts`  
Expected: FAIL (`parseSession` missing / old `parseScore` API)

- [ ] **Step 3: Implement `parseSession`**

Rules from spec:
- Global: `bpm`, `meter`, `steps`, `swing`
- `track <name>` starts a block; `role`, `plugin`, `program`, `channel` keys
- Grid lines: `id |cells|`; map `.`/`-`/`·`→rest, `x/*`→hit, `X`→accent, `o`→ghost, `=`→hold
- Default role by name heuristics if missing: `drum*`→drums, `bass*`→bass, `gtr|guitar*`→guitar, else keys
- Default plugins: `drum.gm` / `keys.gm` / `gtr.gm` / `bass.gm`
- Version line `# cursor-daw 1`; other major → `unsupportedVersion`

Export `parseSession` (do not keep `parseScore`).

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- tests/parser.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts tests/parser.test.ts src/drums.ts
git commit -m "feat: parse multi-track .daw sessions"
```

---

### Task 4: Serialize + empty template (TDD)

**Files:**
- Rewrite: `src/serialize.ts`
- Rewrite: `tests/serialize.test.ts`

- [ ] **Step 1: Failing tests for template + round format**

```ts
import { emptyTemplate, formatSessionText } from "../src/serialize";
import { parseSession } from "../src/parser";

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
```

- [ ] **Step 2: Implement `emptyTemplate` / `formatSessionText`**

Emit `# cursor-daw 1` header + four tracks with empty/rest grids sized `bars * 16`.  
Cell emit: rest→`.`, hit→`x`, accent→`X`, ghost→`o`, hold→`=`.

- [ ] **Step 3: Tests PASS + commit**

```bash
git add src/serialize.ts tests/serialize.test.ts
git commit -m "feat: serialize .daw templates"
```

---

### Task 5: Schedule timed notes with sustain (TDD)

**Files:**
- Rewrite: `src/schedule.ts`
- Rewrite: `tests/schedule.test.ts`
- Create: `src/midi/gm.ts`

- [ ] **Step 1: Failing schedule test**

```ts
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
  // 4 steps at 120bpm 4/4 steps=4 → each step = 0.5s; hit+3 holds = 2.0s
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
```

- [ ] **Step 2: Implement `src/midi/gm.ts` defaults**

```ts
export const DEFAULT_PROGRAM: Record<string, number> = {
  drums: 0, keys: 0, guitar: 24, bass: 32,
};
export const DEFAULT_CHANNEL: Record<string, number> = {
  drums: 9, keys: 0, guitar: 1, bass: 2, // 0-based; drums=10 → index 9
};
export const DRUM_TO_GM: Record<string, number> = {
  kick: 36, snare: 38, ch: 42, oh: 46, clap: 39,
  tom1: 50, tom2: 47, tom3: 45, crash: 49, ride: 51,
};
```

- [ ] **Step 3: Implement `scheduleSession`**

For each row cell:
- On hit/accent/ghost: start note; scan forward while `hold` to compute end step
- Drums: `durationSec` fixed short (e.g. 0.15) regardless of `=`
- Apply swing like old schedule
- Velocity: hit=100, accent=127, ghost=50

- [ ] **Step 4: PASS + commit**

```bash
git add src/schedule.ts src/midi/gm.ts tests/schedule.test.ts
git commit -m "feat: schedule session notes with sustain"
```

---

### Task 6: MIDI encode / decode (TDD)

**Files:**
- Create: `src/midi/encode.ts`
- Create: `src/midi/decode.ts`
- Create: `src/midi/types.ts`
- Create: `tests/midi.test.ts`
- Depend: `spessasynth_core` (for `BasicMIDI` read/write) **or** minimal custom SMF writer if lighter

- [ ] **Step 1: Install dependency**

```bash
npm install spessasynth_core
```

- [ ] **Step 2: Failing round-trip test**

```ts
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
```

- [ ] **Step 3: Implement encode**

Build SMF Type 1: tempo track + one MIDI track per DawTrack; program change; note on/off from `TimedNote`. Prefer `BasicMIDI` APIs from `spessasynth_core` if available; otherwise write a minimal SMF encoder in `encode.ts`.

- [ ] **Step 4: Implement decode**

Parse MIDI → create tracks by channel; ch10→`role:drums` with GM reverse map; other channels infer role from program; quantize notes onto `steps:16` grid with `x`/`=` fills.

- [ ] **Step 5: PASS + commit**

```bash
git add package.json package-lock.json src/midi tests/midi.test.ts
git commit -m "feat: MIDI encode/decode for .daw sessions"
```

---

### Task 7: SoundFont engine + SF2 asset

**Files:**
- Create: `media/soundfonts/gm.sf2` (download a redistributable GM bank; document source in README)
- Create: `src/audio/soundfontEngine.ts`
- Create: `tests/soundfontEngine.test.ts` (unit-test scheduling hooks with fake context where possible)
- Rewrite: `src/engine.ts` to delegate OR replace callers to `SoundfontEngine`
- Delete after green: `src/kits/**`, `src/voices.ts`, `src/samples.ts`, `media/kits/**`, related tests

- [ ] **Step 1: Obtain SF2**

Place a GM SoundFont at `media/soundfonts/gm.sf2` (e.g. a small permissive GM bank).  
Ensure `.vscodeignore` does **not** exclude `media/soundfonts/**`.

- [ ] **Step 2: Implement `SoundfontEngine`**

Public API sketch:

```ts
export class SoundfontEngine {
  constructor(
    createContext: () => AudioContextLike,
    options: { sf2Path: string; lookaheadSec?: number },
  );
  async warmUp(): Promise<void>;
  load(notes: TimedNote[], durationSec: number, loop: boolean): void;
  play(fromSec: number): void;
  pause(): void;
  stop(): void;
  /** Live Pad */
  noteOn(note: number, velocity: number, channel: number, program: number): void;
  noteOff(note: number, channel: number): void;
  dispose(): void;
}
```

Implementation approach (verify in spike if needed):
1. Load SF2 via `SoundBankLoader.fromArrayBuffer`
2. For **Pad**: use processor live path if workable with `node-web-audio-api`; else render a short one-shot buffer per noteOn
3. For **transport**: either sequence with `SpessaSynthSequencer` into offline buffers chunked ahead, OR convert upcoming window of MIDI to PCM and `copyToChannel` like the old drum sampler

Keep master gain + tanh soft limiter behavior.

- [ ] **Step 3: Manual verify script**

Extend or replace `scripts/verifyAudio.ts` → `npm run verify:audio` plays a tiny multi-track session through SF2.

- [ ] **Step 4: Remove old synth kit pipeline + fix tests**

Update/remove `tests/voices.test.ts`, `tests/samples.test.ts`, `tests/kits.test.ts`, `tests/engine.test.ts` for new engine contracts.

- [ ] **Step 5: Commit**

```bash
git add media/soundfonts src/audio src/engine.ts scripts package.json
git commit -m "feat: play sessions via SoundFont MIDI engine"
```

---

### Task 8: Library path + examples as `.daw`

**Files:**
- Modify: `src/library.ts` (`defaultLibraryRoot` → `~/.cursor-daw`)
- Replace: `examples/**` with `.daw` multi-track demos (keep folder taxonomy `styles/` `rhythms/` `legacy/` or simplify)
- Modify: `tests/library.test.ts` if needed

- [ ] **Step 1: Change default root**

```ts
export function defaultLibraryRoot(): string {
  return path.join(os.homedir(), ".cursor-daw");
}
```

- [ ] **Step 2: Rewrite examples**

At least:
- `examples/demo/band.daw` — four tracks playing together
- Keep a few rhythm/style demos as multi-track (drums + optional keys/bass)
- Remove `.drum` files

- [ ] **Step 3: Tests + commit**

```bash
git add src/library.ts examples tests/library.test.ts
git commit -m "feat: use ~/.cursor-daw library and .daw examples"
```

---

### Task 9: Sidebar Performance — track arming + role pads

**Files:**
- Modify: `src/sidebar/recorderProvider.ts`
- Modify: `src/sidebar/registerSidebar.ts`
- Modify: `src/sidebar/creatorProvider.ts`
- Modify: `src/extension.ts` (state: `armedTrackName`, pad keymap by role)
- Modify: `package.json` menus/commands (`cursorDaw.pickTrack`, `cursorDaw.importMidi`, `cursorDaw.exportMidi`)

- [ ] **Step 1: Extend recorder state**

```ts
export interface RecorderViewState {
  padEnabled: boolean;
  recordingEnabled: boolean;
  playing: boolean;
  bpm: number;
  position: string;
  audioState: string;
  tracks: { name: string; role: TrackRole }[];
  armedTrackName: string;
  octave: number; // for pitch pads
}
```

UI rows when Pad ON:
- `当前轨：piano ▾` → `cursorDaw.pickTrack` QuickPick
- `八度：4` (keys/gtr/bass only) → bump commands
- Pad list from role map (drums vs pitch degrees)

- [ ] **Step 2: Wire Pad hit**

`cursorDaw.padHit`:
- Resolve armed track → channel/program
- Drums: map key→GM drum note
- Pitch roles: map key→scale degree + octave → MIDI note
- `soundfontEngine.noteOn(...)`
- If recording: write into document grid for that track/row (create pitch row if missing)

- [ ] **Step 3: Import/Export commands**

- `cursorDaw.exportMidi`: write beside current file or Save dialog
- `cursorDaw.importMidi`: Open dialog → `decodeMidiToSession` → save `.daw` into library

- [ ] **Step 4: Manual sidebar smoke + commit**

```bash
git add src/sidebar src/extension.ts package.json
git commit -m "feat: DAW sidebar track arming and MIDI import/export"
```

---

### Task 10: Extension transport wiring + command rename sweep

**Files:**
- Rewrite wiring in: `src/extension.ts`
- Modify: `src/padMode.ts`, `src/kitMode.ts` → replace kitMode with `TrackArm` / delete `kitMode.ts`
- Grep: replace remaining `cursorDrum` / `.drum` / `parseScore` references

- [ ] **Step 1: Grep cleanup**

```bash
rg -n "cursorDrum|parseScore|\\.drum|cursor-drum|KitMode|voicesFor" src tests package.json README.md agent || true
```

Fix all hits.

- [ ] **Step 2: `loadSource` path**

```ts
const session = parseSession(text);
audio.load(scheduleSession(session), scoreDurationSec(session), loop);
```

- [ ] **Step 3: `npm test` + `npm run check` green**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire cursor-daw transport and remove drum-only paths"
```

---

### Task 11: Docs + Agent skill

**Files:**
- Rewrite: `README.md`
- Rewrite: `agent/SKILL.md`
- Modify: `agent/AGENTS.md` if present

- [ ] **Step 1: Document format, MIDI, SF2, panels, keys**

Include `.daw` example, `x===`, roles, import/export, `~/.cursor-daw`.

- [ ] **Step 2: Commit**

```bash
git add README.md agent
git commit -m "docs: Cursor DAW format and usage"
```

---

### Task 12: Package, install, sync library

**Files:**
- Modify: `.vscodeignore` (include `media/soundfonts/**`, exclude old kits if any)
- Run package/install

- [ ] **Step 1: Build**

```bash
npm test
npm run compile
npm run package
```

Expected: `cursor-daw-1.0.0.vsix` (or current version)

- [ ] **Step 2: Install**

```bash
cursor --install-extension cursor-daw-*.vsix --force
```

- [ ] **Step 3: Sync user library**

Copy bundled `examples/**/*.daw` into `~/.cursor-daw` (or use in-app sync after reload).

- [ ] **Step 4: Final commit if ignore/version tweaks remain**

```bash
git add .vscodeignore package.json
git commit -m "chore: package cursor-daw 1.0.0"
```

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| Rename cursor-daw / `.daw` / commands / `~/.cursor-daw` | 1, 8, 10 |
| New icon | 1 |
| Multi-track grid + `x===` | 2–5 |
| MIDI encode/export | 6, 9 |
| MIDI import | 6, 9 |
| SoundFont playback | 7 |
| Sidebar Z + arm track + role pads | 9 |
| Four instruments via GM | 5–7, 9 |
| Examples + sync | 8, 12 |
| Agent/README | 11 |
| No legacy `.drum` | 8, 10 |

## Self-review notes

- No TBD steps; SF2 acquisition is an explicit Step with path `media/soundfonts/gm.sf2`.
- Engine integration may need a short spike inside Task 7 Step 2; keep fallback “render PCM buffer per window” if live sequencer binding is awkward under `node-web-audio-api`.
- Types use `Session` / `DawTrack` / `TimedNote` consistently across Tasks 2–10.
