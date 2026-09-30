(function () {
  const vscode = acquireVsCodeApi();
  const trackSelect = document.getElementById("track");
  const bpmInput = document.getElementById("bpm");
  const meterInput = document.getElementById("meter");
  const stepsInput = document.getElementById("steps");
  const swingInput = document.getElementById("swing");
  const seekInput = document.getElementById("seek");
  const warnEl = document.getElementById("warn");
  const scroller = document.getElementById("scroller");
  const emptyEl = document.getElementById("empty");

  let view = null;
  let playheadStep = -1;
  let suppressHeader = false;
  let scrubbing = false;
  let seekDragging = false;
  let totalSteps = 0;

  function post(message) {
    vscode.postMessage(message);
  }

  function isOnset(ch) {
    return ch && ch !== "." && ch !== "-";
  }

  function stepFromEvent(event) {
    const el = event.target.closest("[data-step]");
    if (!el) return null;
    const step = Number(el.dataset.step);
    return Number.isFinite(step) ? step : null;
  }

  function emitSeek(step) {
    if (!Number.isFinite(step) || step < 0) return;
    paintPlayhead(step);
    if (seekInput && !seekDragging) {
      seekInput.value = String(step);
    }
    post({ type: "seekStep", stepIndex: step });
  }

  function render() {
    if (!view) return;
    suppressHeader = true;
    trackSelect.innerHTML = "";
    for (const name of view.trackNames) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === view.trackName) opt.selected = true;
      trackSelect.appendChild(opt);
    }
    bpmInput.value = String(view.bpm);
    meterInput.value = view.meter;
    stepsInput.value = String(view.stepsPerBar);
    swingInput.value = String(view.swing);
    suppressHeader = false;

    if (view.warnings && view.warnings.length) {
      warnEl.hidden = false;
      warnEl.textContent = view.warnings
        .map((w) => (w.line === undefined ? w.message : `L${w.line + 1}: ${w.message}`))
        .join(" · ");
    } else {
      warnEl.hidden = true;
      warnEl.textContent = "";
    }

    if (!view.rows.length) {
      emptyEl.hidden = false;
      scroller.hidden = true;
      scroller.innerHTML = "";
      totalSteps = 0;
      seekInput.max = "0";
      return;
    }
    emptyEl.hidden = true;
    scroller.hidden = false;

    const steps = view.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
    totalSteps = steps;
    seekInput.max = String(Math.max(0, steps - 1));
    if (!seekDragging) {
      seekInput.value = String(Math.max(0, Math.min(playheadStep, steps - 1)));
    }
    const stepsPerBar = Math.max(1, view.stepsPerBar || 4);
    const table = document.createElement("table");
    table.className = "grid";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "pitch";
    corner.textContent = "";
    headRow.appendChild(corner);
    for (let step = 0; step < steps; step++) {
      const th = document.createElement("th");
      th.className = "step" + (step === playheadStep ? " playhead" : "");
      th.dataset.step = String(step);
      th.textContent = String((step % stepsPerBar) + 1);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const row of view.rows) {
      const tr = document.createElement("tr");
      const pitch = document.createElement("th");
      pitch.className = "pitch sticky";
      pitch.textContent = row.id;
      tr.appendChild(pitch);
      for (let step = 0; step < steps; step++) {
        const ch = row.cells[step] ?? ".";
        const td = document.createElement("td");
        td.className = "cell";
        if (isOnset(ch)) td.classList.add(ch === "=" ? "hold" : "onset");
        if (step % stepsPerBar === 0) td.classList.add("bar-start");
        if (step === playheadStep) td.classList.add("playhead");
        td.dataset.rowId = row.id;
        td.dataset.step = String(step);
        td.textContent = ch === "." ? "·" : ch;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroller.innerHTML = "";
    scroller.appendChild(table);
  }

  function paintPlayhead(step) {
    playheadStep = step;
    for (const el of document.querySelectorAll(".playhead")) {
      el.classList.remove("playhead");
    }
    if (step < 0) return;
    for (const el of document.querySelectorAll(`[data-step="${step}"]`)) {
      el.classList.add("playhead");
    }
    if (seekInput && !seekDragging && totalSteps > 0) {
      seekInput.value = String(Math.max(0, Math.min(step, totalSteps - 1)));
    }
  }

  // 双击改格；单击/拖拽定位播放头
  scroller.addEventListener("dblclick", (event) => {
    const td = event.target.closest("td.cell");
    if (!td || !view) return;
    event.preventDefault();
    post({
      type: "cellClick",
      trackName: view.trackName,
      rowId: td.dataset.rowId,
      stepIndex: Number(td.dataset.step),
      shift: Boolean(event.shiftKey),
    });
  });

  scroller.addEventListener("pointerdown", (event) => {
    if (event.detail > 1) return; // 留给双击编辑
    const step = stepFromEvent(event);
    if (step === null) return;
    scrubbing = true;
    scroller.setPointerCapture?.(event.pointerId);
    emitSeek(step);
  });

  scroller.addEventListener("pointermove", (event) => {
    if (!scrubbing) return;
    const step = stepFromEvent(event);
    if (step === null) return;
    emitSeek(step);
  });

  const endScrub = (event) => {
    if (!scrubbing) return;
    scrubbing = false;
    try {
      scroller.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
  };
  scroller.addEventListener("pointerup", endScrub);
  scroller.addEventListener("pointercancel", endScrub);

  trackSelect.addEventListener("change", () => {
    post({ type: "selectTrack", trackName: trackSelect.value });
  });

  function emitHeader() {
    if (suppressHeader || !view) return;
    post({
      type: "headerChange",
      fields: {
        bpm: Number(bpmInput.value),
        meter: meterInput.value,
        stepsPerBar: Number(stepsInput.value),
        swing: Number(swingInput.value),
      },
    });
  }

  for (const el of [bpmInput, meterInput, stepsInput, swingInput]) {
    el.addEventListener("change", emitHeader);
  }

  seekInput.addEventListener("pointerdown", () => { seekDragging = true; });
  const endSeekDrag = () => {
    if (!seekDragging) return;
    seekDragging = false;
    emitSeek(Number(seekInput.value));
  };
  seekInput.addEventListener("pointerup", endSeekDrag);
  seekInput.addEventListener("pointercancel", endSeekDrag);
  seekInput.addEventListener("change", endSeekDrag);
  seekInput.addEventListener("input", () => {
    if (!seekDragging) return;
    emitSeek(Number(seekInput.value));
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "session") {
      view = message.view;
      render();
      return;
    }
    if (message.type === "playhead") {
      paintPlayhead(Number(message.step));
    }
  });

  post({ type: "ready" });
})();
