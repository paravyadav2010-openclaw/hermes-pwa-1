import type { ToolCall } from '@hermes-pwa/core';

export type ToolStatus = 'error' | 'running' | 'success';
export type ToolTone = 'agent' | 'browser' | 'default' | 'file' | 'image' | 'terminal' | 'web';

export interface ToolView {
  countLabel: string | undefined;
  detail: string;
  detailLabel: string;
  icon: string;
  rawResult: string;
  status: ToolStatus;
  subtitle: string;
  title: string;
  tone: ToolTone;
}

interface ToolMeta {
  done: string;
  icon: string;
  pending: string;
  tone: ToolTone;
}

const TOOL_META: Record<string, ToolMeta> = {
  browser_click: { done: 'Clicked page element', pending: 'Clicking page element', icon: 'globe', tone: 'browser' },
  browser_fill: { done: 'Filled form field', pending: 'Filling form field', icon: 'globe', tone: 'browser' },
  browser_navigate: { done: 'Opened page', pending: 'Opening page', icon: 'globe', tone: 'browser' },
  browser_snapshot: { done: 'Captured page snapshot', pending: 'Capturing page snapshot', icon: 'globe', tone: 'browser' },
  browser_take_screenshot: { done: 'Captured screenshot', pending: 'Capturing screenshot', icon: 'file', tone: 'browser' },
  browser_type: { done: 'Typed on page', pending: 'Typing on page', icon: 'globe', tone: 'browser' },
  clarify: { done: 'Asked a question', pending: 'Asking a question', icon: 'chat', tone: 'agent' },
  cronjob: { done: 'Cron job', pending: 'Scheduling cron job', icon: 'cron', tone: 'agent' },
  edit_file: { done: 'Edited file', pending: 'Editing file', icon: 'edit', tone: 'file' },
  execute_code: { done: 'Ran code', pending: 'Running code', icon: 'terminal', tone: 'terminal' },
  image_generate: { done: 'Generated image', pending: 'Generating image', icon: 'file', tone: 'image' },
  list_files: { done: 'Listed files', pending: 'Listing files', icon: 'file', tone: 'file' },
  patch: { done: 'Patched file', pending: 'Patching file', icon: 'edit', tone: 'file' },
  process: { done: 'Process finished', pending: 'Running process', icon: 'terminal', tone: 'terminal' },
  read_file: { done: 'Read file', pending: 'Reading file', icon: 'file', tone: 'file' },
  search_files: { done: 'Searched files', pending: 'Searching files', icon: 'search', tone: 'file' },
  session_search_recall: { done: 'Searched session history', pending: 'Searching session history', icon: 'search', tone: 'agent' },
  skill_view: { done: 'Opened skill', pending: 'Opening skill', icon: 'file', tone: 'agent' },
  terminal: { done: 'Ran command', pending: 'Running command', icon: 'terminal', tone: 'terminal' },
  todo: { done: 'Updated todos', pending: 'Updating todos', icon: 'settings', tone: 'agent' },
  vision_analyze: { done: 'Analyzed image', pending: 'Analyzing image', icon: 'search', tone: 'image' },
  web_extract: { done: 'Read webpage', pending: 'Reading webpage', icon: 'globe', tone: 'web' },
  web_search: { done: 'Searched web', pending: 'Searching web', icon: 'search', tone: 'web' },
  write_file: { done: 'Edited file', pending: 'Editing file', icon: 'edit', tone: 'file' },
};

function titleForTool(name: string): string {
  const normalized = name.replace(/^browser_/, '').replace(/^web_/, '');
  return (
    normalized
      .split('_')
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' ') || name
  );
}

const PREFIX_META: { icon: string; prefix: string; tone: ToolTone; verb: string }[] = [
  { prefix: 'browser_', verb: 'Browser', icon: 'globe', tone: 'browser' },
  { prefix: 'web_', verb: 'Web', icon: 'globe', tone: 'web' },
];

function toolMeta(name: string): ToolMeta {
  if (TOOL_META[name]) return TOOL_META[name];
  const action = titleForTool(name);
  const prefix = PREFIX_META.find((p) => name.startsWith(p.prefix));
  return prefix
    ? {
        done: `${prefix.verb} ${action}`,
        pending: `Running ${prefix.verb.toLowerCase()} ${action.toLowerCase()}`,
        icon: prefix.icon,
        tone: prefix.tone,
      }
    : { done: action, pending: `Running ${action.toLowerCase()}`, icon: 'settings', tone: 'default' };
}

export function parseMaybeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

