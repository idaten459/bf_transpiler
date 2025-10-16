import { SessionState } from './types';

export interface AppState {
  sessionId: string | null;
  brainfuckCode: string;
  sessionHistory: SessionState[];
  sessionFinished: boolean;
  currentBreakpoints: Set<number>;
  selectedHistoryIndex: number;
  isBusy: boolean;
  totalSteps: number;
  totalStepsCapped: boolean;
}

export function createInitialState(): AppState {
  return {
    sessionId: null,
    brainfuckCode: '',
    sessionHistory: [],
    sessionFinished: false,
    currentBreakpoints: new Set<number>(),
    selectedHistoryIndex: 0,
    isBusy: false,
    totalSteps: 0,
    totalStepsCapped: false,
  };
}
