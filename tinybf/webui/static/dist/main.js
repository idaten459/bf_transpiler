// tinybf/webui/static/src/api.ts
var JSON_HEADERS = { "Content-Type": "application/json" };
function createSession(request) {
  return fetch("/api/session", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(request)
  });
}
function stepSession(sessionId, request) {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/step`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(request)
  });
}
function runSession(sessionId, request) {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/run`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(request)
  });
}
function resetSession(sessionId) {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/reset`, {
    method: "POST"
  });
}
function addBreakpoint(sessionId, request) {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/breakpoints`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(request)
  });
}
function removeBreakpointRequest(sessionId, pc) {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/breakpoints/${pc}`, {
    method: "DELETE"
  });
}

// tinybf/webui/static/src/constants.ts
var TAPE_VIEW_SIZE = 20;
var TAPE_MAX_INDEX = 3e4;
var CODE_LINE_WIDTH = 23;
var DEFAULT_RUN_LIMIT = 1e4;
var HISTORY_CHIPS_MAX_VISIBLE = 8;

// tinybf/webui/static/src/elements.ts
function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element;
}
function resolveElements() {
  return {
    code: getElement("code"),
    input: getElement("input"),
    languageSelect: getElement("language"),
    compiledWrapper: getElement("compiled-wrapper"),
    compiledCode: getElement("compiled-code"),
    tapeWindow: getElement("tape-window"),
    stepCount: getElement("step-count"),
    status: getElement("status"),
    step: getElement("state-step"),
    pc: getElement("state-pc"),
    command: getElement("state-command"),
    pointer: getElement("state-pointer"),
    output: getElement("state-output"),
    finished: getElement("state-finished"),
    tape: getElement("tape"),
    codeWindow: getElement("code-window"),
    createButton: getElement("create-session"),
    stepButton: getElement("step"),
    runButton: getElement("run"),
    resetButton: getElement("reset"),
    historyFirst: getElement("history-first"),
    historyPrev: getElement("history-prev"),
    historyNext: getElement("history-next"),
    historyLast: getElement("history-last"),
    historyRange: getElement("history-range"),
    historyInfo: getElement("history-info"),
    historyChips: getElement("history-chips"),
    runToBreakButton: getElement("run-to-break"),
    breakpointList: getElement("breakpoint-list")
  };
}

// tinybf/webui/static/src/state.ts
function createInitialState() {
  return {
    sessionId: null,
    brainfuckCode: "",
    sessionHistory: [],
    sessionFinished: false,
    currentBreakpoints: /* @__PURE__ */ new Set(),
    selectedHistoryIndex: 0,
    isBusy: false,
    totalSteps: 0,
    totalStepsCapped: false
  };
}

// tinybf/webui/static/src/utils.ts
function clampPositiveInt(value, fallback) {
  const parsed = typeof value === "number" ? value : parseInt(String(value != null ? value : ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    return "\u23CE";
  }
  return escapeHtml(char);
}
function formatTotalSteps(total, capped, finished) {
  if (!total) {
    return "";
  }
  if (capped && (!finished || total >= 1e4)) {
    return `${total}+`;
  }
  return String(total);
}
function parseSupportedLanguage(value) {
  const normalized = value.toLowerCase();
  if (normalized === "brainfuck" || normalized === "tinybf") {
    return normalized;
  }
  return "brainfuck";
}

// tinybf/webui/static/src/controller.ts
var AppController = class {
  constructor() {
    this.elements = resolveElements();
    this.state = createInitialState();
  }
  init() {
    this.bindEvents();
    this.toggleCompiledVisibility(parseSupportedLanguage(this.elements.languageSelect.value));
    void this.createSession();
  }
  bindEvents() {
    this.elements.createButton.addEventListener("click", (event) => {
      event.preventDefault();
      void this.createSession();
    });
    this.elements.stepButton.addEventListener("click", (event) => {
      event.preventDefault();
      void this.stepSession();
    });
    this.elements.runButton.addEventListener("click", (event) => {
      event.preventDefault();
      void this.runSessionToEnd();
    });
    this.elements.resetButton.addEventListener("click", (event) => {
      event.preventDefault();
      void this.resetSession();
    });
    this.elements.runToBreakButton.addEventListener("click", (event) => {
      event.preventDefault();
      void this.runToBreakpoint();
    });
    this.elements.languageSelect.addEventListener("change", () => {
      const language = parseSupportedLanguage(this.elements.languageSelect.value);
      this.toggleCompiledVisibility(language);
    });
    this.elements.historyFirst.addEventListener("click", () => {
      this.setHistoryIndex(0, { preview: false, updateSlider: true });
      this.refreshHistoryButtons();
      this.updateHistoryChips(false);
    });
    this.elements.historyPrev.addEventListener("click", () => {
      this.setHistoryIndex(this.state.selectedHistoryIndex - 1, { preview: false, updateSlider: true });
      this.refreshHistoryButtons();
      this.updateHistoryChips(false);
    });
    this.elements.historyNext.addEventListener("click", () => {
      this.setHistoryIndex(this.state.selectedHistoryIndex + 1, { preview: false, updateSlider: true });
      this.refreshHistoryButtons();
      this.updateHistoryChips(false);
    });
    this.elements.historyLast.addEventListener("click", () => {
      this.setHistoryIndex(this.state.sessionHistory.length - 1, { preview: false, updateSlider: true });
      this.refreshHistoryButtons();
      this.updateHistoryChips(false);
    });
    this.elements.historyRange.addEventListener("input", (event) => {
      const index = parseInt(event.target.value, 10);
      this.setHistoryIndex(index, { preview: true, updateSlider: false });
      this.refreshHistoryButtons();
      this.updateHistoryChips(true);
    });
    this.elements.historyRange.addEventListener("change", (event) => {
      const index = parseInt(event.target.value, 10);
      this.setHistoryIndex(index, { preview: false, updateSlider: false });
      this.refreshHistoryButtons();
      this.updateHistoryChips(false);
    });
    this.elements.codeWindow.addEventListener("click", (event) => {
      var _a;
      const target = (_a = event.target) == null ? void 0 : _a.closest("[data-pc]");
      if (!target) {
        return;
      }
      const pc = Number(target.dataset.pc);
      if (!Number.isFinite(pc)) {
        return;
      }
      void this.toggleBreakpoint(pc);
    });
  }
  setBusy(value) {
    this.state.isBusy = value;
  }
  setStatus(text, isError = false) {
    this.elements.status.textContent = text;
    this.elements.status.classList.toggle("error", isError);
  }
  toggleCompiledVisibility(language) {
    const showCompiled = language === "tinybf";
    this.elements.compiledWrapper.hidden = !showCompiled;
    if (!showCompiled) {
      this.elements.compiledCode.value = "";
    }
  }
  getSessionPayload() {
    const rawWindow = clampPositiveInt(this.elements.tapeWindow.value, 10);
    const minimumWindow = Math.ceil(TAPE_VIEW_SIZE / 2);
    const effectiveWindow = Math.max(rawWindow, minimumWindow);
    if (effectiveWindow !== rawWindow) {
      this.elements.tapeWindow.value = String(effectiveWindow);
    }
    const language = parseSupportedLanguage(this.elements.languageSelect.value);
    return {
      code: this.elements.code.value,
      input: this.elements.input.value,
      tape_window: effectiveWindow,
      language
    };
  }
  applySessionPayload(payload, options) {
    this.state.sessionId = payload.session_id;
    this.state.sessionFinished = Boolean(payload.finished);
    this.state.brainfuckCode = payload.code || "";
    const history = Array.isArray(payload.history) && payload.history.length > 0 ? payload.history : "state" in payload && payload.state ? [payload.state] : [];
    this.state.sessionHistory = history;
    this.state.currentBreakpoints = new Set(payload.breakpoints || []);
    this.state.totalSteps = payload.total_steps || 0;
    this.state.totalStepsCapped = Boolean(payload.total_steps_capped);
    const language = parseSupportedLanguage(payload.language);
    this.elements.languageSelect.value = language;
    this.toggleCompiledVisibility(language);
    if (language === "tinybf") {
      this.elements.compiledCode.value = this.state.brainfuckCode;
    }
    this.renderBreakpoints();
    this.updateHistoryUI(options.selectLatestHistory);
  }
  renderBreakpoints() {
    const container = this.elements.breakpointList;
    container.innerHTML = "";
    const sorted = Array.from(this.state.currentBreakpoints).sort((a, b) => a - b);
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
      remove.textContent = "\xD7";
      remove.addEventListener("click", () => {
        void this.removeBreakpoint(pc);
      });
      chip.appendChild(label);
      chip.appendChild(remove);
      container.appendChild(chip);
    });
  }
  updateHistoryUI(selectLatest) {
    const total = this.state.sessionHistory.length;
    this.elements.historyRange.max = total > 0 ? String(total - 1) : "0";
    this.elements.historyRange.disabled = total <= 1;
    const targetIndex = selectLatest ? Math.max(0, total - 1) : Math.min(this.state.selectedHistoryIndex, Math.max(0, total - 1));
    this.setHistoryIndex(targetIndex, { preview: false, updateSlider: true });
    this.refreshHistoryButtons();
    this.updateHistoryChips(false);
  }
  setHistoryIndex(index, options) {
    if (!this.state.sessionHistory.length) {
      return;
    }
    const clamped = Math.max(0, Math.min(index, this.state.sessionHistory.length - 1));
    this.state.selectedHistoryIndex = clamped;
    const state = this.state.sessionHistory[clamped];
    const finished = clamped === this.state.sessionHistory.length - 1 && this.state.sessionFinished;
    this.renderSessionState(state, finished);
    this.updateHistoryInfo(clamped, this.state.sessionHistory.length, options.preview);
    if (options.updateSlider) {
      this.elements.historyRange.value = String(clamped);
    }
  }
  updateHistoryInfo(index, total, preview) {
    if (!total || !this.state.sessionHistory[index]) {
      this.elements.historyInfo.textContent = "Step 0 / 0";
      this.elements.historyInfo.classList.remove("preview");
      return;
    }
    const stepNum = this.state.sessionHistory[index].step;
    const position = `${index + 1} / ${total}`;
    const isLatest = index === total - 1;
    let suffix = "";
    if (preview && !isLatest) {
      suffix = " \u2013 preview";
    } else if (!preview && !isLatest) {
      suffix = " \u2013 history";
    }
    this.elements.historyInfo.textContent = `Step ${stepNum} (${position})${suffix}`;
    this.elements.historyInfo.classList.toggle("preview", !isLatest);
  }
  refreshHistoryButtons() {
    const total = this.state.sessionHistory.length;
    const atStart = this.state.selectedHistoryIndex <= 0;
    const atEnd = total === 0 || this.state.selectedHistoryIndex >= total - 1;
    this.elements.historyFirst.disabled = atStart;
    this.elements.historyPrev.disabled = atStart;
    this.elements.historyNext.disabled = atEnd;
    this.elements.historyLast.disabled = atEnd;
  }
  updateHistoryChips(preview) {
    const container = this.elements.historyChips;
    container.innerHTML = "";
    if (!this.state.sessionHistory.length) {
      const empty = document.createElement("div");
      empty.className = "history-chip";
      empty.textContent = "No history";
      container.appendChild(empty);
      return;
    }
    const total = this.state.sessionHistory.length;
    const start = Math.max(0, total - HISTORY_CHIPS_MAX_VISIBLE);
    for (let i = start; i < total; i += 1) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "history-chip";
      chip.textContent = String(this.state.sessionHistory[i].step);
      if (i === this.state.selectedHistoryIndex) {
        chip.classList.add("is-active");
        if (i !== total - 1 || preview) {
          chip.classList.add("is-preview");
        }
      }
      chip.addEventListener("click", () => {
        this.setHistoryIndex(i, { preview: false, updateSlider: true });
        this.refreshHistoryButtons();
        this.updateHistoryChips(false);
      });
      container.appendChild(chip);
    }
  }
  renderSessionState(state, finished) {
    const totalDisplay = formatTotalSteps(this.state.totalSteps, this.state.totalStepsCapped, finished);
    this.elements.step.textContent = totalDisplay ? `${state.step}/${totalDisplay}` : String(state.step);
    this.elements.pc.textContent = `${state.pc} / ${state.code_length}`;
    this.elements.command.textContent = state.command !== null ? state.command : "(init)";
    this.elements.pointer.textContent = String(state.pointer);
    this.elements.output.textContent = state.output || "(empty)";
    this.elements.finished.textContent = finished ? "Yes" : "No";
    this.renderTape(state);
    this.renderCodeWindow(this.state.brainfuckCode, state.pc);
  }
  renderTape(state) {
    const container = this.elements.tape;
    container.innerHTML = "";
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
      const value = this.getTapeValue(state, absolute);
      const cell = document.createElement("div");
      cell.className = "tape-cell" + (absolute === pointer ? " pointer" : "");
      const position = document.createElement("span");
      position.className = "cell-index";
      position.textContent = `@${absolute}`;
      const number = document.createElement("span");
      number.textContent = String(value);
      cell.appendChild(position);
      cell.appendChild(number);
      fragment.appendChild(cell);
    }
    container.appendChild(fragment);
  }
  getTapeValue(state, index) {
    const offset = index - state.tape_start;
    if (offset >= 0 && offset < state.tape.length) {
      return state.tape[offset];
    }
    return 0;
  }
  renderCodeWindow(code, pc) {
    if (!code) {
      this.elements.codeWindow.textContent = "(empty)";
      return;
    }
    const tokens = [];
    for (let index = 0; index < code.length; index += 1) {
      const classes = ["code-token"];
      if (index === pc) {
        classes.push("is-current");
      }
      if (this.state.currentBreakpoints.has(index)) {
        classes.push("has-breakpoint");
      }
      tokens.push(`<span class="${classes.join(" ")}" data-pc="${index}">${formatCodeChar(code[index])}</span>`);
    }
    tokens.push(
      `<span class="code-token${pc >= code.length ? " is-current" : ""}" data-pc="${code.length}">[END]</span>`
    );
    const lines = [];
    for (let i = 0; i < tokens.length; i += CODE_LINE_WIDTH) {
      const slice = tokens.slice(i, i + CODE_LINE_WIDTH).join("");
      lines.push(`<div class="code-line">${slice}</div>`);
    }
    this.elements.codeWindow.innerHTML = lines.join("");
    const currentToken = this.elements.codeWindow.querySelector(".code-token.is-current");
    currentToken == null ? void 0 : currentToken.scrollIntoView({ block: "center", inline: "nearest" });
  }
  async createSession() {
    if (this.state.isBusy) {
      return;
    }
    this.setBusy(true);
    this.setStatus("Creating session...");
    try {
      const response = await createSession(this.getSessionPayload());
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      this.applySessionPayload(payload, { selectLatestHistory: true });
      this.setStatus("Session ready.");
    } catch (error) {
      this.state.sessionId = null;
      this.setStatus(`Failed to create session: ${this.describeError(error)}`, true);
    } finally {
      this.setBusy(false);
    }
  }
  async stepSession() {
    if (this.state.isBusy) {
      return;
    }
    if (!this.state.sessionId) {
      await this.createSession();
      return;
    }
    this.setBusy(true);
    const count = clampPositiveInt(this.elements.stepCount.value, 1);
    this.setStatus(`Stepping ${count} instruction${count > 1 ? "s" : ""}...`);
    try {
      const response = await stepSession(this.state.sessionId, { count });
      if (response.status === 409) {
        const detail = await response.json();
        this.setStatus(detail.detail || "Step limit exceeded.", true);
        return;
      }
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      this.applySessionPayload(payload, { selectLatestHistory: true });
      if (payload.hit_breakpoint !== null && payload.hit_breakpoint !== void 0) {
        this.setStatus(`Hit breakpoint at pc ${payload.hit_breakpoint}.`);
      } else {
        this.setStatus(payload.finished ? "Program finished." : "Step complete.");
      }
    } catch (error) {
      this.setStatus(`Failed to step: ${this.describeError(error)}`, true);
    } finally {
      this.setBusy(false);
    }
  }
  async runSessionToEnd() {
    if (this.state.isBusy) {
      return;
    }
    if (!this.state.sessionId) {
      await this.createSession();
      return;
    }
    this.setBusy(true);
    this.setStatus("Running program to completion...");
    try {
      const response = await runSession(this.state.sessionId, { limit: DEFAULT_RUN_LIMIT, ignore_breakpoints: true });
      if (response.status === 409) {
        const detail = await response.json();
        this.setStatus(detail.detail || "Step limit exceeded.", true);
        return;
      }
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      this.applySessionPayload(payload, { selectLatestHistory: true });
      this.setStatus(payload.finished ? "Program finished." : "Stopped after max steps.");
    } catch (error) {
      this.setStatus(`Failed to run: ${this.describeError(error)}`, true);
    } finally {
      this.setBusy(false);
    }
  }
  async runToBreakpoint() {
    if (this.state.isBusy) {
      return;
    }
    if (!this.state.sessionId) {
      await this.createSession();
      return;
    }
    if (!this.state.currentBreakpoints.size) {
      await this.runSessionToEnd();
      return;
    }
    this.setBusy(true);
    this.setStatus("Running until breakpoint or completion...");
    try {
      const rawLimit = parseInt(this.elements.stepCount.value, 10);
      const body = {};
      if (Number.isFinite(rawLimit) && rawLimit > 1) {
        body.limit = rawLimit;
      }
      const response = await runSession(this.state.sessionId, body);
      if (response.status === 409) {
        const detail = await response.json();
        this.setStatus(detail.detail || "Step limit exceeded.", true);
        return;
      }
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      this.applySessionPayload(payload, { selectLatestHistory: true });
      if (payload.hit_breakpoint !== null && payload.hit_breakpoint !== void 0) {
        this.setStatus(`Stopped at breakpoint pc ${payload.hit_breakpoint}.`);
      } else {
        this.setStatus(payload.finished ? "Program finished." : "Run completed.");
      }
    } catch (error) {
      this.setStatus(`Failed to run: ${this.describeError(error)}`, true);
    } finally {
      this.setBusy(false);
    }
  }
  async resetSession() {
    if (this.state.isBusy) {
      return;
    }
    if (!this.state.sessionId) {
      await this.createSession();
      return;
    }
    this.setBusy(true);
    this.setStatus("Resetting session...");
    try {
      const response = await resetSession(this.state.sessionId);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      this.applySessionPayload(payload, { selectLatestHistory: true });
      this.setStatus("Session reset.");
    } catch (error) {
      this.setStatus(`Failed to reset: ${this.describeError(error)}`, true);
    } finally {
      this.setBusy(false);
    }
  }
  async addBreakpoint(pc) {
    if (!this.state.sessionId) {
      this.setStatus("Create a session before adding breakpoints.", true);
      return;
    }
    if (!Number.isFinite(pc) || pc < 0) {
      this.setStatus("Breakpoint must be a non-negative integer.", true);
      return;
    }
    if (this.state.isBusy) {
      this.setStatus("Another action is in progress.", true);
      return;
    }
    this.setBusy(true);
    this.setStatus(`Adding breakpoint at pc ${pc}...`);
    try {
      const body = { pc };
      const response = await addBreakpoint(this.state.sessionId, body);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      this.applySessionPayload(payload, { selectLatestHistory: false });
      this.setStatus(`Breakpoint added at pc ${pc}.`);
    } catch (error) {
      this.setStatus(`Failed to add breakpoint: ${this.describeError(error)}`, true);
    } finally {
      this.setBusy(false);
    }
  }
  async removeBreakpoint(pc) {
    if (!this.state.sessionId) {
      return;
    }
    if (this.state.isBusy) {
      this.setStatus("Another action is in progress.", true);
      return;
    }
    this.setBusy(true);
    try {
      const response = await removeBreakpointRequest(this.state.sessionId, pc);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      this.applySessionPayload(payload, { selectLatestHistory: false });
      this.setStatus(`Removed breakpoint at pc ${pc}.`);
    } catch (error) {
      this.setStatus(`Failed to remove breakpoint: ${this.describeError(error)}`, true);
    } finally {
      this.setBusy(false);
    }
  }
  async toggleBreakpoint(pc) {
    if (!this.state.sessionId) {
      this.setStatus("Create a session before toggling breakpoints.", true);
      return;
    }
    if (pc < 0 || !Number.isFinite(pc) || pc >= this.state.brainfuckCode.length) {
      return;
    }
    if (this.state.currentBreakpoints.has(pc)) {
      await this.removeBreakpoint(pc);
    } else {
      await this.addBreakpoint(pc);
    }
  }
  describeError(error) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return String(error);
  }
};
function bootstrap() {
  const controller = new AppController();
  controller.init();
}

// tinybf/webui/static/src/index.ts
bootstrap();
//# sourceMappingURL=main.js.map
