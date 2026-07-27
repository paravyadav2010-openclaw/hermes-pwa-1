import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
import { areMessageBubblePropsEqual } from './MessageBubble.helpers';
import { useActivityStore, useChatStore, type Approval, type RpcClient } from '@hermes-pwa/core';

const rpcMock = { request: vi.fn(), onFrame: vi.fn(), events: new EventTarget() } as unknown as RpcClient;

describe('MessageBubble', () => {
  beforeEach(() => {
    useActivityStore.setState({ items: [], loading: false, error: undefined });
    useChatStore.setState({ sessionId: undefined, storedSessionId: undefined, messages: [], streaming: false, error: undefined });
  });

  it('memo comparator skips only unchanged message bubble props', () => {
    const message = { id: 'memo-old', role: 'assistant' as const, text: 'Completed markdown', createdAt: undefined };
    expect(
      areMessageBubblePropsEqual(
        { rpc: rpcMock, message, isLast: false, streaming: true, liveStatus: '', liveFace: undefined },
        { rpc: rpcMock, message, isLast: false, streaming: true, liveStatus: '', liveFace: undefined },
      ),
    ).toBe(true);
    expect(
      areMessageBubblePropsEqual(
        { rpc: rpcMock, message, isLast: false, streaming: true, liveStatus: '', liveFace: undefined },
        { rpc: rpcMock, message: { ...message, text: 'Changed' }, isLast: false, streaming: true, liveStatus: '', liveFace: undefined },
      ),
    ).toBe(false);
    expect(
      areMessageBubblePropsEqual(
        { rpc: rpcMock, message, isLast: true, streaming: true, liveStatus: 'Thinking', liveFace: undefined },
        { rpc: rpcMock, message, isLast: true, streaming: true, liveStatus: 'Calling tool', liveFace: undefined },
      ),
    ).toBe(false);
    expect(
      areMessageBubblePropsEqual(
        { rpc: rpcMock, message, isLast: true, streaming: true, liveStatus: '', liveFace: undefined },
        { rpc: rpcMock, message, isLast: false, streaming: true, liveStatus: '', liveFace: undefined },
      ),
    ).toBe(false);
  });

  it('renders user message', () => {
    render(<MessageBubble rpc={rpcMock} message={{ id: '1', role: 'user', text: 'Hello', createdAt: undefined }} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hello').closest('.hm-message')).toHaveClass('hm-message--reveal');
  });

  it('renders steer messages as centered, labelled low-emphasis transcript events', () => {
    render(<MessageBubble rpc={rpcMock} message={{ id: 'steer-1', role: 'user', text: 'Focus on tests.', createdAt: undefined }} />);

    const message = screen.getByText('Focus on tests.').closest('.hm-message');
    expect(message).toHaveClass('hm-message--steer');
    expect(screen.getByText('Steer message')).toBeInTheDocument();
  });

  it('keeps combined assistant prose under thinking and tools for a multi-row turn', () => {
    const { container } = render(
      <MessageBubble
        rpc={rpcMock}
        message={{
          id: 'a-multi',
          role: 'assistant',
          text: 'Final answer only',
          thinking: 'hidden plan',
          toolCalls: [{ id: 't1', name: 'terminal', input: { command: 'ls' }, output: 'ok' }],
          createdAt: undefined,
        }}
      />,
    );

    const root = container.querySelector('.hm-assistant-turn');
    expect(root).not.toBeNull();
    const actions = root?.querySelector('.hm-message__actions');
    const prose = root?.querySelector('.hm-message__text');
    expect(actions).not.toBeNull();
    expect(prose).not.toBeNull();
    expect(actions!.compareDocumentPosition(prose!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(prose).toHaveTextContent('Final answer only');
    expect(actions!.textContent || '').not.toContain('Final answer only');
  });

  it('renders assistant message with markdown', () => {
    render(<MessageBubble rpc={rpcMock} message={{ id: '2', role: 'assistant', text: '# Title\n\nparagraph', createdAt: undefined }} />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('paragraph')).toBeInTheDocument();
    expect(screen.getByText('Title').closest('.hm-message')).toHaveClass('hm-message--reveal');
  });

  it('shows timestamp and copy control on completed assistant responses', () => {
    const createdAt = new Date('2026-07-25T10:15:00').getTime();
    render(
      <MessageBubble
        rpc={rpcMock}
        streaming={false}
        message={{ id: '2-meta', role: 'assistant', text: 'Ship it', createdAt }}
      />,
    );
    expect(screen.getByRole('button', { name: /Copy response/i })).toBeInTheDocument();
    expect(screen.getByText(/Ship it/)).toBeInTheDocument();
    const time = screen.getByText((_, el) => el?.tagName.toLowerCase() === 'time');
    expect(time).toBeInTheDocument();
  });

  it('hides copy meta while assistant is still streaming', () => {
    render(
      <MessageBubble
        rpc={rpcMock}
        streaming
        isLast
        message={{ id: '2-stream-meta', role: 'assistant', text: 'partial', createdAt: Date.now() }}
      />,
    );
    expect(screen.queryByRole('button', { name: /Copy response/i })).not.toBeInTheDocument();
  });

  it('opens markdown links without opener access', () => {
    render(
      <MessageBubble
        rpc={rpcMock}
        message={{ id: '2-link', role: 'assistant', text: '[Hermes](https://example.com)', createdAt: undefined }}
      />,
    );

    const link = screen.getByRole('link', { name: 'Hermes' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('uses a compact activity indicator instead of streaming/done status text', () => {
    render(<MessageBubble rpc={rpcMock} streaming message={{ id: '2b', role: 'assistant', text: '', createdAt: undefined }} />);
    expect(screen.getByLabelText('Assistant is active')).toBeInTheDocument();
    expect(screen.queryByText(/streaming|done/i)).not.toBeInTheDocument();
  });

  it('renders tool calls as compact individual rows', () => {
    render(
      <MessageBubble
        rpc={rpcMock}
        message={{
          id: '3',
          role: 'assistant',
          text: 'ok',
          createdAt: undefined,
          toolCalls: [{ id: 't1', name: 'search', output: 'results' }],
        }}
      />,
    );
    // Settled tools fold into the collapsible group header.
    const header = screen.getByRole('button', { name: /1 tool/i });
    expect(header).toBeInTheDocument();
    expect(screen.queryByText('Tool actions')).not.toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.getByText(/Search/i)).toBeInTheDocument();
  });

  it('keeps inline approval visible for a pending tool after restore clears streaming', () => {
    useChatStore.setState({ sessionId: 'live-rebound', storedSessionId: 'stored-1', streaming: false });
    useActivityStore.setState({
      items: [
        {
          id: 'approval:rest-key',
          kind: 'approval',
          status: 'needs_you',
          title: 'Approval required',
          highImpact: true,
          sessionId: 'backend-approval-key',
          summary: 'rm -rf /tmp/example\nDangerous command approval required',
          createdAt: Date.now(),
        } as Approval,
      ],
      loading: false,
      error: undefined,
    });

    render(
      <MessageBubble
        rpc={rpcMock}
        message={{
          id: 'approval-msg',
          role: 'assistant',
          text: '',
          createdAt: undefined,
          toolCalls: [{ id: 'tool-1', name: 'terminal', input: { command: 'rm -rf /tmp/example' } }],
        }}
        pendingApprovals={useActivityStore.getState().items as Approval[]}
        activeSessionIds={['live-rebound', 'stored-1']}
      />,
    );

    expect(screen.getByText('Approval required')).toBeInTheDocument();
    expect(screen.getByText('Pending tool wants to run')).toBeInTheDocument();
    expect(screen.getAllByText(/rm -rf \/tmp\/example/).length).toBeGreaterThan(0);
  });

  it('re-renders a stable assistant bubble when a recovered approval prop arrives', () => {
    const message = {
      id: 'approval-msg-stable',
      role: 'assistant' as const,
      text: 'Waiting for approval.',
      createdAt: Date.now(),
    };
    const approval = {
      id: 'approval:late',
      kind: 'approval',
      status: 'needs_you',
      title: 'Approval required',
      highImpact: true,
      sessionId: 'gateway-late',
      summary: 'rm -rf /tmp/late',
      createdAt: Date.now(),
    } as Approval;

    const { rerender } = render(
      <MessageBubble
        rpc={rpcMock}
        isLast
        message={message}
        pendingApprovals={[]}
        activeSessionIds={['live-stable']}
      />,
    );

    expect(screen.queryByText('Pending tool wants to run')).not.toBeInTheDocument();

    useActivityStore.setState({ items: [approval], loading: false, error: undefined });
    rerender(
      <MessageBubble
        rpc={rpcMock}
        isLast
        message={message}
        pendingApprovals={[approval]}
        activeSessionIds={['live-stable']}
      />,
    );

    expect(screen.getByText('Pending tool wants to run')).toBeInTheDocument();
    expect(screen.getAllByText(/rm -rf \/tmp\/late/).length).toBeGreaterThan(0);
  });

  it('reconstructs inline approval from the sole recovered pending approval when REST history has no tool calls', () => {
    useChatStore.setState({ sessionId: 'live-push-open', storedSessionId: 'stored-push-open', streaming: false });
    useActivityStore.setState({
      items: [
        {
          id: 'approval:gateway-key',
          kind: 'approval',
          status: 'needs_you',
          title: 'Approval required',
          highImpact: true,
          sessionId: 'gateway-session-key',
          summary: 'rm -rf /tmp/from-push\nDangerous command approval required',
          createdAt: Date.now(),
        } as Approval,
      ],
      loading: false,
      error: undefined,
    });

    render(
      <MessageBubble
        rpc={rpcMock}
        isLast
        message={{
          id: 'approval-msg',
          role: 'assistant',
          text: 'Waiting for approval.',
          createdAt: undefined,
        }}
        pendingApprovals={useActivityStore.getState().items as Approval[]}
        activeSessionIds={['live-push-open', 'stored-push-open']}
      />,
    );

    expect(screen.getByText('Approval required')).toBeInTheDocument();
    expect(screen.getByText('Pending tool wants to run')).toBeInTheDocument();
    expect(screen.getAllByText(/rm -rf \/tmp\/from-push/).length).toBeGreaterThan(0);
  });

  it('does not reconstruct inline approval when multiple recovered approvals are ambiguous', () => {
    useChatStore.setState({ sessionId: 'live-push-open', storedSessionId: 'stored-push-open', streaming: false });
    useActivityStore.setState({
      items: [
        {
          id: 'approval:one',
          kind: 'approval',
          status: 'needs_you',
          title: 'Approval required',
          highImpact: true,
          sessionId: 'gateway-one',
          summary: 'rm -rf /tmp/one',
          createdAt: 1,
        } as Approval,
        {
          id: 'approval:two',
          kind: 'approval',
          status: 'needs_you',
          title: 'Approval required',
          highImpact: true,
          sessionId: 'gateway-two',
          summary: 'rm -rf /tmp/two',
          createdAt: 2,
        } as Approval,
      ],
      loading: false,
      error: undefined,
    });

    render(
      <MessageBubble
        rpc={rpcMock}
        isLast
        message={{
          id: 'approval-msg',
          role: 'assistant',
          text: 'Waiting for approval.',
          createdAt: undefined,
        }}
        pendingApprovals={useActivityStore.getState().items as Approval[]}
        activeSessionIds={['live-push-open', 'stored-push-open']}
      />,
    );

    expect(screen.queryByText('Pending tool wants to run')).not.toBeInTheDocument();
    expect(screen.queryByText(/rm -rf \/tmp\/one/)).not.toBeInTheDocument();
    expect(screen.queryByText(/rm -rf \/tmp\/two/)).not.toBeInTheDocument();
  });

  it('does not render todo panels from tool.start input', () => {
    const { container } = render(
      <MessageBubble
        rpc={rpcMock}
        message={{
          id: '4',
          role: 'assistant',
          text: '',
          createdAt: undefined,
          toolCalls: [
            {
              id: 'todo-start',
              name: 'todo',
              input: {
                todos: [{ id: 'a', content: 'Partial start state', status: 'in_progress' }],
              },
            },
          ],
        }}
      />,
    );

    expect(container.querySelector('.hm-todo-panel')).toBeNull();
    expect(screen.queryByText('Partial start state')).not.toBeInTheDocument();
  });

  it('renders a completed todo panel inline after the user prompt', () => {
    render(
      <MessageBubble
        rpc={rpcMock}
        message={{
          id: '5',
          role: 'assistant',
          text: 'OK. The last task is not marked in the list.',
          createdAt: undefined,
          toolCalls: [
            {
              id: 'todo-1',
              name: 'todo',
              output: JSON.stringify({
                todos: [{ id: 'a', content: 'Report the approval test result', status: 'in_progress' }],
              }),
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText('Report the approval test result').length).toBeGreaterThan(0);
    expect(screen.getByText('OK. The last task is not marked in the list.')).toBeInTheDocument();
  });

  it('renders only the latest completed todo panel inline', () => {
    const { container } = render(
      <MessageBubble
        rpc={rpcMock}
        message={{
          id: '6',
          role: 'assistant',
          text: '',
          createdAt: undefined,
          toolCalls: [
            {
              id: 'todo-old',
              name: 'todo',
              output: JSON.stringify({ todos: [{ id: 'old', content: 'Old state', status: 'in_progress' }] }),
            },
            {
              id: 'todo-new',
              name: 'todo',
              output: JSON.stringify({ todos: [{ id: 'new', content: 'Current state', status: 'completed' }] }),
            },
          ],
        }}
      />,
    );

    expect(container.querySelectorAll('.hm-todo-panel')).toHaveLength(1);
    expect(screen.queryByText('Old state')).not.toBeInTheDocument();
    expect(screen.getAllByText('Current state').length).toBeGreaterThan(0);
  });

  it('does not resurface a completed todo panel from an old turn', () => {
    render(
      <MessageBubble
        rpc={rpcMock}
        isLast={false}
        message={{
          id: 'old-plan',
          role: 'assistant',
          text: 'Old plan completed.',
          createdAt: undefined,
          toolCalls: [{ id: 'todo-old', name: 'todo', output: JSON.stringify({ todos: [{ id: 'old', content: 'Old task', status: 'completed' }] }) }],
        }}
      />,
    );

    expect(screen.queryByText('Old task')).not.toBeInTheDocument();
  });

  it('keeps ordinary markdown checklists when they are not a todo summary', () => {
    render(
      <MessageBubble
        rpc={rpcMock}
        message={{
          id: '8',
          role: 'assistant',
          text: 'Check manually:\n\n- [x] item stays as regular markdown',
          createdAt: undefined,
        }}
      />,
    );

    expect(screen.getByText('Check manually:')).toBeInTheDocument();
    expect(screen.getByText(/item stays as regular markdown/)).toBeInTheDocument();
  });

  it('renders inline live status with animated activity dots without assistant chrome', () => {
    const { container } = render(
      <MessageBubble
        rpc={rpcMock}
        streaming
        isLast
        liveFace="(¬‿¬)"
        liveStatus="computing"
        message={{ id: '9', role: 'assistant', text: '', createdAt: undefined }}
      />,
    );

    expect(container.querySelector('.hm-message__status-face')).toHaveTextContent('(¬‿¬)');
    expect(container.querySelector('.hm-message__status')).toHaveTextContent('computing');
    expect(container.querySelector('.hm-message__status .hm-message__activity-dots')).toBeInTheDocument();
    expect(container.querySelectorAll('.hm-message__status .hm-message__activity-dots span')).toHaveLength(3);
    expect(container.querySelector('.hm-message__avatar')).toBeNull();
  });
});
