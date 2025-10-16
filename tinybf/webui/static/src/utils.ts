import { SupportedLanguage } from './types';

export function clampPositiveInt(value: string | number | null | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>\"]/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return char;
    }
  });
}

export function formatCodeChar(char: string | undefined): string {
  if (!char) {
    return '&nbsp;';
  }
  if (char === ' ') {
    return '&nbsp;';
  }
  if (char === '\n') {
    return '⏎';
  }
  return escapeHtml(char);
}

export function formatTotalSteps(total: number, capped: boolean, finished: boolean): string {
  if (!total) {
    return '';
  }
  if (capped && (!finished || total >= 10000)) {
    return `${total}+`;
  }
  return String(total);
}

export function parseSupportedLanguage(value: string): SupportedLanguage {
  const normalized = value.toLowerCase();
  if (normalized === 'brainfuck' || normalized === 'tinybf') {
    return normalized;
  }
  return 'brainfuck';
}
