# Sticky Pitch Grid Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `.daw` open by default in a Custom Text Editor grid with a sticky pitch column, click-to-edit cells, header form, and playhead highlight.

**Architecture:** `DawGridEditorProvider` hosts a Webview that renders one track’s rows with CSS sticky pitch labels. All reads/writes go through `parseSession` / `formatSessionText`; cell toggles use a pure `cellEdit` helper. Extension broadcasts playhead step to open grid editors.

**Tech Stack:** TypeScript, VS Code Custom Text Editor API, Webview HTML/CSS/JS, Jest, existing parser/serialize/velocity.

**Spec:** `docs/superpowers/specs/2026-09-30-sticky-pitch-grid-editor-design.md`

---

## File map

| Path | Responsibility |
|---|---|
| `src/gridEditor/cellEdit.ts` | Pure cell toggle / velocity cycle / apply to Session |
| `src/gridEditor/sessionView.ts` | Session → JSON DTO for webview (+ reverse header apply) |
| `src/gridEditor/DawGridEditorProvider.ts` | CustomTextEditorProvider, doc sync, messages, write-back |
| `src/gridEditor/registerGridEditor.ts` | `registerCustomEditorProvider` + playhead fan-out handle |
| `media/gridEditor.css` | Sticky pitch column + grid layout |
| `media/gridEditor.js` | Webview UI: render, click, postMessage |
| `media/gridEditor.html` | Shell markup (or inline HTML from provider) |
| `package.json` | `customEditors` contribution |
| `src/extension.ts` | Register provider; broadcast playhead |
| `tests/cellEdit.test.ts` | Toggle / cycle / write-back round-trip |
| `tests/sessionView.test.ts` | DTO shape for one track |

---

### Task 1: Pure cell edit helpers (TDD)

**Files:**
- Create: `src/gridEditor/cellEdit.ts`
- Create: `tests/cellEdit.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { nextCellOnClick, applyCellEdit } from "../src/gridEditor/cellEdit";
import { parseSession } from "../src/parser";
import { formatSessionText } from "../src/serialize";

test("plain click toggles rest ↔ default hit", () => {
  expect(nextCellOnClick("rest", false)).toBe("6");
  expect(nextCellOnClick("6", false)).toBe("rest");
  expect(nextCellOnClick("hold", false)).toBe("rest");
});

test("shift-click cycles velocity then rest", () => {
  expect(nextCellOnClick("rest", true)).toBe("4");
  expect(nextCellOnClick("4", true)).toBe("6");
  expect(nextCellOnClick("6", true)).toBe("8");
  expect(nextCellOnClick("8", true)).toBe("rest");
});

test("applyCellEdit updates session and serializes", () => {
  const text = `bpm: 100
meter: 4/4
steps: 4
swing: 0

track piano
role: keys
plugin: keys.gm
program: 0
channel: 1

C4 |....|
`;
  const session = parseSession(text);
  const next = applyCellEdit(session, "piano", "C4", 0, false);
  expect(next.tracks[0].rows[0].cells[0]).toBe("6");
  const out = formatSessionText(next);
  expect(out).toContain("6");
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

Run: `npx jest tests/cellEdit.test.ts -v`

- [ ] **Step 3: Implement `src/gridEditor/cellEdit.ts`**

```typescript
import { CellKind, Session } from "../types";

const DEFAULT_HIT: CellKind = "6";
const SHIFT_CYCLE: CellKind[] = ["4", "6", "8", "rest"];

export function nextCellOnClick(cell: CellKind, shift: boolean): CellKind {
  if (shift) {
    if (cell === "rest" || cell === "hold") return "4";
    const idx = SHIFT_CYCLE.indexOf(cell);
    if (idx >= 0) return SHIFT_CYCLE[(idx + 1) % SHIFT_CYCLE.length];
    // treat hit/accent/ghost/other digits as entering cycle from nearest
    return "4";
  }
  if (cell === "rest" || cell === "hold") return DEFAULT_HIT;
  return "rest";
}

