function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

export interface UIElements {
  code: HTMLTextAreaElement;
  input: HTMLInputElement;
  languageSelect: HTMLSelectElement;
  compiledWrapper: HTMLElement;
  compiledCode: HTMLTextAreaElement;
  tapeWindow: HTMLInputElement;
  stepCount: HTMLInputElement;
  status: HTMLElement;
  step: HTMLElement;
  pc: HTMLElement;
  command: HTMLElement;
  pointer: HTMLElement;
  output: HTMLElement;
  finished: HTMLElement;
  tape: HTMLElement;
  codeWindow: HTMLElement;
  createButton: HTMLButtonElement;
  stepButton: HTMLButtonElement;
  runButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  historyFirst: HTMLButtonElement;
  historyPrev: HTMLButtonElement;
  historyNext: HTMLButtonElement;
  historyLast: HTMLButtonElement;
  historyRange: HTMLInputElement;
  historyInfo: HTMLElement;
  historyChips: HTMLElement;
  runToBreakButton: HTMLButtonElement;
  breakpointList: HTMLElement;
}

export function resolveElements(): UIElements {
  return {
    code: getElement<HTMLTextAreaElement>('code'),
    input: getElement<HTMLInputElement>('input'),
    languageSelect: getElement<HTMLSelectElement>('language'),
    compiledWrapper: getElement<HTMLElement>('compiled-wrapper'),
    compiledCode: getElement<HTMLTextAreaElement>('compiled-code'),
    tapeWindow: getElement<HTMLInputElement>('tape-window'),
    stepCount: getElement<HTMLInputElement>('step-count'),
    status: getElement<HTMLElement>('status'),
    step: getElement<HTMLElement>('state-step'),
    pc: getElement<HTMLElement>('state-pc'),
    command: getElement<HTMLElement>('state-command'),
    pointer: getElement<HTMLElement>('state-pointer'),
    output: getElement<HTMLElement>('state-output'),
    finished: getElement<HTMLElement>('state-finished'),
    tape: getElement<HTMLElement>('tape'),
    codeWindow: getElement<HTMLElement>('code-window'),
    createButton: getElement<HTMLButtonElement>('create-session'),
    stepButton: getElement<HTMLButtonElement>('step'),
    runButton: getElement<HTMLButtonElement>('run'),
    resetButton: getElement<HTMLButtonElement>('reset'),
    historyFirst: getElement<HTMLButtonElement>('history-first'),
    historyPrev: getElement<HTMLButtonElement>('history-prev'),
    historyNext: getElement<HTMLButtonElement>('history-next'),
    historyLast: getElement<HTMLButtonElement>('history-last'),
    historyRange: getElement<HTMLInputElement>('history-range'),
    historyInfo: getElement<HTMLElement>('history-info'),
    historyChips: getElement<HTMLElement>('history-chips'),
    runToBreakButton: getElement<HTMLButtonElement>('run-to-break'),
    breakpointList: getElement<HTMLElement>('breakpoint-list'),
  };
}
