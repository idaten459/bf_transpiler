const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const transformNullish = require('@babel/plugin-proposal-nullish-coalescing-operator');

const projectRoot = path.resolve(__dirname, '..');
const htmlPath = path.join(projectRoot, 'tinybf/webui/static/index.html');
const scriptPath = path.join(projectRoot, 'tinybf/webui/static/main.js');

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function sanitizeHtml(html) {
  return html.replace(/<script[^>]*src="\/static\/main\.js"[^>]*><\/script>/, '');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneState(state) {
  return deepClone(state);
}

function createBaseState(overrides = {}) {
  return {
    step: 0,
    pc: 0,
    command: null,
    pointer: 0,
    tape_start: 0,
    tape: [0, 0, 0, 0],
    output: '',
    code_length: 3,
    ...overrides,
  };
}

function createSessionPayload(options = {}) {
  const code = options.code || '+++';
  const state = options.state ? cloneState(options.state) : createBaseState({ code_length: code.length });
  const historySource = options.history || [state];
  const history = historySource.map((entry) => cloneState(entry));
  return {
    session_id: options.session_id || 'session-1',
    language: options.language || 'brainfuck',
    code,
    original_source: hasOwn(options, 'original_source') ? options.original_source : null,
    state: cloneState(options.current_state || history[history.length - 1] || state),
    history,
    finished: hasOwn(options, 'finished') ? options.finished : false,
    history_size: hasOwn(options, 'history_size') ? options.history_size : history.length,
    breakpoints: (options.breakpoints || []).slice(),
    hit_breakpoint: hasOwn(options, 'hit_breakpoint') ? options.hit_breakpoint : null,
    total_steps: hasOwn(options, 'total_steps') ? options.total_steps : 100,
    total_steps_capped: hasOwn(options, 'total_steps_capped') ? options.total_steps_capped : false,
  };
}

function createStepResponse(options = {}) {
  const base = options.session ? options.session : createSessionPayload(options.sessionOptions || {});
  const states = (options.states || []).map((entry) => cloneState(entry));
  const history = options.history
    ? options.history.map((entry) => cloneState(entry))
    : base.history.concat(states);
  return {
    session_id: hasOwn(options, 'session_id') ? options.session_id : base.session_id,
    language: hasOwn(options, 'language') ? options.language : base.language,
    code: hasOwn(options, 'code') ? options.code : base.code,
    states,
    history,
    finished: hasOwn(options, 'finished') ? options.finished : base.finished,
    history_size: hasOwn(options, 'history_size') ? options.history_size : history.length,
    breakpoints: hasOwn(options, 'breakpoints') ? options.breakpoints : base.breakpoints.slice(),
    hit_breakpoint: hasOwn(options, 'hit_breakpoint') ? options.hit_breakpoint : null,
    total_steps: hasOwn(options, 'total_steps') ? options.total_steps : base.total_steps,
    total_steps_capped: hasOwn(options, 'total_steps_capped') ? options.total_steps_capped : base.total_steps_capped,
  };
}

function createResponse({ status = 200, json, text } = {}) {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    async json() {
      if (json === undefined) {
        return undefined;
      }
      const value = typeof json === 'function' ? json() : json;
      return deepClone(value);
    },
    async text() {
      if (text !== undefined) {
        return typeof text === 'function' ? text() : String(text);
      }
      if (json !== undefined) {
        const value = typeof json === 'function' ? json() : json;
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
      return '';
    },
  };
}

function createFetchMock(initialQueue = []) {
  const queue = Array.from(initialQueue);
  const calls = [];

  const fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || 'GET';
    let parsedBody = undefined;
    if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
      const body = init.body;
      if (typeof body === 'string') {
        try {
          parsedBody = JSON.parse(body);
        } catch (_error) {
          parsedBody = body;
        }
      } else {
        parsedBody = body;
      }
    }

    calls.push({ url, method, body: parsedBody });

    if (!queue.length) {
      return Promise.reject(new Error(`No mock response queued for ${method} ${url}`));
    }

    const next = queue.shift();
    const responseConfig = typeof next === 'function' ? next({ url, method, body: parsedBody }) : next;
    if (!responseConfig) {
      return Promise.reject(new Error(`Mock response for ${method} ${url} was undefined`));
    }

    return Promise.resolve(createResponse(responseConfig));
  };

  fetch.queueResponse = (response) => {
    queue.push(response);
  };

  Object.defineProperty(fetch, 'calls', {
    get() {
      return calls.slice();
    },
  });

  return fetch;
}

