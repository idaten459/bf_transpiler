import { computed, nextTick, ref } from 'vue';
import { defineStore } from 'pinia';

import * as api from '../api';
import {
  CODE_LINE_WIDTH,
  DEFAULT_RUN_LIMIT,
  HISTORY_CHIPS_MAX_VISIBLE,
  TAPE_MAX_INDEX,
  TAPE_VIEW_SIZE,
} from '../constants';
import {
  BreakpointRequest,
  CreateSessionRequest,
  DetailPayload,
  RunRequest,
  SessionLikePayload,
  SessionPayload,
  SessionState,
  StepResponse,
  SupportedLanguage,
} from '../types';
import { clampPositiveInt, formatCodeChar, formatTotalSteps, parseSupportedLanguage } from '../utils';

interface HistoryChip {
  index: number;
  label: string;
  isActive: boolean;
  isPreview: boolean;
}

const DEFAULT_CODE = `++++++++++[>+++++++>++++++++++>+++>+<<<<-]>++.>+.+++++++..+++.>++.<<+++++++++++++++.>.+++.------.--------.>+.>.`;

function cloneState(value: SessionState): SessionState {
  return JSON.parse(JSON.stringify(value)) as SessionState;
}

export const useSessionStore = defineStore('session', () => {
  const codeInput = ref<string>(DEFAULT_CODE);
  const inputValue = ref<string>('');
  const language = ref<SupportedLanguage>('brainfuck');
  const tapeWindow = ref<number>(10);
  const stepCount = ref<number>(1);

  const sessionId = ref<string | null>(null);
  const brainfuckCode = ref<string>('');
  const compiledCode = ref<string>('');
  const sessionHistory = ref<SessionState[]>([]);
  const sessionFinished = ref<boolean>(false);
  const breakpoints = ref<number[]>([]);
  const totalSteps = ref<number>(0);
  const totalStepsCapped = ref<boolean>(false);

  const selectedHistoryIndex = ref<number>(0);
  const historyPreview = ref<boolean>(false);

  const statusMessage = ref<string>('Ready.');
  const statusIsError = ref<boolean>(false);
  const isBusy = ref<boolean>(false);

  const showCompiled = computed<boolean>(() => language.value === 'tinybf');

  const breakpointSet = computed<Set<number>>(() => new Set<number>(breakpoints.value));

  const historyRangeMax = computed<number>(() => (sessionHistory.value.length > 0 ? sessionHistory.value.length - 1 : 0));
  const historyRangeDisabled = computed<boolean>(() => sessionHistory.value.length <= 1);

  const currentState = computed<SessionState | null>(() => sessionHistory.value[selectedHistoryIndex.value] ?? null);
  const finishedAtCurrent = computed<boolean>(() => selectedHistoryIndex.value === sessionHistory.value.length - 1 && sessionFinished.value);
  const totalStepsDisplay = computed<string>(() => formatTotalSteps(totalSteps.value, totalStepsCapped.value, finishedAtCurrent.value));

  const historyInfoText = computed<string>(() => {
    const total = sessionHistory.value.length;
    const state = currentState.value;
    if (!total || !state) {
      return 'Step 0 / 0';
    }
    const position = `${selectedHistoryIndex.value + 1} / ${total}`;
    const isLatest = selectedHistoryIndex.value === total - 1;
    let suffix = '';
    if (historyPreview.value && !isLatest) {
      suffix = ' – preview';
    } else if (!historyPreview.value && !isLatest) {
      suffix = ' – history';
    }
    return `Step ${state.step} (${position})${suffix}`;
  });

  const historyChips = computed<HistoryChip[]>(() => {
    if (!sessionHistory.value.length) {
      return [];
    }
    const total = sessionHistory.value.length;
    const start = Math.max(0, total - HISTORY_CHIPS_MAX_VISIBLE);
    const chips: HistoryChip[] = [];
    for (let i = start; i < total; i += 1) {
      const entry = sessionHistory.value[i];
      chips.push({
        index: i,
        label: String(entry.step),
        isActive: i === selectedHistoryIndex.value,
        isPreview: i !== total - 1 && (i === selectedHistoryIndex.value ? historyPreview.value : false),
      });
    }
    return chips;
  });

  const breakpointList = computed<number[]>(() => breakpoints.value.slice());

  const tapeCells = computed(() => {
    const state = currentState.value;
    if (!state) {
      return [] as Array<{ index: number; value: number; isPointer: boolean }>;
    }
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

    const cells: Array<{ index: number; value: number; isPointer: boolean }> = [];
    for (let absolute = startIndex; absolute <= endIndex; absolute += 1) {
      const offset = absolute - state.tape_start;
      const value = offset >= 0 && offset < state.tape.length ? state.tape[offset] : 0;
      cells.push({ index: absolute, value, isPointer: absolute === pointer });
    }
    return cells;
  });

  const codeWindowHtml = computed<string>(() => {
    const code = brainfuckCode.value;
    const state = currentState.value;
    const pc = state ? state.pc : 0;
    const tokens: string[] = [];
    for (let index = 0; index < code.length; index += 1) {
      const classes = ['code-token'];
      if (index === pc) {
        classes.push('is-current');
      }
      if (breakpointSet.value.has(index)) {
        classes.push('has-breakpoint');
      }
      tokens.push(`<span class="${classes.join(' ')}" data-pc="${index}">${formatCodeChar(code[index])}</span>`);
    }
    const endClasses = ['code-token'];
    if (pc >= code.length) {
      endClasses.push('is-current');
    }
    tokens.push(`<span class="${endClasses.join(' ')}" data-pc="${code.length}">[END]</span>`);

    const lines: string[] = [];
    for (let i = 0; i < tokens.length; i += CODE_LINE_WIDTH) {
      const slice = tokens.slice(i, i + CODE_LINE_WIDTH).join('');
      lines.push(`<div class="code-line">${slice}</div>`);
    }
    return lines.join('');
  });

  const finishedDisplay = computed<string>(() => (finishedAtCurrent.value ? 'Yes' : 'No'));
  const commandDisplay = computed<string>(() => {
    const state = currentState.value;
    if (!state) {
      return '(init)';
    }
    if (state.command === null || state.command === undefined) {
      return '(init)';
    }
    return state.command;
  });

  function setStatus(message: string, isError = false): void {
    statusMessage.value = message;
    statusIsError.value = isError;
  }

  function setBusy(value: boolean): void {
    isBusy.value = value;
  }

  function normalizeTapeWindow(): number {
    const minimumWindow = Math.ceil(TAPE_VIEW_SIZE / 2);
    const normalized = clampPositiveInt(tapeWindow.value, 10);
    const effective = Math.max(normalized, minimumWindow);
    tapeWindow.value = effective;
    return effective;
  }

function getSessionPayload(): CreateSessionRequest {
    const codeElement = document.getElementById('code') as HTMLTextAreaElement | null;
    const inputElement = document.getElementById('input') as HTMLInputElement | null;
    const languageElement = document.getElementById('language') as HTMLSelectElement | null;
    const tapeWindowElement = document.getElementById('tape-window') as HTMLInputElement | null;

    if (codeElement) {
      codeInput.value = codeElement.value;
    }
    if (inputElement) {
      inputValue.value = inputElement.value;
    }
    if (languageElement) {
      language.value = parseSupportedLanguage(languageElement.value);
    }
    if (tapeWindowElement) {
      tapeWindow.value = Number(tapeWindowElement.value);
    }

    const effectiveWindow = normalizeTapeWindow();
    return {
      code: codeInput.value,
      input: inputValue.value,
      tape_window: effectiveWindow,
      language: language.value,
    };
  }

  function describeError(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return String(error);
  }

  function applySessionPayload(payload: SessionLikePayload, selectLatestHistory: boolean): void {
    sessionId.value = payload.session_id;
    sessionFinished.value = Boolean(payload.finished);
    brainfuckCode.value = payload.code || '';

    const nextHistory = Array.isArray(payload.history) && payload.history.length > 0
      ? payload.history.map(cloneState)
      : 'state' in payload && payload.state
        ? [cloneState(payload.state)]
        : [];
    sessionHistory.value = nextHistory;

    const nextBreakpoints = Array.isArray(payload.breakpoints) ? payload.breakpoints.slice() : [];
    nextBreakpoints.sort((a, b) => a - b);
    breakpoints.value = nextBreakpoints;

    totalSteps.value = payload.total_steps || 0;
    totalStepsCapped.value = Boolean(payload.total_steps_capped);

    const normalizedLanguage = parseSupportedLanguage(payload.language);
    language.value = normalizedLanguage;
    compiledCode.value = normalizedLanguage === 'tinybf' ? brainfuckCode.value : '';

    if (selectLatestHistory) {
      selectedHistoryIndex.value = Math.max(0, sessionHistory.value.length - 1);
    } else {
      selectedHistoryIndex.value = Math.min(selectedHistoryIndex.value, Math.max(0, sessionHistory.value.length - 1));
    }
    historyPreview.value = false;
  }

  function ensureScrollToCurrent(): void {
    nextTick(() => {
      const codeWindow = document.getElementById('code-window');
      const currentToken = codeWindow?.querySelector<HTMLElement>('.code-token.is-current');
      currentToken?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }).catch(() => undefined);
  }

  async function createSession(): Promise<void> {
    if (isBusy.value) {
      return;
    }
    setBusy(true);
    setStatus('Creating session...');
    try {
      const response = await api.createSession(getSessionPayload());
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as SessionPayload;
      applySessionPayload(payload, true);
      setStatus('Session ready.');
      ensureScrollToCurrent();
    } catch (error) {
      sessionId.value = null;
      setStatus(`Failed to create session: ${describeError(error)}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function stepSession(): Promise<void> {
    if (isBusy.value) {
      return;
    }
    if (!sessionId.value) {
      await createSession();
      return;
    }
    setBusy(true);
    const stepElement = document.getElementById('step-count') as HTMLInputElement | null;
    if (stepElement) {
      stepCount.value = Number(stepElement.value);
    }
    const count = clampPositiveInt(stepCount.value, 1);
    stepCount.value = count;
    setStatus(`Stepping ${count} instruction${count > 1 ? 's' : ''}...`);
    try {
      const response = await api.stepSession(sessionId.value, { count });
      if (response.status === 409) {
        const detail = (await response.json()) as DetailPayload;
        setStatus(detail.detail || 'Step limit exceeded.', true);
        return;
      }
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as StepResponse;
      applySessionPayload(payload, true);
      if (payload.hit_breakpoint !== null && payload.hit_breakpoint !== undefined) {
        setStatus(`Hit breakpoint at pc ${payload.hit_breakpoint}.`);
      } else {
        setStatus(payload.finished ? 'Program finished.' : 'Step complete.');
      }
      ensureScrollToCurrent();
    } catch (error) {
      setStatus(`Failed to step: ${describeError(error)}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function runSessionToEnd(): Promise<void> {
    if (isBusy.value) {
      return;
    }
    if (!sessionId.value) {
      await createSession();
      return;
    }
    setBusy(true);
    setStatus('Running program to completion...');
    try {
      const response = await api.runSession(sessionId.value, { limit: DEFAULT_RUN_LIMIT, ignore_breakpoints: true });
      if (response.status === 409) {
        const detail = (await response.json()) as DetailPayload;
        setStatus(detail.detail || 'Step limit exceeded.', true);
        return;
      }
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as StepResponse;
      applySessionPayload(payload, true);
      setStatus(payload.finished ? 'Program finished.' : 'Stopped after max steps.');
      ensureScrollToCurrent();
    } catch (error) {
      setStatus(`Failed to run: ${describeError(error)}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function runToBreakpoint(): Promise<void> {
    if (isBusy.value) {
      return;
    }
    if (!sessionId.value) {
      await createSession();
      return;
    }
    if (!breakpoints.value.length) {
      await runSessionToEnd();
      return;
    }
    setBusy(true);
    setStatus('Running until breakpoint or completion...');
    try {
      const stepElement = document.getElementById('step-count') as HTMLInputElement | null;
      if (stepElement) {
        stepCount.value = Number(stepElement.value);
      }
      const rawLimit = Number(stepCount.value);
      const body: RunRequest = {};
      if (Number.isFinite(rawLimit) && rawLimit > 1) {
        body.limit = rawLimit;
      }
      const response = await api.runSession(sessionId.value, body);
      if (response.status === 409) {
        const detail = (await response.json()) as DetailPayload;
        setStatus(detail.detail || 'Step limit exceeded.', true);
        return;
      }
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as StepResponse;
      applySessionPayload(payload, true);
      if (payload.hit_breakpoint !== null && payload.hit_breakpoint !== undefined) {
        setStatus(`Stopped at breakpoint pc ${payload.hit_breakpoint}.`);
      } else {
        setStatus(payload.finished ? 'Program finished.' : 'Run completed.');
      }
      ensureScrollToCurrent();
    } catch (error) {
      setStatus(`Failed to run: ${describeError(error)}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function resetSession(): Promise<void> {
    if (isBusy.value) {
      return;
    }
    if (!sessionId.value) {
      await createSession();
      return;
    }
    setBusy(true);
    setStatus('Resetting session...');
    try {
      const response = await api.resetSession(sessionId.value);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as SessionPayload;
      applySessionPayload(payload, true);
      setStatus('Session reset.');
      ensureScrollToCurrent();
    } catch (error) {
      setStatus(`Failed to reset: ${describeError(error)}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function addBreakpoint(pc: number): Promise<void> {
    if (!sessionId.value) {
      setStatus('Create a session before adding breakpoints.', true);
      return;
    }
    if (!Number.isFinite(pc) || pc < 0) {
      setStatus('Breakpoint must be a non-negative integer.', true);
      return;
    }
    if (isBusy.value) {
      setStatus('Another action is in progress.', true);
      return;
    }
    setBusy(true);
    setStatus(`Adding breakpoint at pc ${pc}...`);
    try {
      const body: BreakpointRequest = { pc };
      const response = await api.addBreakpoint(sessionId.value, body);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as SessionPayload;
      applySessionPayload(payload, false);
      setStatus(`Breakpoint added at pc ${pc}.`);
    } catch (error) {
      setStatus(`Failed to add breakpoint: ${describeError(error)}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function removeBreakpoint(pc: number): Promise<void> {
    if (!sessionId.value) {
      return;
    }
    if (isBusy.value) {
      setStatus('Another action is in progress.', true);
      return;
    }
    setBusy(true);
    try {
      const response = await api.removeBreakpointRequest(sessionId.value, pc);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as SessionPayload;
      applySessionPayload(payload, false);
      setStatus(`Removed breakpoint at pc ${pc}.`);
    } catch (error) {
      setStatus(`Failed to remove breakpoint: ${describeError(error)}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function toggleBreakpoint(pc: number): Promise<void> {
    if (!sessionId.value) {
      setStatus('Create a session before toggling breakpoints.', true);
      return;
    }
    if (pc < 0 || !Number.isFinite(pc) || pc > brainfuckCode.value.length) {
      return;
    }
    if (breakpointSet.value.has(pc)) {
      await removeBreakpoint(pc);
    } else {
      await addBreakpoint(pc);
    }
  }

  function selectHistory(index: number, preview: boolean): void {
    if (!sessionHistory.value.length) {
      return;
    }
    const clamped = Math.max(0, Math.min(index, sessionHistory.value.length - 1));
    selectedHistoryIndex.value = clamped;
    historyPreview.value = preview;
    ensureScrollToCurrent();
  }

  function onHistorySliderInput(value: number): void {
    selectHistory(value, true);
  }

  function onHistorySliderChange(value: number): void {
    selectHistory(value, false);
  }

  function selectHistoryChip(index: number): void {
    selectHistory(index, false);
  }

  function setLanguage(value: string): void {
    language.value = parseSupportedLanguage(value);
    if (language.value !== 'tinybf') {
      compiledCode.value = '';
    }
  }

  function setCode(value: string): void {
    codeInput.value = value;
  }

  function setInputValue(value: string): void {
    inputValue.value = value;
  }

  function setTapeWindowValue(value: number): void {
    tapeWindow.value = Number.isFinite(value) ? value : tapeWindow.value;
  }

  function setStepCountValue(value: number): void {
    stepCount.value = Number.isFinite(value) ? value : stepCount.value;
  }

  return {
    // state
    codeInput,
    inputValue,
    language,
    tapeWindow,
    stepCount,
    statusMessage,
    statusIsError,
    isBusy,
    showCompiled,
    compiledCode,
    sessionHistory,
    selectedHistoryIndex,
    historyPreview,
    historyInfoText,
    historyRangeMax,
    historyRangeDisabled,
    historyChips,
    breakpointList,
    tapeCells,
    codeWindowHtml,
    currentState,
    brainfuckCode,
    totalStepsDisplay,
    finishedDisplay,
    commandDisplay,

    // actions
    createSession,
    stepSession,
    runSessionToEnd,
    runToBreakpoint,
    resetSession,
    toggleBreakpoint,
    removeBreakpoint,
    onHistorySliderInput,
    onHistorySliderChange,
    selectHistoryChip,
    setLanguage,
    setCode,
    setInputValue,
    setTapeWindowValue,
    setStepCountValue,
    ensureScrollToCurrent,
    finishedAtCurrent,
  };
});
