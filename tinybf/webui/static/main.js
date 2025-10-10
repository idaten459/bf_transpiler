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
    runButton: document.getElementById("run"),
    resetButton: document.getElementById("reset"),
    historyFirst: document.getElementById("history-first"),
    historyPrev: document.getElementById("history-prev"),
    historyNext: document.getElementById("history-next"),
    historyLast: document.getElementById("history-last"),
    historyRange: document.getElementById("history-range"),
    historyInfo: document.getElementById("history-info"),
    historyChips: document.getElementById("history-chips"),
    runToBreakButton: document.getElementById("run-to-break"),
    breakpointList: document.getElementById("breakpoint-list"),
  };

  const TAPE_VIEW_SIZE = 20;
  const TAPE_MAX_INDEX = 30000;
  const CODE_LINE_WIDTH = 23;

  let sessionId = null;
  let brainfuckCode = "";
  let sessionHistory = [];
  let sessionFinished = false;
  let currentBreakpoints = new Set();
  let selectedHistoryIndex = 0;
  let isBusy = false;
  let totalSteps = 0;
  let totalStepsCapped = false;

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

  function formatCodeChar(char) {
    if (!char) {
      return "&nbsp;";
    }
    if (char === " ") {
      return "&nbsp;";
    }
    if (char === "\n") {
      return "⏎";
    }
    return escapeHtml(char);
  }

  function formatTotalSteps(total, capped, finished) {
    if (!total) {
      return "";
    }
    if (capped && (!finished || total >= 10000)) {
      return `${total}+`;
    }
    return String(total);
  }

  function renderSessionState(state, finished) {
    const totalDisplay = formatTotalSteps(totalSteps, totalStepsCapped, finished);
    elements.step.textContent = totalDisplay ? `${state.step}/${totalDisplay}` : state.step;
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
    const pointer = state.pointer;
    const leftCount = Math.floor((TAPE_VIEW_SIZE - 1) / 2);
    const rightCount = TAPE_VIEW_SIZE - leftCount - 1;
    let startIndex = pointer - leftCount;
    if (startIndex < 0) {
      startIndex = 0;
    }
    let endIndex = pointer + rightCount;
    if (endIndex >= TAPE_MAX_INDEX) {
      endIndex = TAPE_MAX_INDEX - 1;
    }
    while (endIndex - startIndex + 1 < TAPE_VIEW_SIZE) {
      if (startIndex > 0) {
        startIndex -= 1;
      } else if (endIndex < TAPE_MAX_INDEX - 1) {
        endIndex += 1;
      } else {
        break;
      }
    }

    const fragment = document.createDocumentFragment();
    for (let absolute = startIndex; absolute <= endIndex; absolute += 1) {
      const value = getTapeValue(state, absolute);
      const cell = document.createElement("div");
      cell.className = "tape-cell" + (absolute === pointer ? " pointer" : "");

      const position = document.createElement("span");
      position.className = "cell-index";
      position.textContent = `@${absolute}`;

      const number = document.createElement("span");
      number.textContent = value;

      cell.appendChild(position);
      cell.appendChild(number);
      fragment.appendChild(cell);
    }
    elements.tape.appendChild(fragment);
  }

  function getTapeValue(state, index) {
    const offset = index - state.tape_start;
    if (offset >= 0 && offset < state.tape.length) {
      return state.tape[offset];
    }
    return 0;
  }

  function renderCodeWindow(code, pc) {
    if (!code) {
      elements.codeWindow.textContent = "(empty)";
      return;
    }
    const tokens = [];
    for (let index = 0; index < code.length; index += 1) {
      const classes = ["code-token"];
      if (index === pc) {
        classes.push("is-current");
      }
      if (currentBreakpoints.has(index)) {
        classes.push("has-breakpoint");
      }
      tokens.push(
        `<span class="${classes.join(" ")}" data-pc="${index}">${formatCodeChar(code[index])}</span>`
      );
    }
    tokens.push(
      `<span class="code-token${pc >= code.length ? " is-current" : ""}" data-pc="${code.length}">[END]</span>`
    );

    const lines = [];
    for (let i = 0; i < tokens.length; i += CODE_LINE_WIDTH) {
      const slice = tokens.slice(i, i + CODE_LINE_WIDTH).join("");
      lines.push(`<div class="code-line">${slice}</div>`);
    }
    elements.codeWindow.innerHTML = lines.join("");
    const currentToken = elements.codeWindow.querySelector(".code-token.is-current");
    if (currentToken) {
      currentToken.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }

  function updateHistoryInfo(index, total, preview) {
    if (!total || !sessionHistory[index]) {
      elements.historyInfo.textContent = "Step 0 / 0";
      elements.historyInfo.classList.remove("preview");
      return;
    }
    const stepNum = sessionHistory[index].step;
    const position = `${index + 1} / ${total}`;
    const isLatest = index === total - 1;
    const suffix = preview && !isLatest ? " – preview" : !preview && !isLatest ? " – history" : "";
    elements.historyInfo.textContent = `Step ${stepNum} (${position})${suffix}`;
    elements.historyInfo.classList.toggle("preview", !isLatest);
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

  function refreshHistoryButtons() {
    const total = sessionHistory.length;
    const atStart = selectedHistoryIndex <= 0;
    const atEnd = total === 0 || selectedHistoryIndex >= total - 1;
    elements.historyFirst.disabled = atStart;
    elements.historyPrev.disabled = atStart;
    elements.historyNext.disabled = atEnd;
    elements.historyLast.disabled = atEnd;
  }

  function updateHistoryChips(preview = false) {
    const container = elements.historyChips;
    container.innerHTML = "";
    if (!sessionHistory.length) {
      const empty = document.createElement("div");
      empty.className = "history-chip";
      empty.textContent = "No history";
      container.appendChild(empty);
      return;
    }
    const total = sessionHistory.length;
    const maxVisible = 8;
    const start = Math.max(0, total - maxVisible);
    for (let i = start; i < total; i += 1) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "history-chip";
      chip.textContent = sessionHistory[i].step;
      if (i === selectedHistoryIndex) {
        chip.classList.add("is-active");
        if (i !== total - 1) {
          chip.classList.add("is-preview");
        }
      }
      chip.addEventListener("click", () => {
        setHistoryIndex(i, { preview: false, updateSlider: true });
        refreshHistoryButtons();
        updateHistoryChips();
      });
      container.appendChild(chip);
    }
  }

  function updateHistoryUI(selectLatest = true) {
    const total = sessionHistory.length;
    elements.historyRange.max = total > 0 ? String(total - 1) : "0";
    elements.historyRange.disabled = total <= 1;
    const targetIndex = selectLatest ? Math.max(0, total - 1) : Math.min(selectedHistoryIndex, Math.max(0, total - 1));
    setHistoryIndex(targetIndex, { preview: false, updateSlider: true });
    refreshHistoryButtons();
    updateHistoryChips();
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
    sessionHistory = Array.isArray(payload.history) && payload.history.length > 0 ? payload.history : [payload.state];
    currentBreakpoints = new Set(payload.breakpoints || []);
    totalSteps = payload.total_steps || 0;
    totalStepsCapped = Boolean(payload.total_steps_capped);

    elements.languageSelect.value = payload.language;
    toggleCompiledVisibility(payload.language);
    if (payload.language === "tinybf") {
      elements.compiledCode.value = brainfuckCode;
    }

    renderBreakpoints();
    updateHistoryUI(selectLatestHistory);
  }

  function getSessionPayload() {
    const rawWindow = clampPositiveInt(elements.tapeWindow.value, 10);
    const minimumWindow = Math.ceil(TAPE_VIEW_SIZE / 2);
    const effectiveWindow = Math.max(rawWindow, minimumWindow);
    if (effectiveWindow !== rawWindow) {
      elements.tapeWindow.value = effectiveWindow;
    }
    return {
      code: elements.code.value,
      input: elements.input.value,
      tape_window: effectiveWindow,
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

  async function runSessionToEnd() {
    if (isBusy) {
      return;
    }
    if (!sessionId) {
      await createSession();
      return;
    }
    isBusy = true;
    setStatus("Running program to completion...");
    try {
      const response = await fetch(`/api/session/${sessionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10000, ignore_breakpoints: true }),
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
      setStatus(payload.finished ? "Program finished." : "Stopped after max steps.");
    } catch (error) {
      setStatus(`Failed to run: ${error.message ?? error}`, true);
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
    if (!currentBreakpoints.size) {
      await runSessionToEnd();
      return;
    }
    isBusy = true;
    setStatus("Running until breakpoint or completion...");
    try {
      const rawLimit = parseInt(elements.stepCount.value, 10);
      const body = {};
      if (Number.isFinite(rawLimit) && rawLimit > 1) {
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

  async function addBreakpoint(pc) {
    if (!sessionId) {
      setStatus("Create a session before adding breakpoints.", true);
      return;
    }
    if (!Number.isFinite(pc) || pc < 0) {
      setStatus("Breakpoint must be a non-negative integer.", true);
      return;
    }
    if (isBusy) {
      setStatus("Another action is in progress.", true);
      return;
    }
    isBusy = true;
    setStatus(`Adding breakpoint at pc ${pc}...`);
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
    } finally {
      isBusy = false;
    }
  }

  async function removeBreakpoint(pc) {
    if (!sessionId) {
      return;
    }
    if (isBusy) {
      setStatus("Another action is in progress.", true);
      return;
    }
    isBusy = true;
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
    } finally {
      isBusy = false;
    }
  }

  async function toggleBreakpoint(pc) {
    if (!sessionId) {
      setStatus("Create a session before toggling breakpoints.", true);
      return;
    }
    if (pc < 0 || !Number.isFinite(pc) || pc >= brainfuckCode.length) {
      return;
    }
    if (currentBreakpoints.has(pc)) {
      await removeBreakpoint(pc);
    } else {
      await addBreakpoint(pc);
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

  elements.runButton.addEventListener("click", (event) => {
    event.preventDefault();
    runSessionToEnd();
  });

  elements.resetButton.addEventListener("click", (event) => {
    event.preventDefault();
    resetSession();
  });

  elements.runToBreakButton.addEventListener("click", (event) => {
    event.preventDefault();
    runToBreakpoint();
  });

  elements.languageSelect.addEventListener("change", () => {
    toggleCompiledVisibility(elements.languageSelect.value);
  });

  elements.historyFirst.addEventListener("click", () => {
    setHistoryIndex(0, { preview: false, updateSlider: true });
    refreshHistoryButtons();
    updateHistoryChips();
  });

  elements.historyPrev.addEventListener("click", () => {
    setHistoryIndex(selectedHistoryIndex - 1, { preview: false, updateSlider: true });
    refreshHistoryButtons();
    updateHistoryChips();
  });

  elements.historyNext.addEventListener("click", () => {
    setHistoryIndex(selectedHistoryIndex + 1, { preview: false, updateSlider: true });
    refreshHistoryButtons();
    updateHistoryChips();
  });

  elements.historyLast.addEventListener("click", () => {
    setHistoryIndex(sessionHistory.length - 1, { preview: false, updateSlider: true });
    refreshHistoryButtons();
    updateHistoryChips();
  });

  elements.historyRange.addEventListener("input", (event) => {
    const index = parseInt(event.target.value, 10);
    setHistoryIndex(index, { preview: true, updateSlider: false });
    refreshHistoryButtons();
    updateHistoryChips(true);
  });

  elements.historyRange.addEventListener("change", (event) => {
    const index = parseInt(event.target.value, 10);
    setHistoryIndex(index, { preview: false, updateSlider: false });
    refreshHistoryButtons();
    updateHistoryChips();
  });

  elements.codeWindow.addEventListener("click", (event) => {
    const target = event.target.closest("[data-pc]");
    if (!target) {
      return;
    }
    const pc = Number(target.dataset.pc);
    if (!Number.isFinite(pc)) {
      return;
    }
    toggleBreakpoint(pc);
  });

  toggleCompiledVisibility(elements.languageSelect.value);
  createSession();
})();
