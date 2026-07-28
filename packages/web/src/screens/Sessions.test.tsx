import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Sessions } from './Sessions';
import { useSessionsStore, useChatStore, useProfilesStore, makeRpcEvents, type Session } from '@hermes-pwa/core';

function session(overrides: Partial<Session> & Pick<Session, 'id' | 'title'>): Session {
  return {
    updatedAt: Date.now(),
    messageCount: undefined,
    profile: undefined,
    ...overrides,
  };
}

const rpcMock = {
  request: vi.fn().mockResolvedValue([]),
  onFrame: vi.fn(),
  events: makeRpcEvents(),
} as unknown as import('@hermes-pwa/core').RpcClient;

const restMock = {
  profileSessions: vi.fn().mockResolvedValue([]),
  sessionMessages: vi.fn().mockResolvedValue({ messages: [] }),
  sessionUpdate: vi.fn().mockResolvedValue({ ok: true }),
  sessionDelete: vi.fn().mockResolvedValue({ ok: true }),
  setActiveProfile: vi.fn(),
  profileList: vi.fn().mockResolvedValue([
    { name: 'default', displayName: 'default', isActive: true },
    { name: 'nuke', displayName: 'nuke', isActive: false },
    { name: 'bax', displayName: 'bax', isActive: false },
  ]),
  profileActive: vi.fn().mockResolvedValue({ active: 'default', current: 'default' }),
} as unknown as import('@hermes-pwa/core').RestClient;

