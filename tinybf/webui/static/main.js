(() => {
  const elements = {
    code: document.getElementById("code"),
    input: document.getElementById("input"),
    languageSelect: document.getElementById("language"),
    compiledWrapper: document.getElementById("compiled-wrapper"),
    compiledCode: document.getElementById("compiled-code"),
    tapeWindow: document.getElementById("tape-window"),
    stepCount: document.getElementById("step-count"),
    status: document.getElementById("status"),
    step: document.getElementById("state-step"),
    pc: document.getElementById("state-pc"),
    command: document.getElementById("state-command"),
    pointer: document.getElementById("state-pointer"),
    output: document.getElementById("state-output"),
    finished: document.getElementById("state-finished"),
    tape: document.getElementById("tape"),
    codeWindow: document.getElementById("code-window"),
    createButton: document.getElementById("create-session"),
    stepButton: document.getElementById("step"),
    resetButton: document.getElementById("reset"),
    historyRange: document.getElementById("history-range"),
    historyInfo: document.getElementById("history-info"),
    breakpointPc: document.getElementById("breakpoint-pc"),
    addBreakpointButton: document.getElementById("add-breakpoint"),
    runToBreakButton: document.getElementById("run-to-break"),
    breakpointList: document.getElementById("breakpoint-list"),
  };

  let sessionId = null;
  let brainfuckCode = "";
  let sessionHistory = [];
  let sessionFinished = false;
  let currentBreakpoints = new Set();
  let selectedHistoryIndex = 0;
  let isBusy = false;

  function setStatus(text, isError = false) {
    elements.status.textContent = text;
    elements.status.classList.toggle("error", isError);
  }

  function clampPositiveInt(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function toggleCompiledVisibility(language) {
    const showCompiled = language === "tinybf";
    elements.compiledWrapper.hidden = !showCompiled;
    if (!showCompiled) {
      elements.compiledCode.value = "";
    }
  }

  function escapeHtml(value) {
    return value.replace(/[&<>\"]/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return char;
      }
    });
  }

  function renderSessionState(state, finished) {
    elements.step.textContent = state.step;
    elements.pc.textContent = `${state.pc} / ${state.code_length}`;
    elements.command.textContent = state.command ?? "(init)";
    elements.pointer.textContent = state.pointer;
    elements.output.textContent = state.output || "(empty)";
    elements.finished.textContent = finished ? "Yes" : "No";
    renderTape(state);
    renderCodeWindow(brainfuckCode, state.pc);
  }

  function renderTape(state) {
    elements.tape.innerHTML = "";
    const fragment = document.createDocumentFragment();
    state.tape.forEach((value, index) => {
      const absolute = state.tape_start + index;
      const cell = document.createElement("div");
      cell.className = "tape-cell" + (absolute === state.pointer ? " pointer" : "");

      const position = document.createElement("span");
      position.className = "cell-index";
      position.textContent = `@${absolute}`;

      const number = document.createElement("span");
      number.textContent = value;

      cell.appendChild(position);
      cell.appendChild(number);
      fragment.appendChild(cell);
    });
    elements.tape.appendChild(fragment);
  }

  function renderCodeWindow(code, pc, windowSize = 16) {
    if (!code) {
      elements.codeWindow.textContent = "(empty)";
      return;
    }
    const start = Math.max(0, pc - windowSize);
    const end = Math.min(code.length, pc + windowSize + 1);
    let markup = "";
    for (let index = start; index < end; index += 1) {
      let piece = escapeHtml(code[index]);
      if (currentBreakpoints.has(index)) {
        piece = `<span class="breakpoint">${piece}</span>`;
      }
      if (index === pc) {
        piece = `<mark>${piece}</mark>`;
      }
      markup += piece;
    }
    if (pc >= code.length) {
      markup += "<mark>[END]</mark>";
    }
    elements.codeWindow.innerHTML = markup;
  }

  function updateHistoryInfo(index, total, preview) {
    if (!total || !sessionHistory[index]) {
      elements.historyInfo.textContent = "Step 0 / 0";
      return;
    }
    const stepNum = sessionHistory[index].step;
    const position = `${index + 1} / ${total}`;
    const suffix = preview && index !== total - 1 ? " – preview" : "";
    elements.historyInfo.textContent = `Step ${stepNum} (${position})${suffix}`;
  }

  function setHistoryIndex(index, { preview = false, updateSlider = true } = {}) {
    if (!sessionHistory.length) {
      return;
    }
    const clamped = Math.max(0, Math.min(index, sessionHistory.length - 1));
    selectedHistoryIndex = clamped;
    const state = sessionHistory[clamped];
    const finished = clamped === sessionHistory.length - 1 && sessionFinished;
    renderSessionState(state, finished);
    updateHistoryInfo(clamped, sessionHistory.length, preview);
    if (updateSlider) {
      elements.historyRange.value = String(clamped);
    }
  }

  function updateHistoryUI(selectLatest = true) {
    const total = sessionHistory.length;
    elements.historyRange.max = total > 0 ? String(total - 1) : "0";
    elements.historyRange.disabled = total <= 1;
    const targetIndex = selectLatest ? Math.max(0, total - 1) : Math.min(selectedHistoryIndex, Math.max(0, total - 1));
    setHistoryIndex(targetIndex, { preview: false, updateSlider: true });
  }

  function renderBreakpoints() {
    const container = elements.breakpointList;
    container.innerHTML = "";
    const sorted = Array.from(currentBreakpoints).sort((a, b) => a - b);
    if (!sorted.length) {
      const empty = document.createElement("div");
      empty.className = "breakpoint-chip";
      empty.textContent = "No breakpoints";
      container.appendChild(empty);
      return;
    }
    sorted.forEach((pc) => {
      const chip = document.createElement("span");
      chip.className = "breakpoint-chip";

      const label = document.createElement("span");
      label.textContent = `pc ${pc}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove breakpoint at pc ${pc}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => removeBreakpoint(pc));

      chip.appendChild(label);
      chip.appendChild(remove);
      container.appendChild(chip);
    });
  }

  function applySessionPayload(payload, { selectLatestHistory = true } = {}) {
    sessionId = payload.session_id;
    sessionFinished = Boolean(payload.finished);
    brainfuckCode = payload.code || "";
    sessionHistory = Array.isArray(payload.history) && payload.history.length > 0
      ? payload.history
      : [payload.state];
    currentBreakpoints = new Set(payload.breakpoints || []);

    elements.languageSelect.value = payload.language;
    toggleCompiledVisibility(payload.language);
    if (payload.language === "tinybf") {
      elements.compiledCode.value = brainfuckCode;
    }

    renderBreakpoints();
    updateHistoryUI(selectLatestHistory);
  }

  function getSessionPayload() {
    return {
      code: elements.code.value,
      input: elements.input.value,
      tape_window: clampPositiveInt(elements.tapeWindow.value, 10),
      language: elements.languageSelect.value,
    };
  }

  async function createSession() {
    if (isBusy) {
      return;
    }
    isBusy = true;
    setStatus("Creating session...");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getSessionPayload()),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      applySessionPayload(payload, { selectLatestHistory: true });
      setStatus("Session ready.");
    } catch (error) {
      sessionId = null;
      setStatus(`Failed to create session: ${error.message ?? error}`, true);
    } finally {
      isBusy = false;
    }
  }

  async function refreshSession(selectLatestHistory = false) {
    if (!sessionId) {
      return;
    }
    const response = await fetch(`/api/session/${sessionId}`);
    if (!response.ok) {
      sessionId = null;
      setStatus("Session lost. Please recreate.", true);
      return;
    }
    const payload = await response.json();
    applySessionPayload(payload, { selectLatestHistory });
  }

  async function stepSession() {
    if (isBusy) {
      return;
    }
    if (!sessionId) {
      await createSession();
      return;
    }
    isBusy = true;
    const count = clampPositiveInt(elements.stepCount.value, 1);
    setStatus(`Stepping ${count} instruction${count > 1 ? "s" : ""}...`);
    try {
      const response = await fetch(`/api/session/${sessionId}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (response.status === 409) {
        const detail = (await response.json()).detail;
        setStatus(detail, true);
        return;
      }
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      applySessionPayload(payload, { selectLatestHistory: true });
      if (payload.hit_breakpoint !== null && payload.hit_breakpoint !== undefined) {
        setStatus(`Hit breakpoint at pc ${payload.hit_breakpoint}.`, false);
      } else {
        setStatus(payload.finished ? "Program finished." : "Step complete.");
      }
    } catch (error) {
      setStatus(`Failed to step: ${error.message ?? error}`, true);
    } finally {
      isBusy = false;
    }
  }

  async function runToBreakpoint() {
    if (isBusy) {
      return;
    }
    if (!sessionId) {
      await createSession();
      return;
    }
    isBusy = true;
    setStatus("Running until breakpoint or completion...");
    try {
      const rawLimit = parseInt(elements.stepCount.value, 10);
      const body = {};
      const hasBreakpoints = currentBreakpoints.size > 0;
      if (!hasBreakpoints && Number.isFinite(rawLimit) && rawLimit > 0) {
        body.limit = rawLimit;
      }
      const response = await fetch(`/api/session/${sessionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 409) {
        const detail = (await response.json()).detail;
        setStatus(detail, true);
        return;
      }
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      applySessionPayload(payload, { selectLatestHistory: true });
      if (payload.hit_breakpoint !== null && payload.hit_breakpoint !== undefined) {
        setStatus(`Stopped at breakpoint pc ${payload.hit_breakpoint}.`, false);
      } else {
        setStatus(payload.finished ? "Program finished." : "Run completed.");
      }
    } catch (error) {
      setStatus(`Failed to run: ${error.message ?? error}`, true);
    } finally {
      isBusy = false;
    }
  }

  async function resetSession() {
    if (isBusy) {
      return;
    }
    if (!sessionId) {
      await createSession();
      return;
    }
    isBusy = true;
    setStatus("Resetting session...");
    try {
      const response = await fetch(`/api/session/${sessionId}/reset`, { method: "POST" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      applySessionPayload(payload, { selectLatestHistory: true });
      setStatus("Session reset.");
    } catch (error) {
      setStatus(`Failed to reset: ${error.message ?? error}`, true);
    } finally {
      isBusy = false;
    }
  }

  async function addBreakpoint() {
    if (!sessionId) {
      setStatus("Create a session before adding breakpoints.", true);
      return;
    }
    const pc = parseInt(elements.breakpointPc.value, 10);
    if (!Number.isFinite(pc) || pc < 0) {
      setStatus("Breakpoint must be a non-negative integer.", true);
      return;
    }
    try {
      const response = await fetch(`/api/session/${sessionId}/breakpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pc }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      applySessionPayload(payload, { selectLatestHistory: false });
      setStatus(`Breakpoint added at pc ${pc}.`);
    } catch (error) {
      setStatus(`Failed to add breakpoint: ${error.message ?? error}`, true);
    }
  }

  async function removeBreakpoint(pc) {
    if (!sessionId) {
      return;
    }
    try {
      const response = await fetch(`/api/session/${sessionId}/breakpoints/${pc}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      applySessionPayload(payload, { selectLatestHistory: false });
      setStatus(`Removed breakpoint at pc ${pc}.`);
    } catch (error) {
      setStatus(`Failed to remove breakpoint: ${error.message ?? error}`, true);
    }
  }

  elements.createButton.addEventListener("click", (event) => {
    event.preventDefault();
    createSession();
  });

  elements.stepButton.addEventListener("click", (event) => {
    event.preventDefault();
    stepSession();
  });

  elements.resetButton.addEventListener("click", (event) => {
    event.preventDefault();
    resetSession();
  });

  elements.runToBreakButton.addEventListener("click", (event) => {
    event.preventDefault();
    runToBreakpoint();
  });

  elements.addBreakpointButton.addEventListener("click", (event) => {
    event.preventDefault();
    addBreakpoint();
  });

  elements.languageSelect.addEventListener("change", () => {
    toggleCompiledVisibility(elements.languageSelect.value);
  });

  elements.historyRange.addEventListener("input", (event) => {
    const index = parseInt(event.target.value, 10);
    setHistoryIndex(index, { preview: true, updateSlider: false });
  });

  elements.historyRange.addEventListener("change", (event) => {
    const index = parseInt(event.target.value, 10);
    setHistoryIndex(index, { preview: false, updateSlider: false });
  });

  toggleCompiledVisibility(elements.languageSelect.value);
  createSession();
})();
