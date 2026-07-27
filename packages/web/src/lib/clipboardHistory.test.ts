import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLIPBOARD_HISTORY_KEY,
  loadClipboardHistory,
  MAX_CLIPBOARD_HISTORY,
  pushClipboardHistory,
} from './clipboardHistory';

describe('clipboardHistory', () => {
  beforeEach(() => window.localStorage.clear());

  it('persists newest-first, deduplicated history', () => {
    pushClipboardHistory('first');
    pushClipboardHistory('second');
    expect(pushClipboardHistory('first')).toEqual(['first', 'second']);
    expect(loadClipboardHistory()).toEqual(['first', 'second']);
  });

  it('rejects blank entries and keeps only the latest ten', () => {
    expect(pushClipboardHistory('   ')).toEqual([]);
    for (let index = 0; index < MAX_CLIPBOARD_HISTORY + 2; index += 1) pushClipboardHistory(`copy ${index}`);
    expect(loadClipboardHistory()).toEqual([
      'copy 11', 'copy 10', 'copy 9', 'copy 8', 'copy 7',
      'copy 6', 'copy 5', 'copy 4', 'copy 3', 'copy 2',
    ]);
  });

  it('recovers safely from invalid stored data', () => {
    window.localStorage.setItem(CLIPBOARD_HISTORY_KEY, '{bad json');
    expect(loadClipboardHistory()).toEqual([]);
  });
});