function compactPreview(value: unknown, max = 72): string {
  let raw: unknown = value;
  if (raw && typeof raw === 'object') {
    const parsed = parseMaybeObject(raw);
    raw = parsed.context ?? parsed.preview ?? raw;
  }
  if (typeof raw !== 'string') {
    if (raw == null) raw = '';
    else {
      try {
        raw = JSON.stringify(raw);
      } catch {
        raw = String(raw);
      }
    }
  }
  const line = (raw as string).replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function firstStringField(record: Record<string, unknown> | undefined, keys: readonly string[]): string {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function contextValue(value: unknown): string {
  const row = parseMaybeObject(value);
  if (typeof row.context === 'string') return row.context;
  if (typeof row.preview === 'string') return row.preview;
  if (typeof row.args_text === 'string') return row.args_text;
  return typeof value === 'string' ? value : '';
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function findFirstUrl(args: Record<string, unknown>, result: Record<string, unknown>): string {
  const combined = { ...args, ...result };
  for (const value of Object.values(combined)) {
    if (typeof value === 'string') {
      try {
        const url = new URL(value);
        return url.href;
      } catch {
        // continue
      }
    }
  }
  return '';
}

function basename(path: string): string {
  const cleaned = path.replace(/\\/g, '/');
  const parts = cleaned.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

function toolStatus(tool: ToolCall, resultRecord: Record<string, unknown>): ToolStatus {
  if (tool.output === undefined) return 'running';
  if (resultRecord.error || resultRecord.status === 'error') return 'error';
  return 'success';
}

function fallbackDetailText(args: Record<string, unknown>, result: Record<string, unknown>): string {
  const argsJson = Object.keys(args).length ? JSON.stringify(args) : '';
  const resultJson = Object.keys(result).length ? JSON.stringify(result) : '';
  return resultJson || argsJson;
}

function looksLikeJsonBlob(text: string): boolean {
  const t = text.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function toolTarget(args: Record<string, unknown>, result: Record<string, unknown>, keys: readonly string[]): string {
  return (
    firstStringField(args, keys) ||
    firstStringField(result, keys) ||
    contextValue(args) ||
    contextValue(result)
  );
}

function toolSubtitle(tool: ToolCall, argsRecord: Record<string, unknown>, resultRecord: Record<string, unknown>): string {
  // Desktop keeps the collapsed row single-line. Subtitle is only used as a
  // tooltip / path hint for file edits — not a second visual line.
  if (tool.name === 'write_file' || tool.name === 'edit_file' || tool.name === 'patch' || tool.name === 'read_file') {
    return toolTarget(argsRecord, resultRecord, ['path', 'file', 'filepath', 'context', 'args_text']);
  }
  return '';
}

/** Desktop-style title: verb + target on one line (Read path, Ran · cmd). */
function dynamicTitle(tool: ToolCall, args: Record<string, unknown>, result: Record<string, unknown>, fallback: string): string {
  const isPending = tool.output === undefined;
  const verb = (gerund: string, past: string) => (isPending ? gerund : past);

  if (tool.name === 'web_extract') {
    const url = findFirstUrl(args, result);
    return url ? `${verb('Reading', 'Read')} ${hostnameOf(url)}` : fallback;
  }

  if (tool.name === 'browser_navigate') {
    const url = findFirstUrl(args, result);
    return url ? `${verb('Opening', 'Opened')} ${hostnameOf(url)}` : fallback;
  }

  if (tool.name === 'web_search') {
    const query = firstStringField(args, ['search_term', 'query']) || contextValue(args);
    return query ? `${verb('Searching', 'Searched')} “${compactPreview(query, 48)}”` : fallback;
  }

  if (tool.name === 'terminal' || tool.name === 'execute_code' || tool.name === 'process') {
    const command =
      firstStringField(args, ['context', 'preview', 'args_text', 'command', 'code', 'script', 'summary']) ||
      contextValue(args);
    if (tool.name === 'process') {
      return command
        ? `${verb('Running process', 'Process finished')} · ${compactPreview(command, 100)}`
        : verb('Running process', 'Process finished');
    }
    if (command) {
      const verbText = tool.name === 'execute_code' ? verb('Running code', 'Ran code') : verb('Running', 'Ran');
      return `${verbText} · ${compactPreview(command, 120)}`;
    }
    return tool.name === 'execute_code' ? verb('Running code', 'Ran code') : verb('Running command', 'Ran command');
  }

  if (tool.name === 'skill_view' || tool.name === 'skill_manage' || tool.name === 'skills_list') {
    const skill =
      firstStringField(args, ['skill', 'path', 'file_path', 'context', 'args_text', 'summary', 'name']) ||
      contextValue(args);
    if (skill && skill !== tool.name) {
      return `${verb('Opening', 'Opened')} ${compactPreview(skill, 100)}`;
    }
    return verb('Opening skill', 'Opened skill');
  }

  if (tool.name === 'read_file') {
    const path = toolTarget(args, result, ['path', 'file', 'filepath', 'context', 'args_text']);
    return path ? `${verb('Reading', 'Read')} ${compactPreview(path, 120)}` : fallback;
  }

  if (tool.name === 'write_file' || tool.name === 'edit_file' || tool.name === 'patch') {
    const path = toolTarget(args, result, ['path', 'file', 'filepath', 'context', 'args_text']);
    // Desktop uses basename as the primary title for file edits.
    return path ? basename(path) : fallback;
  }

  if (tool.name === 'list_files') {
    const path = toolTarget(args, result, ['path', 'directory', 'dir', 'context', 'args_text']);
    return path ? `${verb('Listing', 'Listed')} ${compactPreview(path, 120)}` : fallback;
  }

  if (tool.name === 'search_files') {
    const query = firstStringField(args, ['query', 'search_term', 'term', 'pattern']) || contextValue(args);
    return query ? `${verb('Searching', 'Searched')} “${compactPreview(query, 48)}”` : fallback;
  }

  return fallback;
}

function toolDetailText(tool: ToolCall, argsRecord: Record<string, unknown>, resultRecord: Record<string, unknown>): string {
  const output = tool.output;
  if (typeof output === 'string' && output.trim()) {
    const text = output.trim();
    // Don't expand a row just to show the same args blob already summarized in the title.
    if (looksLikeJsonBlob(text) && Object.keys(resultRecord).length === 0) {
      const onlyMeta = Object.keys(argsRecord).every((k) => ['context', 'preview', 'args_text', 'summary', 'name'].includes(k));
      if (onlyMeta) return '';
    }
    return text;
  }
  const text = firstStringField(resultRecord, ['text', 'output', 'stdout', 'result', 'content', 'message']);
  if (text) return text;
  const fallback = fallbackDetailText(argsRecord, resultRecord);
  if (!fallback || fallback === '{}' || fallback === '[]') return '';
  // Args-only JSON is not useful expanded detail for compact mobile rows.
  if (!tool.output && looksLikeJsonBlob(fallback)) return '';
  return fallback;
}

function toolDetailLabel(toolName: string): string {
  if (toolName === 'web_search') return 'Details';
  if (toolName === 'terminal' || toolName === 'execute_code' || toolName === 'process') return 'Command output';
  return 'Output';
}

function formatCountLabel(count: number, noun: string): string {
  const word = count === 1 ? noun : `${noun}s`;
  return `${count} ${word}`;
}

function toolResultCount(tool: ToolCall, argsRecord: Record<string, unknown>, resultRecord: Record<string, unknown>): string | undefined {
  if (tool.name === 'web_search' || tool.name === 'search_files') {
    const results = resultRecord.results ?? resultRecord.items ?? resultRecord.matches ?? resultRecord.files;
    if (Array.isArray(results) && results.length > 0) {
      return formatCountLabel(results.length, 'result');
    }
  }
  if (tool.name === 'list_files') {
    const files = resultRecord.files ?? resultRecord.items;
    if (Array.isArray(files) && files.length > 0) {
      return formatCountLabel(files.length, 'file');
    }
  }
  if (tool.name === 'todo') {
    const todos = parseMaybeObject(tool.output).todos ?? parseMaybeObject(tool.output);
    if (Array.isArray(todos)) {
      const completed = todos.filter((t) => (t as Record<string, unknown>).status === 'completed').length;
      if (completed > 0) return `${completed}/${todos.length} done`;
      return formatCountLabel(todos.length, 'todo');
    }
  }
  return undefined;
}

export function buildToolView(tool: ToolCall): ToolView {
  const argsRecord = parseMaybeObject(tool.input);
  const resultRecord = parseMaybeObject(tool.output);
  const meta = toolMeta(tool.name);
  const status = toolStatus(tool, resultRecord);
  const baseTitle = tool.output === undefined ? meta.pending : meta.done;
  const title = dynamicTitle(tool, argsRecord, resultRecord, baseTitle);
  const subtitle = toolSubtitle(tool, argsRecord, resultRecord);

  return {
    countLabel: toolResultCount(tool, argsRecord, resultRecord),
    detail: toolDetailText(tool, argsRecord, resultRecord),
    detailLabel: toolDetailLabel(tool.name),
    icon: meta.icon,
    rawResult: typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output ?? ''),
    status,
    subtitle,
    title,
    tone: meta.tone,
  };
}
