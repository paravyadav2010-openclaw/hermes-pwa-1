export const CLIPBOARD_HISTORY_KEY = 'hermes-pwa.clipboard-history.v1';
export const MAX_CLIPBOARD_HISTORY = 10;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function normalizeHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, MAX_CLIPBOARD_HISTORY);
}

export function loadClipboardHistory(): string[] {
  if (!canUseStorage()) return [];
  try {
    return normalizeHistory(JSON.parse(window.localStorage.getItem(CLIPBOARD_HISTORY_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function pushClipboardHistory(text: string): string[] {
  if (!text.trim()) return loadClipboardHistory();
  const history = [text, ...loadClipboardHistory().filter((item) => item !== text)].slice(0, MAX_CLIPBOARD_HISTORY);
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(CLIPBOARD_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Storage can be unavailable in private browsing; the copy itself still succeeds.
    }
  }
  return history;
}

export function clipboardHistoryPreview(text: string, maxLength = 72): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}
