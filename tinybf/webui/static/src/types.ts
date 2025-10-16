export type SupportedLanguage = 'brainfuck' | 'tinybf';

export interface SessionState {
  step: number;
  pc: number;
  command: string | null;
  pointer: number;
  tape_start: number;
  tape: number[];
  output: string;
  code_length: number;
}

export interface SessionPayload {
  session_id: string;
  language: SupportedLanguage;
  code: string;
  original_source: string | null;
  state: SessionState;
  history: SessionState[];
  finished: boolean;
  history_size: number;
  breakpoints: number[];
  hit_breakpoint: number | null;
  total_steps: number;
  total_steps_capped: boolean;
}

export interface StepResponse {
  session_id: string;
  language: SupportedLanguage;
  code: string;
  states: SessionState[];
  history: SessionState[];
  finished: boolean;
  history_size: number;
  breakpoints: number[];
  hit_breakpoint: number | null;
  total_steps: number;
  total_steps_capped: boolean;
}

export type SessionLikePayload = SessionPayload | StepResponse;

export interface CreateSessionRequest {
  code: string;
  input: string;
  tape_window: number;
  language: SupportedLanguage;
}

export interface StepRequest {
  count: number;
}

export interface RunRequest {
  limit?: number;
  ignore_breakpoints?: boolean;
}

export interface BreakpointRequest {
  pc: number;
}

export interface SessionSelectionOptions {
  selectLatestHistory: boolean;
}

export interface DetailPayload {
  detail?: string;
}
