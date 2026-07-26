import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sessionCurrentSourceId,
  sessionHasDifferentCurrentSource,
  sessionProfileKey,
  sessionSourceId,
  sessionSourceLabel,
  sessionSourceSearchTerms,
  useSessionsStore,
  useChatStore,
  useProfilesStore,
  type RpcClient,
  type RestClient,
  type Session,
  type SessionsProfileFilter,
} from '@hermes-pwa/core';
import { Icon } from '../components/Icon';

interface SessionsProps {
  rpc: RpcClient;
  rest: RestClient;
  onSessionOpen: () => void;
}

type Filter = 'all' | 'live' | 'done' | 'archived';
type SourceFilter = 'all' | string;

interface ChipOption {
  key: string;
  label: string;
  count: number;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'done', label: 'Done' },
  { key: 'archived', label: 'Archived' },
];

function fmtAge(updatedAt: number): string {
  const delta = Math.max(0, Date.now() - (updatedAt > 10_000_000_000 ? updatedAt : updatedAt * 1000));
  if (delta < 60_000) return 'now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}

function sessionTitle(s: Session): string {
  return s.title?.trim() || 'Untitled';
}

function sessionSourceKey(session: Pick<Session, 'source' | 'originSource'>): string {
  return sessionSourceId(session) ?? 'unknown';
}

/** Only sources that appear in the current list (active), plus All. */
function buildSourceFilterOptions(sessions: Session[]): ChipOption[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const source = sessionSourceKey(session);
    if (!source || source === 'unknown' || source === 'curator') continue;
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  const sourceOptions = Array.from(counts.entries())
    .map(([key, count]) => ({ key, label: sessionSourceLabel(key) ?? key, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [{ key: 'all', label: 'All sources', count: sessions.length }, ...sourceOptions];
}

function profileDisplayLabel(
  name: string,
  profiles: { name: string; displayName?: string | undefined }[],
): string {
  const hit = profiles.find((p) => p.name === name);
  const label = hit?.displayName?.trim() || name;
  return label === 'default' ? 'default' : label;
}

function buildProfileFilterOptions(
  sessions: Session[],
  profileNames: string[],
  profiles: { name: string; displayName?: string | undefined }[],
): ChipOption[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const key = sessionProfileKey(session);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // Only profiles that currently have sessions.
  const names = new Set<string>([
    ...counts.keys(),
    ...profileNames.filter((name) => (counts.get(name) ?? 0) > 0),
  ]);
  const sorted = Array.from(names).sort((a, b) => {
    if (a === 'default') return -1;
    if (b === 'default') return 1;
    return a.localeCompare(b);
  });
  const options = sorted.map((key) => ({
    key,
    label: profileDisplayLabel(key, profiles),
    count: counts.get(key) ?? 0,
  }));
  return [{ key: 'all', label: 'All profiles', count: sessions.length }, ...options];
}

function sessionSearchText(session: Session): string {
  const source = sessionSourceKey(session);
  const currentSource = sessionCurrentSourceId(session) ?? source;
  return [
    sessionTitle(session),
    session.profile ?? '',
    session.cwd ?? '',
    source,
    currentSource,
    ...sessionSourceSearchTerms(source),
    ...sessionSourceSearchTerms(currentSource),
  ]
    .join(' ')
    .toLowerCase();
}

function StatusDot({ session }: { session: Session }) {
  const isLive = session.isActive || session.active;
  const color = isLive ? 'var(--hm-color-running)' : 'var(--hm-color-text-faint)';
  return (
    <span
      className="hm-session-dot"
      style={{
        background: color,
        animation: isLive ? 'hm-pulse 1.8s infinite' : undefined,
      }}
      aria-hidden="true"
    />
  );
}

function SessionRow({
  session,
  acting,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onSelect,
  onArchiveToggle,
  onDelete,
  onRename,
  onCopyId,
  onPinToggle,
  pinned,
}: {
  session: Session;
  acting?: boolean;
  menuOpen: boolean;
  onOpenMenu: (id: string) => void;
  onCloseMenu: () => void;
  onSelect: (s: Session) => void | Promise<void>;
  onArchiveToggle: (s: Session) => void | Promise<void>;
  onDelete: (s: Session) => void | Promise<void>;
  onRename: (s: Session) => void | Promise<void>;
  onCopyId: (s: Session) => void | Promise<void>;
  onPinToggle: (s: Session) => void;
  pinned: boolean;
}) {
  const source = sessionSourceKey(session);
  const sourceLabel = sessionSourceLabel(source);
  const currentSource = sessionCurrentSourceId(session);
  const currentSourceLabel = currentSource ? sessionSourceLabel(currentSource) ?? currentSource : null;
  const title = sessionTitle(session);
  const metaBits = [
    sourceLabel,
    sessionHasDifferentCurrentSource(session) && currentSourceLabel ? `→${currentSourceLabel}` : null,
    session.profile,
    session.messageCount != null ? `${session.messageCount}` : null,
    fmtAge(session.updatedAt),
  ].filter(Boolean);
  const archiveLabel = session.archived ? 'Restore' : 'Archive';
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(ev: MouseEvent | TouchEvent) {
      const el = menuRef.current;
      if (!el) return;
      if (ev.target instanceof Node && el.contains(ev.target)) return;
      onCloseMenu();
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onCloseMenu();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, onCloseMenu]);

  return (
    <div className={`hm-session-row hm-session-row--compact${menuOpen ? ' hm-session-row--menu-open' : ''}`} data-testid="session-row">
      <button
        type="button"
        className="hm-session-row__open"
        onClick={() => void onSelect(session)}
        aria-label={`Open session: ${title}`}
      >
        <StatusDot session={session} />
        <span className="hm-session-row__body">
          <span className="hm-session-row__title">{title}</span>
          {metaBits.length > 0 && <span className="hm-session-row__meta-inline">{metaBits.join(' · ')}</span>}
        </span>
      </button>

      <div className="hm-session-row__more-wrap" ref={menuRef}>
        <button
          type="button"
          className="hm-session-row__more"
          aria-label={`More actions: ${title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={acting}
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpen) onCloseMenu();
            else onOpenMenu(session.id);
          }}
        >
          <Icon name="more" size={18} />
        </button>
        {menuOpen && (
          <div className="hm-session-menu" role="menu" aria-label={`Actions for ${title}`}>
            <button type="button" role="menuitem" className="hm-session-menu__item" onClick={() => void onRename(session)} disabled={acting}>
              <Icon name="edit" size={15} />
              <span>Rename</span>
            </button>
            <button type="button" role="menuitem" className="hm-session-menu__item" onClick={() => onPinToggle(session)} disabled={acting}>
              <Icon name="sparkle" size={15} />
              <span>{pinned ? 'Unpin' : 'Pin'}</span>
            </button>
            <button type="button" role="menuitem" className="hm-session-menu__item" onClick={() => void onCopyId(session)} disabled={acting}>
              <Icon name="copy" size={15} />
              <span>Copy ID</span>
            </button>
            <button type="button" role="menuitem" className="hm-session-menu__item" onClick={() => void onArchiveToggle(session)} disabled={acting}>
              <Icon name="archive" size={15} />
              <span>{archiveLabel}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="hm-session-menu__item hm-session-menu__item--danger"
              onClick={() => void onDelete(session)}
              disabled={acting}
            >
              <Icon name="trash" size={15} />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sessions({ rpc, rest, onSessionOpen }: SessionsProps) {
  const {
    sessions,
    loading,
    error,
    load,
    archive: archiveSession,
    delete: deleteSession,
    rename: renameSession,
    togglePin,
    pinnedIds,
    profileFilter,
    setProfileFilter,
  } = useSessionsStore();
  const activeName = useProfilesStore((s) => s.activeName);
  const profiles = useProfilesStore((s) => s.profiles);
  const loadProfiles = useProfilesStore((s) => s.load);
  const [filter, setFilter] = useState<Filter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [search, setSearch] = useState('');
  const [actingId, setActingId] = useState<string | undefined>();
  const [menuSessionId, setMenuSessionId] = useState<string | undefined>();

  useEffect(() => {
    void load(rest);
    void loadProfiles(rest);
  }, [rest, load, loadProfiles]);

  // If user never set a Sessions profile filter, prefer active chat profile once known.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stored = '';
    try {
      stored = window.localStorage.getItem('hermes-pwa.sessionsProfileFilter.v1')?.trim() ?? '';
    } catch {
      stored = '';
    }
    if (!stored && activeName && profileFilter === 'all') {
      setProfileFilter(activeName);
    }
  }, [activeName, profileFilter, setProfileFilter]);

  async function handleSelect(session: Session) {
    setMenuSessionId(undefined);
    await useChatStore.getState().resumeSessionIntoChat(rest, rpc, session.id, session.profile ?? activeName);
    onSessionOpen();
  }

  async function handleArchiveToggle(session: Session) {
    setMenuSessionId(undefined);
    const nextArchived = !session.archived;
    if (nextArchived) {
      const confirmed = window.confirm(`Archive session "${sessionTitle(session)}"? It will move to the Archived filter.`);
      if (!confirmed) return;
    }
    setActingId(session.id);
    try {
      await archiveSession(rest, session, nextArchived);
    } finally {
      setActingId(undefined);
    }
  }

  async function handleDelete(session: Session) {
    setMenuSessionId(undefined);
    const confirmed = window.confirm(`Delete session "${sessionTitle(session)}"? This removes it from the session database.`);
    if (!confirmed) return;
    setActingId(session.id);
    try {
      await deleteSession(rest, session);
    } finally {
      setActingId(undefined);
    }
  }

  async function handleRename(session: Session) {
    setMenuSessionId(undefined);
    const next = window.prompt('Rename session', sessionTitle(session));
    if (next == null) return;
    const trimmed = next.replace(/\s+/g, ' ').trim();
    if (!trimmed || trimmed === sessionTitle(session)) return;
    setActingId(session.id);
    try {
      await renameSession(rest, session, trimmed);
    } finally {
      setActingId(undefined);
    }
  }

  async function handleCopyId(session: Session) {
    setMenuSessionId(undefined);
    try {
      await navigator.clipboard.writeText(session.id);
    } catch {
      window.prompt('Session ID', session.id);
    }
  }

  function handlePinToggle(session: Session) {
    setMenuSessionId(undefined);
    togglePin(session);
  }

  const profileNames = useMemo(() => profiles.map((p) => p.name), [profiles]);

  const profileOptions = useMemo(
    () => buildProfileFilterOptions(sessions, profileNames, profiles),
    [sessions, profileNames, profiles],
  );

  const byProfile = useMemo(
    () =>
      profileFilter === 'all'
        ? sessions
        : sessions.filter((s) => sessionProfileKey(s) === profileFilter),
    [sessions, profileFilter],
  );

  const sourceOptions = useMemo(() => buildSourceFilterOptions(byProfile), [byProfile]);

  // Reset source filter if it no longer exists under the selected profile.
  useEffect(() => {
    if (sourceFilter === 'all') return;
    if (!sourceOptions.some((o) => o.key === sourceFilter)) {
      setSourceFilter('all');
    }
  }, [sourceFilter, sourceOptions]);

  const filtered = byProfile
    .filter((s) => {
      if (filter === 'live') return s.isActive || s.active;
      if (filter === 'done') return !s.isActive && !s.active && !s.archived;
      if (filter === 'archived') return s.archived;
      return true;
    })
    .filter((s) => sourceFilter === 'all' || sessionSourceKey(s) === sourceFilter);

  const searched = search.trim()
    ? filtered.filter((s) => sessionSearchText(s).includes(search.toLowerCase()))
    : filtered;

  const live = byProfile.filter((s) => s.isActive || s.active).length;
  const total = byProfile.length;
  const totalMsgs = byProfile.reduce((n, s) => n + (s.messageCount ?? 0), 0);
  const statsLine = [
    `${total} session${total !== 1 ? 's' : ''}`,
    live > 0 ? `${live} live` : '',
    totalMsgs > 0 ? `${totalMsgs} msgs` : '',
    profileFilter !== 'all' ? profileFilter : '',
  ]
    .filter(Boolean)
    .join(' · ');

  function selectProfile(next: SessionsProfileFilter) {
    setProfileFilter(next);
    setSourceFilter('all');
  }

  const showProfileSelect = profileOptions.length > 1;
  const profileSelectValue = profileOptions.some((o) => o.key === profileFilter) ? profileFilter : 'all';
  const sourceSelectValue = sourceOptions.some((o) => o.key === sourceFilter) ? sourceFilter : 'all';
  const showSourceSelect = sourceOptions.length > 1;

  return (
    <div className="hm-sessions">
      <div className="hm-sessions__search-row">
        <input
          className="hm-input hm-sessions__search"
          placeholder="Search sessions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search sessions"
        />
      </div>

      {(showProfileSelect || showSourceSelect) && (
        <div className="hm-sessions__select-row" data-testid="sessions-filter-selects">
          {showProfileSelect && (
            <label className="hm-sessions__select-field">
              <span className="hm-sessions__select-label">Profile</span>
              <select
                className="hm-select hm-sessions__pill-select"
                value={profileSelectValue}
                onChange={(e) => selectProfile(e.target.value)}
                aria-label="Filter by profile"
                data-testid="sessions-profile-select"
              >
                {profileOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                    {option.key === 'all' ? ` (${option.count})` : ` · ${option.count}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {showSourceSelect && (
            <label className="hm-sessions__select-field">
              <span className="hm-sessions__select-label">Source</span>
              <select
                className="hm-select hm-sessions__pill-select"
                value={sourceSelectValue}
                onChange={(e) => setSourceFilter(e.target.value)}
                aria-label="Filter by session source"
                data-testid="sessions-source-select"
              >
                {sourceOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                    {option.key === 'all' ? ` (${option.count})` : ` · ${option.count}`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="hm-sessions__filters" role="tablist" aria-label="Session filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`hm-filter-chip${filter === f.key ? ' hm-filter-chip--active' : ''}`}
            onClick={() => setFilter(f.key)}
            role="tab"
            aria-selected={filter === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

      {total > 0 && <p className="hm-sessions__stats">{statsLine}</p>}

      {error && <div className="hm-warning-banner hm-warning-banner--error">{error}</div>}
      {loading && sessions.length === 0 && <p className="hm-muted hm-loading">Loading…</p>}

      {searched.length === 0 && !loading ? (
        <div className="hm-empty-state">
          <p>{search || profileFilter !== 'all' || sourceFilter !== 'all' ? 'No matching sessions' : 'No sessions yet'}</p>
          <p className="hm-muted">
            {profileFilter !== 'all'
              ? `No sessions for profile “${profileFilter}”. Try All profiles or another profile.`
              : 'Start a chat to create your first session.'}
          </p>
        </div>
      ) : (
        <div className="hm-sessions__list">
          {searched.map((s) => (
            <SessionRow
              key={`${sessionProfileKey(s)}:${s.id}`}
              session={s}
              acting={actingId === s.id}
              menuOpen={menuSessionId === s.id}
              onOpenMenu={setMenuSessionId}
              onCloseMenu={() => setMenuSessionId(undefined)}
              onSelect={handleSelect}
              onArchiveToggle={handleArchiveToggle}
              onDelete={handleDelete}
              onRename={handleRename}
              onCopyId={handleCopyId}
              onPinToggle={handlePinToggle}
              pinned={pinnedIds.includes(s.id) || Boolean(s.lineageRootId && pinnedIds.includes(s.lineageRootId))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
