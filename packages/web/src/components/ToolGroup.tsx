import { useMemo, useState } from 'react';
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
  // Desktop parity: only expand when there is real detail beyond the title line.
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
          <span className={`hm-tool-group__row-chevron${open ? ' hm-tool-group__row-chevron--open' : ''}`}>
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

export function ToolGroup({ tools, rpc, streaming }: ToolGroupProps) {
  const [expandedToolId, setExpandedToolId] = useState<string | undefined>();

  return (
    <div className={`hm-tool-group${tools.length >= 3 && !expandedToolId ? ' hm-tool-group--bounded' : ''}`}>
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
  );
}
