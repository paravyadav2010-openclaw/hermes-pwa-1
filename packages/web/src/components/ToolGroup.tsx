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
  onOpenChange?: (toolId: string, open: boolean) => void;
}

function ToolRow({ tool, rpc, streaming, onOpenChange }: ToolRowProps) {
  const [expanded, setExpanded] = useState(false);
  const view = useMemo(() => buildToolView(tool), [tool]);
  const isPendingTool = view.status === 'running';
  const isRunning = isPendingTool && streaming;
  const hasDetail = Boolean(view.detail && view.detail.trim() && view.detail.trim() !== view.title.trim());
  const open = expanded && hasDetail;
  const toggle = () => {
    if (!hasDetail) return;
    const next = !open;
    setExpanded(next);
    onOpenChange?.(tool.id, next);
  };

  return (
    <div className={`hm-tool-group__row ${isPendingTool ? 'hm-tool-group__row--running' : 'hm-tool-group__row--done'}`}>
      <button
        type="button"
        className="hm-tool-group__row-button"
        disabled={!hasDetail}
        onClick={toggle}
        aria-expanded={hasDetail ? open : undefined}
        title={view.subtitle || view.title}
      >
        <span className="hm-tool-group__row-icon">
          {isRunning ? (
            <span className="hm-tool-group__row-running" aria-label="running" />
          ) : (
            <Icon name={view.icon as import('./Icon').IconName} size={14} />
          )}
        </span>
        <span className="hm-tool-group__row-title">{truncate(view.title, 140)}</span>
        {view.countLabel && <span className="hm-tool-group__row-count">{view.countLabel}</span>}
        {hasDetail && (
          <span className={`hm-tool-group__row-chevron${open ? ' hm-tool-group__row-chevron--open' : ''}`} aria-hidden="true">
            <Icon name="chevR" size={12} />
          </span>
        )}
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

function groupSummary(tools: ToolCall[], streaming?: boolean): string {
  const count = tools.length;
  if (count === 0) return 'Tools';
  if (streaming) {
    const running = tools.filter((t) => t.output === undefined).length;
    if (running > 0) return running === 1 ? 'Running 1 tool' : `Running ${running} tools`;
    return count === 1 ? '1 tool' : `${count} tools`;
  }
  return count === 1 ? '1 tool' : `${count} tools`;
}

export function ToolGroup({ tools, rpc, streaming }: ToolGroupProps) {
  const hasPending = tools.some((t) => t.output === undefined);
  const forceOpen = Boolean(streaming || hasPending);
  const [groupOpen, setGroupOpen] = useState(forceOpen);
  const [expandedToolId, setExpandedToolId] = useState<string | undefined>();

  // Open while the turn streams or any tool still needs attention (e.g. approval).
  // Collapse only when everything is settled.
  useEffect(() => {
    if (forceOpen) {
      setGroupOpen(true);
      return;
    }
    setGroupOpen(false);
  }, [forceOpen]);

  if (tools.length === 0) return null;

  const summary = groupSummary(tools, streaming || hasPending);
  const hasRunning = Boolean((streaming || hasPending) && hasPending);
  const bodyOpen = groupOpen;
  const bounded = tools.length >= 3 && bodyOpen && !expandedToolId;

  return (
    <div
      className={[
        'hm-tool-group',
        bodyOpen ? 'hm-tool-group--open' : 'hm-tool-group--collapsed',
        bounded ? 'hm-tool-group--bounded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="hm-tool-group__header"
        onClick={() => setGroupOpen((v) => !v)}
        aria-expanded={bodyOpen}
      >
        <span className={`hm-tool-group__header-title${hasRunning ? ' hm-tool-group__header-title--live' : ''}`}>
          {summary}
        </span>
        {hasRunning && <span className="hm-tool-group__header-running" aria-label="running" />}
        <span className={`hm-tool-group__chevron${bodyOpen ? ' hm-tool-group__chevron--open' : ''}`} aria-hidden="true">
          <Icon name="chevR" size={12} />
        </span>
      </button>

      {bodyOpen && (
        <div className="hm-tool-group__body">
          {tools.map((tool) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              rpc={rpc}
              streaming={streaming}
              onOpenChange={(toolId, open) => setExpandedToolId(open ? toolId : undefined)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