describe('Sessions screen', () => {
  beforeEach(() => {
    useSessionsStore.setState({ sessions: [], loading: false, error: undefined, pinnedIds: [], profileFilter: 'all' });
    useProfilesStore.setState({
      activeName: 'default',
      currentName: 'default',
      profiles: [
        { name: 'default', displayName: 'default', isActive: true },
        { name: 'nuke', displayName: 'nuke', isActive: false },
        { name: 'bax', displayName: 'bax', isActive: false },
      ],
      loading: false,
      error: undefined,
    });
    try {
      window.localStorage.setItem('hermes-pwa.sessionsProfileFilter.v1', 'all');
    } catch {
      // ignore
    }
    vi.clearAllMocks();
    vi.mocked(restMock.profileSessions).mockResolvedValue([]);
    vi.mocked(restMock.sessionUpdate).mockResolvedValue({ ok: true });
    vi.mocked(restMock.sessionDelete).mockResolvedValue({ ok: true });
  });

  it('shows empty state when no sessions', async () => {
    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument());
  });

  it('renders session rows', async () => {
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({ id: 'sess-1', title: 'Test session', messageCount: 5, profile: 'default' }),
    ]);
    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Test session')).toBeInTheDocument());
    expect(screen.getAllByText(/5 msgs/).length).toBeGreaterThan(0);
  });

  it('keeps search and filters in the sessions control layer', async () => {
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({ id: 'sess-1', title: 'Canvas session', messageCount: 5, profile: 'default' }),
    ]);
    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Canvas session')).toBeInTheDocument());
    const controls = screen.getByTestId('sessions-controls');
    expect(controls).toContainElement(screen.getByRole('textbox', { name: /Search sessions/i }));
    expect(controls).toContainElement(screen.getByRole('tablist', { name: /Session filters/i }));
  });

  it('shows stats row', async () => {
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({ id: 'sess-1', title: 'Session 1' }),
      session({ id: 'sess-2', title: 'Session 2' }),
    ]);
    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/2 sessions/i)).toBeInTheDocument());
  });

  it('filters live sessions', async () => {
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({ id: 'live-1', title: 'Live session', isActive: true }),
      session({ id: 'done-1', title: 'Done session', isActive: false }),
    ]);
    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Live session')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Live' }));
    expect(screen.getByText('Live session')).toBeInTheDocument();
    expect(screen.queryByText('Done session')).not.toBeInTheDocument();
  });

  it('filters sessions by local source', async () => {
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({
        id: 'cli-1',
        title: 'CLI thread',
        source: 'cli',
        originSource: 'cli',
        currentSource: 'cli',
        profile: 'default',
      }),
      session({ id: 'tui-1', title: 'Terminal thread', source: 'tui', originSource: 'tui', currentSource: 'tui', profile: 'default' }),
      session({
        id: 'mixed-1',
        title: 'Mixed local',
        source: 'tui',
        originSource: 'cli',
        currentSource: 'tui',
        profile: 'default',
      }),
    ]);
    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('CLI thread')).toBeInTheDocument());
    expect(screen.getByText('Terminal thread')).toBeInTheDocument();
    expect(screen.getByText('Mixed local')).toBeInTheDocument();
    // Compact meta uses →TUI when current source differs from origin.
    expect(screen.getByText(/→TUI/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'tui' } });
    expect(screen.getByText('Terminal thread')).toBeInTheDocument();
    expect(screen.getByText('Mixed local')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: '' } });

    const sourceSelect = screen.getByTestId('sessions-source-select') as HTMLSelectElement;
    expect(sourceSelect.options[0]?.textContent).toBe('All sources');
    fireEvent.change(sourceSelect, { target: { value: 'cli' } });
    expect(screen.getByText('CLI thread')).toBeInTheDocument();
    expect(screen.getByText('Mixed local')).toBeInTheDocument();
    expect(screen.queryByText('Terminal thread')).not.toBeInTheDocument();

    fireEvent.change(sourceSelect, { target: { value: 'tui' } });
    expect(screen.getByText('Terminal thread')).toBeInTheDocument();
    expect(screen.queryByText('CLI thread')).not.toBeInTheDocument();
    expect(screen.queryByText('Mixed local')).not.toBeInTheDocument();
  });

  it('filters sessions by profile dropdown', async () => {
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({ id: 'd1', title: 'Default work', profile: 'default', source: 'tui' }),
      session({ id: 'n1', title: 'Nuke work', profile: 'nuke', source: 'telegram' }),
      session({ id: 'b1', title: 'Bax work', profile: 'bax', source: 'cli' }),
    ]);
    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Default work')).toBeInTheDocument());
    expect(screen.getByText('Nuke work')).toBeInTheDocument();
    expect(screen.getByText('Bax work')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('sessions-profile-select'), { target: { value: 'nuke' } });
    expect(screen.getByText('Nuke work')).toBeInTheDocument();
    expect(screen.queryByText('Default work')).not.toBeInTheDocument();
    expect(screen.queryByText('Bax work')).not.toBeInTheDocument();

    const sourceSelect = screen.getByTestId('sessions-source-select') as HTMLSelectElement;
    // Only active sources for the filtered profile — Telegram only (+ All).
    expect(Array.from(sourceSelect.options).map((o) => o.value)).toEqual(['all', 'telegram']);
  });

  it('searches by title', async () => {
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({ id: 's-1', title: 'Bug investigation' }),
      session({ id: 's-2', title: 'Feature planning' }),
    ]);
    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Bug investigation')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'Bug' } });
    expect(screen.getByText('Bug investigation')).toBeInTheDocument();
    expect(screen.queryByText('Feature planning')).not.toBeInTheDocument();
  });

  it('awaits resume with selected session profile before opening chat', async () => {
    const onOpen = vi.fn();
    let resolveResume!: () => void;
    const resumePromise = new Promise<void>((resolve) => {
      resolveResume = resolve;
    });
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({ id: 'sess-1', title: 'Test session', profile: 'research' }),
    ]);
    const resume = vi.spyOn(useChatStore.getState(), 'resumeSessionIntoChat').mockReturnValue(resumePromise);

    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={onOpen} />);
    await waitFor(() => expect(screen.getByTestId('session-row')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Open session: Test session/i }));

    expect(resume).toHaveBeenCalledWith(restMock, rpcMock, 'sess-1', 'research');
    expect(onOpen).not.toHaveBeenCalled();

    resolveResume();
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
  });

  it('starts a fresh chat from the floating action', async () => {
    const onOpen = vi.fn();
    const startNewSession = vi.spyOn(useChatStore.getState(), 'startNewSession');
    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={onOpen} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /New chat/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /New chat/i }));

    expect(startNewSession).toHaveBeenCalledWith('default');
    expect(onOpen).toHaveBeenCalledOnce();
    startNewSession.mockRestore();
  });

  it('archives and restores a session through backend patch', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({ id: 'sess-1', title: 'Old session', profile: 'default', archived: false }),
    ]);

    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Old session')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /More actions: Old session/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Archive$/i }));

    await waitFor(() => expect(restMock.sessionUpdate).toHaveBeenCalledWith('sess-1', { archived: true, profile: 'default' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    expect(screen.getByText('Old session')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /More actions: Old session/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Restore$/i }));
    await waitFor(() => expect(restMock.sessionUpdate).toHaveBeenLastCalledWith('sess-1', { archived: false, profile: 'default' }));
    confirm.mockRestore();
  });

  it('deletes a session after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(restMock.profileSessions).mockResolvedValue([
      session({ id: 'sess-1', title: 'Trash me', profile: 'default' }),
    ]);

    render(<Sessions rpc={rpcMock} rest={restMock} onSessionOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Trash me')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /More actions: Trash me/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete$/i }));

    await waitFor(() => expect(restMock.sessionDelete).toHaveBeenCalledWith('sess-1', 'default'));
    expect(screen.queryByText('Trash me')).not.toBeInTheDocument();
    confirm.mockRestore();
  });
});
