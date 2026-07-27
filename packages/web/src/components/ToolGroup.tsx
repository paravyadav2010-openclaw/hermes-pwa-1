import { useEffect, useMemo, useState } from 'react';
import type { RpcClient, ToolCall } from '@hermes-pwa/core';
import { Icon } from './Icon';
import { ApprovalInline } from './ApprovalInline';
import { buildToolView, truncate } from '../lib/toolView';

interface ToolGroupProps {
  tools: ToolCall[];
  rpc: RpcClient;
  streaming?: boolean | undefined;
}

interface ToolRowProps {
  tool: ToolCall;
  rpc: RpcClient;
  streaming?: boolean | undefined;
  /** When group is collapsed, force rows closed. */
  forceCollapsed?: boolean;
}

function ToolRow({ tool, rpc, streaming, forceCollapsed }: ToolRowProps) {
  const [expanded, setExpanded] = useState(false);
  const view = useMemo(() => buildToolView(tool), [tool]);
  const isPendingTool = view.status === 'running';
  const isRunning = isPendingTool && streaming;
  const open = !forceCollapsed && expanded;

  return (
    <div className={`hm-tool-group__row ${isPendingTool ? 'hm-tool-group__row--running' : 'hm-tool-group__row--done'}`}>
      <button
        type="button"
        className="hm-tool-group__row-button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={open}
      >
        <span className="hm-tool-group__row-icon">
          <Icon name={view.icon as import('./Icon').IconName} size={14} />
        </span>
        <span className="hm-tool-group__row-title">{view.title}</span>
        {view.subtitle && (
          <>
            <span className="hm-tool-group__row-dot">·</span>
            <span className="hm-tool-group__row-target">{truncate(view.subtitle, 90)}</span>
          </>
        )}
        {isRunning && <span className="hm-tool-group__row-running" aria-label="running" />}
        {view.countLabel && <span className="hm-tool-group__row-count">{view.countLabel}</span>}
        <span className={`hm-tool-group__row-chevron${open ? ' hm-tool-group__row-chevron--open' : ''}`}>
          <Icon name="chevR" size={12} />
        </span>
      </button>

      {open && view.detail && (
        <div className="hm-tool-group__row-detail">
          {view.detailLabel && <div className="hm-tool-group__row-detail-label">{view.detailLabel}</div>}
          <pre className="hm-tool-group__row-output">{view.detail}</pre>
        </div>
      )}
      {isPendingTool && <ApprovalInline rpc={rpc} tool={tool} />}
    </div>
  );
}

export function ToolGroup({ tools, rpc, streaming }: ToolGroupProps) {
  const runningCount = tools.filter((t) => t.output === undefined).length;
  const hasRunning = runningCount > 0;
  const stateLabel = hasRunning ? 'running' : 'done';

  // Historical tool groups start collapsed, but a pending tool must reveal its
  // inline approval controls even after a recovery has cleared `streaming`.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasRunning) setOpen(true);
  }, [hasRunning]);

  const preview = useMemo(() => {
    if (tools.length === 0) return '';
    const first = buildToolView(tools[0]!);
    if (tools.length === 1) return first.title;
    return `${first.title} +${tools.length - 1}`;
  }, [tools]);

  return (
    <div className={`hm-tool-group${open ? ' hm-tool-group--open' : ' hm-tool-group--collapsed'}`}>
      <button
        type="button"
        className="hm-tool-group__header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="hm-tool-group__header-icon">
          <Icon name="settings" size={12} />
        </span>
        <span className="hm-tool-group__header-title">Tool actions</span>
        <span className="hm-tool-group__header-meta">
          {tools.length} {tools.length === 1 ? 'step' : 'steps'} · {stateLabel}
          {!open && preview ? ` · ${preview}` : ''}
        </span>
        {hasRunning && <span className="hm-tool-group__header-running" aria-label="running" />}
        <span className={`hm-tool-group__chevron${open ? ' hm-tool-group__chevron--open' : ''}`}>
          <Icon name="chevR" size={14} />
        </span>
      </button>

      {open && (
        <div className="hm-tool-group__body">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} rpc={rpc} streaming={streaming} />
          ))}
        </div>
      )}
    </div>
  );
}
