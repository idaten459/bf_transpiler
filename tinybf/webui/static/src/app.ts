import { defineComponent, onMounted, ref, watch } from 'vue';
import { useSessionStore } from './store/session';

export const App = defineComponent({
  name: 'TinyBFApp',
  setup() {
    const session = useSessionStore();
    const historySlider = ref<HTMLInputElement | null>(null);

    onMounted(() => {
      void session.createSession();
    });

    watch(
      () => session.codeWindowHtml,
      () => {
        session.ensureScrollToCurrent();
      },
    );

    watch(
      () => session.selectedHistoryIndex,
      () => {
        session.ensureScrollToCurrent();
      },
    );

    function onHistoryInput(event: Event) {
      const value = Number((event.target as HTMLInputElement).value);
      session.onHistorySliderInput(value);
    }

    function onHistoryChange(event: Event) {
      const value = Number((event.target as HTMLInputElement).value);
      session.onHistorySliderChange(value);
    }

    function onLanguageChange(event: Event) {
      session.setLanguage((event.target as HTMLSelectElement).value);
    }

    function onCodeInput(event: Event) {
      session.setCode((event.target as HTMLTextAreaElement).value);
    }

    function onUserInput(event: Event) {
      session.setInputValue((event.target as HTMLInputElement).value);
    }

    function onTapeWindowInput(event: Event) {
      session.setTapeWindowValue(Number((event.target as HTMLInputElement).value));
    }

    function onStepCountInput(event: Event) {
      session.setStepCountValue(Number((event.target as HTMLInputElement).value));
    }

    function onCodeWindowClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest('[data-pc]');
      if (!target) {
        return;
      }
      const pc = Number((target as HTMLElement).dataset.pc);
      if (!Number.isFinite(pc)) {
        return;
      }
      void session.toggleBreakpoint(pc);
    }

    return {
      session,
      historySlider,
      onHistoryInput,
      onHistoryChange,
      onLanguageChange,
      onCodeInput,
      onUserInput,
      onTapeWindowInput,
      onStepCountInput,
      onCodeWindowClick,
    };
  },
  template: /* html */ `
    <div class="layout">
      <section class="panel">
        <div class="panel-header">
          <h2>Program</h2>
        </div>
        <label class="field">
          <span class="field-label">TinyBF / Brainfuck Code</span>
          <textarea id="code" rows="10" :value="session.codeInput" @input="onCodeInput"></textarea>
        </label>
        <div class="field">
          <span class="field-label">Language</span>
          <select id="language" :value="session.language" @change="onLanguageChange">
            <option value="brainfuck">Brainfuck</option>
            <option value="tinybf">TinyBF</option>
          </select>
        </div>
        <label class="field" id="compiled-wrapper" v-show="session.showCompiled">
          <span class="field-label">Compiled Brainfuck</span>
          <textarea id="compiled-code" rows="6" readonly :value="session.compiledCode"></textarea>
        </label>
        <div class="field-group">
          <label class="field">
            <span class="field-label">Input</span>
            <input id="input" type="text" placeholder="Optional input" :value="session.inputValue" @input="onUserInput" />
          </label>
          <label class="field">
            <span class="field-label">Tape Window</span>
            <input id="tape-window" type="number" min="1" :value="session.tapeWindow" @input="onTapeWindowInput" />
          </label>
          <label class="field">
            <span class="field-label">Step Count</span>
            <input id="step-count" type="number" min="1" :value="session.stepCount" @input="onStepCountInput" />
          </label>
        </div>
        <div class="button-row">
          <button id="create-session" class="primary" @click.prevent="session.createSession">Create Session</button>
          <button id="step" class="accent" @click.prevent="session.stepSession">Step</button>
          <button id="run" class="accent" @click.prevent="session.runSessionToEnd">Run</button>
          <button id="reset" @click.prevent="session.resetSession">Reset</button>
        </div>
        <p id="status" class="status" :class="{ error: session.statusIsError }">{{ session.statusMessage }}</p>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Execution State</h2>
        </div>
        <dl class="state-grid">
          <div>
            <dt>Step</dt>
            <dd id="state-step">{{ session.currentState ? session.currentState.step : '-' }}<template v-if="session.currentState && session.totalStepsDisplay">/{{ session.totalStepsDisplay }}</template></dd>
          </div>
          <div>
            <dt>Program Counter</dt>
            <dd id="state-pc">{{ session.currentState ? session.currentState.pc : '-' }} / {{ session.currentState ? session.currentState.code_length : 0 }}</dd>
          </div>
          <div>
            <dt>Command</dt>
            <dd id="state-command">{{ session.commandDisplay }}</dd>
          </div>
          <div>
            <dt>Pointer</dt>
            <dd id="state-pointer">{{ session.currentState ? session.currentState.pointer : 0 }}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd id="state-output">{{ session.currentState && session.currentState.output ? session.currentState.output : '(empty)' }}</dd>
          </div>
          <div>
            <dt>Finished</dt>
            <dd id="state-finished">{{ session.finishedDisplay }}</dd>
          </div>
        </dl>
        <div class="code-preview">
          <div class="panel-subheader">
            <h3>Code Window</h3>
          </div>
          <pre id="code-window" v-html="session.codeWindowHtml" @click="onCodeWindowClick"></pre>
        </div>
        <div class="panel-subheader breakpoint-header">
          <h3>Breakpoints</h3>
          <span class="breakpoint-hint">Click code window cells to toggle</span>
        </div>
        <div class="breakpoint-controls">
          <button id="run-to-break" class="accent" type="button" @click.prevent="session.runToBreakpoint">Run to Breakpoint</button>
        </div>
        <div id="breakpoint-list" class="breakpoint-list">
          <template v-if="session.breakpointList.length">
            <span v-for="pc in session.breakpointList" :key="pc" class="breakpoint-chip">
              <span>pc {{ pc }}</span>
              <button type="button" :aria-label="'Remove breakpoint at pc ' + pc" @click.prevent="session.removeBreakpoint(pc)">×</button>
            </span>
          </template>
          <template v-else>
            <div class="breakpoint-chip">No breakpoints</div>
          </template>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Execution Timeline</h2>
        </div>
        <div class="panel-subheader">
          <h3>History</h3>
        </div>
        <div class="history-controls">
          <div class="history-actions">
            <button id="history-first" type="button" aria-label="First step" :disabled="session.selectedHistoryIndex <= 0 || session.historyRangeDisabled" @click="session.selectHistoryChip(0)">⏮</button>
            <button id="history-prev" type="button" aria-label="Previous step" :disabled="session.selectedHistoryIndex <= 0 || session.historyRangeDisabled" @click="session.selectHistoryChip(Math.max(session.selectedHistoryIndex - 1, 0))">◀</button>
            <button id="history-next" type="button" aria-label="Next step" :disabled="session.selectedHistoryIndex >= session.historyRangeMax || session.historyRangeDisabled" @click="session.selectHistoryChip(Math.min(session.selectedHistoryIndex + 1, session.historyRangeMax))">▶</button>
            <button id="history-last" type="button" aria-label="Latest step" :disabled="session.selectedHistoryIndex >= session.historyRangeMax || session.historyRangeDisabled" @click="session.selectHistoryChip(session.historyRangeMax)">⏭</button>
          </div>
          <div class="history-range-container">
            <input
              id="history-range"
              class="history-range"
              type="range"
              min="0"
              :max="session.historyRangeMax"
              :value="session.selectedHistoryIndex"
              :disabled="session.historyRangeDisabled"
              @input="onHistoryInput"
              @change="onHistoryChange"
              ref="historySlider"
            />
          </div>
          <div id="history-info" class="history-info" :class="{ preview: session.selectedHistoryIndex !== session.historyRangeMax }">{{ session.historyInfoText }}</div>
          <div id="history-chips" class="history-chips">
            <template v-if="session.historyChips.length">
              <button
                v-for="chip in session.historyChips"
                :key="chip.index"
                type="button"
                class="history-chip"
                :class="{ 'is-active': chip.isActive, 'is-preview': chip.isPreview }"
                @click="session.selectHistoryChip(chip.index)"
              >
                {{ chip.label }}
              </button>
            </template>
            <template v-else>
              <div class="history-chip">No history</div>
            </template>
          </div>
        </div>
        <div class="panel-subheader">
          <h3>Tape View</h3>
        </div>
        <div id="tape" class="tape">
          <template v-if="session.tapeCells.length">
            <div
              v-for="cell in session.tapeCells"
              :key="cell.index"
              class="tape-cell"
              :class="{ pointer: cell.isPointer }"
            >
              <span class="cell-index">@{{ cell.index }}</span>
              <span>{{ cell.value }}</span>
            </div>
          </template>
          <template v-else>
            <div class="tape-cell"><span class="cell-index">@0</span><span>0</span></div>
          </template>
        </div>
      </section>
    </div>
  `,
});
