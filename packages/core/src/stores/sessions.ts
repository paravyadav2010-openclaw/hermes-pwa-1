import { create } from 'zustand';
import {
  isPlaceholderSessionTitle,
  mergeSessionsByLineage,
  sessionPinId,
  type Session,
} from '../domain/session';
import type { RpcClient } from '../transport/jsonrpc';
import type { RestClient } from '../transport/rest';
import { LONG_RPC_TIMEOUT_MS } from '../transport/timeouts';

const PINNED_SESSIONS_STORAGE_KEY = 'hermes-pwa.pinnedSessions.v1';
export const SESSIONS_PROFILE_FILTER_STORAGE_KEY = 'hermes-pwa.sessionsProfileFilter.v1';

export type SessionsProfileFilter = 'all' | string;

export function sessionProfileKey(session: Pick<Session, 'profile'>): string {
  const name = session.profile?.trim();
  return name || 'default';
}

export function readSessionsProfileFilter(fallback?: string | undefined): SessionsProfileFilter {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(SESSIONS_PROFILE_FILTER_STORAGE_KEY)?.trim();
      if (raw) return raw;
    } catch {
      // ignore
    }
  }
  const fb = fallback?.trim();
  return fb || 'all';
}

function writeSessionsProfileFilter(filter: SessionsProfileFilter): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSIONS_PROFILE_FILTER_STORAGE_KEY, filter);
  } catch {
    // Best-effort preference only.
  }
}

export interface SessionsStore {
  sessions: Session[];
  loading: boolean;
  error: string | undefined;
  pinnedIds: string[];
  /** View filter for Sessions list + drawer. Does not activate gateway profile. */
  profileFilter: SessionsProfileFilter;

  load(rest: RestClient): Promise<void>;
  create(rpc: RpcClient, params?: { profile?: string; cwd?: string }): Promise<string>;
  resume(rpc: RpcClient, sessionId: string, profile?: string): Promise<Record<string, unknown> | undefined>;
  archive(rest: RestClient, session: Session, archived: boolean): Promise<void>;
  delete(rest: RestClient, session: Session): Promise<void>;
  rename(rest: RestClient, session: Session, title: string): Promise<void>;
  /** Update title for a live or durable session id (header + drawer). */
  applyTitle(sessionId: string | undefined, title: string, options?: { force?: boolean }): void;
  togglePin(session: Session): void;
  setPinnedIds(ids: string[]): void;
  setProfileFilter(filter: SessionsProfileFilter): void;
}

function readPinnedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PINNED_SESSIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
  } catch {
    return [];
  }
}

function writePinnedIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PINNED_SESSIONS_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Best-effort local preference only.
  }
}

function sessionIdFromResult(raw: unknown): string {
  if (!raw || typeof raw !== 'object') throw new Error('session.create returned an invalid response.');
  const record = raw as Record<string, unknown>;
  const id = record.session_id ?? record.id;
  if (typeof id !== 'string' || !id) throw new Error('session.create returned no session_id.');
  return id;
}

function sessionMatchesId(session: Session, sessionId: string): boolean {
  return session.id === sessionId || session.lineageRootId === sessionId;
}

const initialPinnedIds = readPinnedIds();
const initialProfileFilter = readSessionsProfileFilter();

export const useSessionsStore = create<SessionsStore>((set, get) => ({
  sessions: [],
  loading: false,
  error: undefined,
  pinnedIds: initialPinnedIds,
  profileFilter: initialProfileFilter,

  async load(rest) {
    set({ loading: true, error: undefined });
    try {
      // Always pull all profiles; UI profileFilter scopes the list.
      const incoming = await rest.profileSessions('all');
      // Keep meaningful local titles when the API still returns serial stubs.
      set((state) => ({
        sessions: mergeSessionsByLineage(state.sessions, incoming ?? []),
        loading: false,
      }));
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load sessions.' });
    }
  },

  async create(rpc, params = {}) {
    set({ loading: true, error: undefined });
    try {
      const result = await rpc.request('session.create', params);
      set({ loading: false });
      return sessionIdFromResult(result);
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to create session.' });
      throw err;
    }
  },

  async resume(rpc, sessionId, profile) {
    set({ loading: true, error: undefined });
    try {
      const params: Record<string, unknown> = { session_id: sessionId };
      if (profile) params.profile = profile;
      const raw = await rpc.request<Record<string, unknown>>('session.resume', params, { timeoutMs: LONG_RPC_TIMEOUT_MS });
      set({ loading: false });
      return raw;
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to resume session.' });
      return undefined;
    }
  },

  async archive(rest, session, archived) {
    set({ error: undefined });
    try {
      await rest.sessionUpdate(session.id, { archived, ...(session.profile ? { profile: session.profile } : {}) });
      const sessions = get().sessions.map((item) => (item.id === session.id ? { ...item, archived } : item));
      set({ sessions });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update session.' });
      throw err;
    }
  },

  async delete(rest, session) {
    set({ error: undefined });
    try {
      await rest.sessionDelete(session.id, session.profile);
      const sessions = get().sessions.filter((item) => item.id !== session.id);
      const pinnedIds = get().pinnedIds.filter((id) => id !== sessionPinId(session) && id !== session.id);
      set({ sessions, pinnedIds });
      writePinnedIds(pinnedIds);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete session.' });
      throw err;
    }
  },

  async rename(rest, session, title) {
    const nextTitle = title.replace(/\s+/g, ' ').trim();
    if (!nextTitle) throw new Error('Title cannot be empty.');
    set({ error: undefined });
    try {
      await rest.sessionUpdate(session.id, {
        title: nextTitle,
        ...(session.profile ? { profile: session.profile } : {}),
      });
      get().applyTitle(session.id, nextTitle, { force: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to rename session.' });
      throw err;
    }
  },

  applyTitle(sessionId, title, options) {
    const nextTitle = title.replace(/\s+/g, ' ').trim();
    if (!sessionId || !nextTitle) return;
    const force = Boolean(options?.force);
    set((state) => {
      let matched = false;
      const sessions = state.sessions.map((item) => {
        if (!sessionMatchesId(item, sessionId)) return item;
        matched = true;
        if (!force && !isPlaceholderSessionTitle(item.title)) return item;
        if (item.title.trim() === nextTitle) return item;
        return { ...item, title: nextTitle, updatedAt: Date.now() };
      });

      if (!matched) {
        return {
          sessions: [
            {
              id: sessionId,
              title: nextTitle,
              updatedAt: Date.now(),
              messageCount: undefined,
              profile: undefined,
            },
            ...sessions,
          ],
        };
      }

      if (force) {
        return {
          sessions: state.sessions.map((item) =>
            sessionMatchesId(item, sessionId) ? { ...item, title: nextTitle, updatedAt: Date.now() } : item,
          ),
        };
      }

      return { sessions };
    });
  },

  togglePin(session) {
    const id = sessionPinId(session);
    const current = get().pinnedIds;
    const pinnedIds = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
    set({ pinnedIds });
    writePinnedIds(pinnedIds);
  },

  setPinnedIds(ids) {
    const pinnedIds = [...new Set(ids.filter(Boolean))];
    set({ pinnedIds });
    writePinnedIds(pinnedIds);
  },

  setProfileFilter(filter) {
    const next = (filter?.trim() || 'all') as SessionsProfileFilter;
    set({ profileFilter: next });
    writeSessionsProfileFilter(next);
  },
}));
