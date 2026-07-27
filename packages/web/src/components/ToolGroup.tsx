import { useEffect, useMemo, useState } from 'react';
import type { RpcClient, ToolCall } from '@hermes-pwa/core';
import { Icon } from './Icon';
import { buildToolView, truncate } from '../lib/toolView';
import { copyToClipboard } from './MessageBubble.helpers';

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
  /** Solo active tool outside the collapsed group — always expanded chrome. */
  standalone?: boolean;
}

export function ToolRow({ tool, rpc: _rpc, streaming, onOpenChange, standalone = false }: ToolRowProps) {
  const view = useMemo(() => buildToolView(tool), [tool]);
  const isPendingTool = view.status === 'running' || tool.output === undefined;
  const isRunning = isPendingTool && (Boolean(streaming) || standalone);
  const hasDetail = Boolean(view.detail && view.detail.trim() && view.detail.trim() !== view.title.trim());
  // Standalone active tool is always open; settled rows start collapsed.
  const [expanded, setExpanded] = useState(standalone || Boolean(isPendingTool && hasDetail));
  const [copied, setCopied] = useState(false);
  const open = standalone ? true : expanded && hasDetail;

  useEffect(() => {
    if (standalone || (isPendingTool && hasDetail)) {
      setExpanded(true);
      onOpenChange?.(tool.id, true);
    }
  }, [standalone, isPendingTool, hasDetail, tool.id, onOpenChange]);

  const toggle = () => {
    if (standalone) return; // active tool stays open
    if (!hasDetail) return;
    const next = !open;
    setExpanded(next);
    onOpenChange?.(tool.id, next);
  };

  const copyDetail = async (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
    if (!view.detail) return;
    const ok = await copyToClipboard(view.detail);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={[
        'hm-tool-group__row',
        isPendingTool || standalone ? 'hm-tool-group__row--running' : 'hm-tool-group__row--done',
        standalone ? 'hm-tool-group__row--standalone' : '',
        open ? 'hm-tool-group__row--open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-hm-tool-standalone={standalone ? '1' : undefined}
      data-hm-tool-active={isRunning ? '1' : undefined}
    >
      <button
        type="button"
        className="hm-tool-group__row-button"
        disabled={standalone || !hasDetail}
        onClick={toggle}
        aria-expanded={hasDetail || standalone ? open : undefined}
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
        {!standalone && hasDetail && (
          <span className={`hm-tool-group__row-chevron${open ? ' hm-tool-group__row-chevron--open' : ''}`} aria-hidden="true">
            <Icon name="chevR" size={12} />
          </span>
        )}
        {standalone && isRunning && (
          <span className="hm-tool-group__row-live-label" aria-hidden="true">live</span>
        )}
      </button>

      {open && hasDetail && view.detail && (
        <div className="hm-tool-group__row-detail">
          <div className="hm-tool-group__row-detail-bar">
            {view.detailLabel && <div className="hm-tool-group__row-detail-label">{view.detailLabel}</div>}
            <button
              type="button"
              className={`hm-tool-group__row-copy${copied ? ' hm-tool-group__row-copy--done' : ''}`}
              onClick={(e) => void copyDetail(e)}
              aria-label={copied ? 'Copied' : 'Copy output'}
              title={copied ? 'Copied' : 'Copy'}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="hm-tool-group__row-output">{view.detail}</pre>
        </div>
      )}
      {/* Approvals dock above composer — no inline approval chrome here. */}
    </div>
  );
}

function groupSummary(tools: ToolCall[]): string {
  const count = tools.length;
  if (count === 0) return 'Tools';
  return count === 1 ? '1 tool' : `${count} tools`;
}

/** Settled/completed tools only — always starts collapsed. */
export function ToolGroup({ tools, rpc, streaming: _streaming }: ToolGroupProps) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [expandedToolId, setExpandedToolId] = useState<string | undefined>();

  if (tools.length === 0) return null;

  const summary = groupSummary(tools);
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
        <span className="hm-tool-group__header-title">{summary}</span>
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
              streaming={false}
              onOpenChange={(toolId, open) => setExpandedToolId(open ? toolId : undefined)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