export function applyCellEdit(
  session: Session,
  trackName: string,
  rowId: string,
  stepIndex: number,
  shift: boolean,
): Session {
  const tracks = session.tracks.map((track) => {
    if (track.name !== trackName) return track;
    const rows = track.rows.map((row) => {
      if (row.id.toLowerCase() !== rowId.toLowerCase()) return row;
      const cells = row.cells.slice();
      while (cells.length <= stepIndex) cells.push("rest");
      cells[stepIndex] = nextCellOnClick(cells[stepIndex], shift);
      return { ...row, cells };
    });
    return { ...track, rows };
  });
  return { ...session, tracks };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx jest tests/cellEdit.test.ts -v`

- [ ] **Step 5: Commit**

```bash
git add src/gridEditor/cellEdit.ts tests/cellEdit.test.ts
git commit -m "feat: add grid cell click edit helpers"
```

---

### Task 2: Session view DTO + header apply

**Files:**
- Create: `src/gridEditor/sessionView.ts`
- Create: `tests/sessionView.test.ts`

- [ ] **Step 1: Write failing tests for DTO + header update**

```typescript
import { parseSession } from "../src/parser";
import { formatSessionText } from "../src/serialize";
import { sessionToView, applyHeaderFields } from "../src/gridEditor/sessionView";

const SAMPLE = `bpm: 120
meter: 4/4
steps: 4
swing: 0

track keys
role: keys
plugin: keys.gm

C4 |.6..|
`;

test("sessionToView exposes sticky row labels and cells", () => {
  const view = sessionToView(parseSession(SAMPLE), "keys");
  expect(view.trackName).toBe("keys");
  expect(view.rows[0].id).toBe("C4");
  expect(view.rows[0].cells[1]).toBe("6");
  expect(view.bpm).toBe(120);
  expect(view.stepsPerBar).toBe(4);
});

test("applyHeaderFields updates bpm and serializes", () => {
  const session = applyHeaderFields(parseSession(SAMPLE), { bpm: 90 });
  expect(session.bpm).toBe(90);
  expect(formatSessionText(session)).toMatch(/bpm:\s*90/);
});
```

- [ ] **Step 2: Implement `sessionView.ts`**

Export:

```typescript
export interface GridRowView { id: string; cells: string[]; }
export interface GridSessionView {
  trackName: string;
  trackNames: string[];
  bpm: number;
  meter: string;
  stepsPerBar: number;
  swing: number;
  rows: GridRowView[];
  warnings: { message: string; line?: number }[];
  unsupportedVersion: boolean;
}

export function sessionToView(session: Session, trackName?: string): GridSessionView;
export function applyHeaderFields(
  session: Session,
  fields: Partial<{ bpm: number; meter: string; stepsPerBar: number; swing: number }>,
): Session;
```

- [ ] **Step 3: Tests PASS + commit**

```bash
git add src/gridEditor/sessionView.ts tests/sessionView.test.ts
git commit -m "feat: add grid session view DTO"
```

---

### Task 3: Register Custom Text Editor + provider write-back

**Files:**
- Create: `src/gridEditor/DawGridEditorProvider.ts`
- Create: `src/gridEditor/registerGridEditor.ts`
- Modify: `package.json` (`contributes.customEditors`)
- Modify: `src/extension.ts` (call register)
- Create: `media/gridEditor.css`, `media/gridEditor.js` (minimal stub OK if HTML built in provider)

- [ ] **Step 1: Add to `package.json` contributes**

```json
"customEditors": [
  {
    "viewType": "vsDaw.gridEditor",
    "displayName": "VS DAW Grid",
    "selector": [{ "filenamePattern": "*.daw" }],
    "priority": "default"
  }
]
```

- [ ] **Step 2: Implement provider**

Responsibilities:
- `resolveCustomTextEditor`: set `webview.options.enableScripts`, load HTML with css/js asWebviewUri
- On doc change / open: `parseSession` → `sessionToView` → `postMessage({ type: "session", view, selectedTrack })`
- Handle messages:
  - `{ type: "ready" }` → push session
  - `{ type: "selectTrack", trackName }` → re-push view for track
  - `{ type: "cellClick", trackName, rowId, stepIndex, shift }` → `applyCellEdit` → `formatSessionText` → full-document `WorkspaceEdit`
  - `{ type: "headerChange", fields }` → `applyHeaderFields` → write back
- Maintain static/weak registry of open panels for playhead fan-out: `broadcastPlayhead(step: number)`

- [ ] **Step 3: `registerGridEditor(context)` from `extension.ts` activate**

- [ ] **Step 4: Compile**

Run: `npm run compile`  
Expected: success

- [ ] **Step 5: Commit**

```bash
git add package.json src/gridEditor src/extension.ts media/gridEditor.*
git commit -m "feat: register default .daw grid custom editor"
```

---

### Task 4: Webview sticky UI + click wiring

**Files:**
- Modify: `media/gridEditor.css`
- Modify: `media/gridEditor.js`
- Modify: `src/gridEditor/DawGridEditorProvider.ts` (HTML template if needed)

- [ ] **Step 1: Layout**

Structure:

```html
<div class="toolbar">track select + bpm/meter/steps/swing inputs</div>
<div class="warn" hidden></div>
<div class="scroller">
  <table class="grid">
    <thead><!-- step numbers; playhead class on col --></thead>
    <tbody>
      <tr>
        <th class="pitch sticky">C4</th>
        <td data-step="0">...</td>
      </tr>
    </tbody>
  </table>
</div>
```

CSS essentials:

```css
.scroller { overflow: auto; max-height: 100%; }
th.pitch.sticky {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--vscode-editor-background);
}
td.playhead { outline: 1px solid var(--vscode-focusBorder); }
```

- [ ] **Step 2: JS**

- On `message` type `session`: render table from `view.rows`
- Click `td`: `postMessage({ type:"cellClick", ... shift: e.shiftKey })`
- Track/header change: postMessage
- On `playhead`: set `.playhead` on matching step column cells

- [ ] **Step 3: Manual check** (F5 Extension Development Host): open long `.daw`, scroll horizontally — pitch stays left; click toggles; Shift cycles

- [ ] **Step 4: Commit**

```bash
git add media/gridEditor.css media/gridEditor.js src/gridEditor
git commit -m "feat: sticky pitch column and click editing in grid webview"
```

---

### Task 5: Playhead broadcast from extension

**Files:**
- Modify: `src/extension.ts` (`updatePlayhead`)
- Modify: `src/gridEditor/registerGridEditor.ts` (export `broadcastPlayhead`)

- [ ] **Step 1: In `updatePlayhead`, after computing step, call `broadcastPlayhead(step)` for the active `.daw` URI when playing**

- [ ] **Step 2: Provider posts `{ type: "playhead", step }` only to editors for that document URI (or all daw grids if URI matches playing source)**

- [ ] **Step 3: Compile + commit**

```bash
git add src/extension.ts src/gridEditor
git commit -m "feat: sync playhead highlight into grid editor"
```

---

### Task 6: Verify suite + smoke

- [ ] **Step 1:** `npx jest` — all pass  
- [ ] **Step 2:** `npm run compile` — success  
- [ ] **Step 3:** Optional `npm run package` if releasing  
- [ ] **Step 4:** Final commit only if leftover fixes

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Default Custom Text Editor for `.daw` | 3 |
| Sticky pitch column + H-scroll | 4 |
| Click / Shift-click cells | 1, 3, 4 |
| Track switch + header form | 2, 3, 4 |
| Playhead highlight | 5 |
| Text reopen still available | 3 (priority default; VS Code built-in reopen) |
| parse/serialize as source of truth | 1–3 |
| Unit tests for cell edit | 1 |
| No full piano roll | out of scope |

## Execution

User requested immediate implementation (`做`). Execute **Inline** with this plan (executing-plans style), task by task.
