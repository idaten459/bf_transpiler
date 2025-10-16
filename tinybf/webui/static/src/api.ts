import { BreakpointRequest, CreateSessionRequest, RunRequest, StepRequest } from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export function createSession(request: CreateSessionRequest): Promise<Response> {
  return fetch('/api/session', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(request),
  });
}

export function getSession(sessionId: string): Promise<Response> {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}`);
}

export function stepSession(sessionId: string, request: StepRequest): Promise<Response> {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/step`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(request),
  });
}

export function runSession(sessionId: string, request: RunRequest): Promise<Response> {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/run`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(request),
  });
}

export function resetSession(sessionId: string): Promise<Response> {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/reset`, {
    method: 'POST',
  });
}

export function addBreakpoint(sessionId: string, request: BreakpointRequest): Promise<Response> {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/breakpoints`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(request),
  });
}

export function removeBreakpointRequest(sessionId: string, pc: number): Promise<Response> {
  return fetch(`/api/session/${encodeURIComponent(sessionId)}/breakpoints/${pc}`, {
    method: 'DELETE',
  });
}