async function flushPromises(times = 1) {
  for (let index = 0; index < times; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function bootstrap(initialResponses = []) {
  const htmlSource = sanitizeHtml(fs.readFileSync(htmlPath, 'utf-8'));
  const dom = new JSDOM(htmlSource, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  if (!dom.window.MouseEvent) {
    dom.window.MouseEvent = dom.window.Event;
  }
  if (!dom.window.HTMLElement.prototype.scrollIntoView) {
    // jsdom omits this; main.js calls it when highlighting the active command.
    dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
  }

  const fetchMock = createFetchMock(initialResponses);
  dom.window.fetch = fetchMock;

  const scriptSource = fs.readFileSync(scriptPath, 'utf-8');
  const transformed = babel.transformSync(scriptSource, {
    filename: 'main.js',
    babelrc: false,
    configFile: false,
    sourceType: 'script',
    plugins: [transformNullish],
  });
  dom.window.eval(transformed && transformed.code ? transformed.code : scriptSource);
  await flushPromises(2);

  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    fetchMock,
  };
}

describe('TinyBF Web UI main.js', () => {
  let context;

  afterEach(() => {
    if (context && context.dom) {
      context.dom.window.close();
    }
    context = undefined;
  });

  it('creates a session on load and renders the initial state', async () => {
    const baseState = createBaseState();
    const sessionPayload = createSessionPayload({ history: [baseState] });

    context = await bootstrap([{ status: 201, json: sessionPayload }]);
    const { document, fetchMock } = context;

    expect(fetchMock.calls).to.have.lengthOf(1);
    const createCall = fetchMock.calls[0];
    expect(createCall.url).to.equal('/api/session');
    expect(createCall.method).to.equal('POST');
    expect(createCall.body).to.include({ tape_window: 10, language: 'brainfuck' });

    expect(document.getElementById('status').textContent).to.equal('Session ready.');
    expect(document.getElementById('state-step').textContent).to.equal('0/100');
    expect(document.getElementById('history-info').textContent).to.equal('Step 0 (1 / 1)');
    expect(document.getElementById('breakpoint-list').textContent.trim()).to.equal('No breakpoints');
    expect(document.querySelectorAll('.tape-cell')).to.have.lengthOf(20);
  });

  it('steps the session and updates history and status', async () => {
    const baseState = createBaseState();
    const sessionPayload = createSessionPayload({ history: [baseState] });

    const stepState = createBaseState({ step: 1, pc: 1, command: '+', pointer: 0 });
    const stepResponse = createStepResponse({
      session: sessionPayload,
      states: [stepState],
      history: [cloneState(baseState), cloneState(stepState)],
    });

    context = await bootstrap([{ status: 201, json: sessionPayload }]);
    const { document, fetchMock, window } = context;

    const stepInput = document.getElementById('step-count');
    stepInput.value = '3';

    fetchMock.queueResponse({ status: 200, json: stepResponse });

    const stepButton = document.getElementById('step');
    stepButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flushPromises(3);

    expect(fetchMock.calls).to.have.lengthOf(2);
    const stepCall = fetchMock.calls[1];
    expect(stepCall.url).to.equal('/api/session/session-1/step');
    expect(stepCall.method).to.equal('POST');
    expect(stepCall.body).to.deep.equal({ count: 3 });

    expect(document.getElementById('status').textContent).to.equal('Step complete.');
    expect(document.getElementById('state-step').textContent).to.equal('1/100');
    expect(document.getElementById('history-info').textContent).to.equal('Step 1 (2 / 2)');
    expect(document.getElementById('history-range').value).to.equal('1');
  });

  it('toggles breakpoints through the code window', async () => {
    const baseState = createBaseState();
    const sessionPayload = createSessionPayload({ history: [baseState] });

    const breakpointState = createBaseState({ step: 1, pc: 1, command: '+', pointer: 0 });
    const withBreakpoint = createSessionPayload({
      history: [cloneState(baseState), cloneState(breakpointState)],
      current_state: breakpointState,
      breakpoints: [1],
      history_size: 2,
    });
    const withoutBreakpoint = createSessionPayload({
      history: [cloneState(baseState), cloneState(breakpointState)],
      current_state: breakpointState,
      breakpoints: [],
      history_size: 2,
    });

    context = await bootstrap([{ status: 201, json: sessionPayload }]);
    const { document, fetchMock, window } = context;

    // Prime breakpoint addition response.
    fetchMock.queueResponse({ status: 200, json: withBreakpoint });

    let codeCell = document.querySelector('[data-pc="1"]');
    expect(codeCell).to.not.equal(null);
    codeCell.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flushPromises(3);

    expect(fetchMock.calls).to.have.lengthOf(2);
    const addCall = fetchMock.calls[1];
    expect(addCall.url).to.equal('/api/session/session-1/breakpoints');
    expect(addCall.method).to.equal('POST');
    expect(addCall.body).to.deep.equal({ pc: 1 });
    expect(document.getElementById('status').textContent).to.equal('Breakpoint added at pc 1.');
    expect(document.querySelectorAll('.breakpoint-chip').length).to.equal(1);

    // Prime breakpoint removal response.
    fetchMock.queueResponse({ status: 200, json: withoutBreakpoint });

    codeCell = document.querySelector('[data-pc="1"]');
    expect(codeCell).to.not.equal(null);
    codeCell.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flushPromises(3);

    expect(fetchMock.calls).to.have.lengthOf(3);
    const removeCall = fetchMock.calls[2];
    expect(removeCall.url).to.equal('/api/session/session-1/breakpoints/1');
    expect(removeCall.method).to.equal('DELETE');
    expect(document.getElementById('status').textContent).to.equal('Removed breakpoint at pc 1.');
    expect(document.getElementById('breakpoint-list').textContent.trim()).to.equal('No breakpoints');
  });
});
