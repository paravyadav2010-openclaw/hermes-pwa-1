import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelOptions, ReasoningEffort, RpcClient, RestClient } from '@hermes-pwa/core';
import { Icon } from '../components/Icon';

const REASONING_EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

function effortShort(effort: ReasoningEffort | undefined): string {
  switch (effort) {
    case 'none': return 'None';
    case 'minimal': return 'Min';
    case 'low': return 'Low';
    case 'medium': return 'Med';
    case 'high': return 'High';
    case 'xhigh': return 'XHigh';
    default: return 'Effort';
  }
}

function effortLabel(effort: ReasoningEffort): string {
  if (effort === 'xhigh') return 'Extra high';
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function ContextRing({ used, limit, onClick }: { used: number; limit: number; onClick: () => void }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const radius = 14;
  const circ = 2 * Math.PI * radius;
  const fill = Math.max(0, circ * (1 - pct / 100));
  const color = pct >= 90 ? '#dc4b46' : pct >= 70 ? '#c2790f' : '#2540ff';

  return (
    <button type="button" className="hm-context-ring" onClick={onClick} aria-label="Context usage">
      <span className="hm-context-ring__hit">
      <svg width={34} height={34} viewBox="0 0 34 34">
        <circle cx={17} cy={17} r={radius} fill="none" stroke="var(--hm-color-border)" strokeWidth={3} />
        <circle cx={17} cy={17} r={radius} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={Math.max(0, circ * (1 - pct / 100))}
          strokeLinecap="round" transform="rotate(-90, 17, 17)"
          style={{ transition: 'stroke-dashoffset 0.3s, stroke 0.3s' }}
        />
      </svg>
      </span>
      <span className="hm-context-ring__pct">{pct}</span>
    </button>
  );
}

type Dropdown = 'profile' | 'model' | 'effort' | 'context' | null;

interface ProfileModelBarProps {
  profiles: { name: string; displayName?: string; model?: string; provider?: string }[];
  activeName: string | undefined;
  messages: { text: string; thinking?: string; toolCalls?: { input?: string; output?: string }[] }[];
  rpc: RpcClient | null;
  sessionId: string | undefined;
  rest: RestClient;
  onModelChange: (provider: string, model: string) => void;
  onEffortChange?: (effort: ReasoningEffort) => void;
  reasoningEffort?: ReasoningEffort;
  modelLabel: string;
  providerLabel: string;
}

// Rough token estimate from message text
function estimateTokens(messages: { text: string; thinking?: string; toolCalls?: { input?: string; output?: string }[] }[]): number {
  const charsPerToken = 3; // realistic for mixed text + code
  const msgOverhead = 100; // JSON envelope + role + metadata
  let total = 0;
  for (const m of messages) {
    let raw = m.text + (m.thinking ?? '');
    // Include tool call input/output text
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        raw += (tc.input ?? '') + (tc.output ?? '');
      }
    }
    total += Math.round(raw.length / charsPerToken);
    total += msgOverhead;
  }
  return total;
}

export function ProfileModelBar({
  profiles, activeName, messages, rpc, sessionId, rest, onModelChange,
  onEffortChange, reasoningEffort, modelLabel, providerLabel,
}: ProfileModelBarProps) {
  const [dropdown, setDropdown] = useState<Dropdown>(null);
  const [modelOptions, setModelOptions] = useState<ModelOptions | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [forceTick, setForceTick] = useState(0);
  const [localEffort, setLocalEffort] = useState<ReasoningEffort | undefined>(reasoningEffort);
  const active = profiles.find((p) => p.name === activeName);
  const profileLabel = active?.displayName ?? activeName ?? 'default';
  const summary = providerLabel ? `${providerLabel} · ${modelLabel}` : modelLabel;
  const barRef = useRef<HTMLDivElement>(null);
  const [contextLimit, setContextLimit] = useState(1_000_000);

  // Keep bar label in sync when profile/prop changes; selection updates local first.
  useEffect(() => {
    setLocalEffort(reasoningEffort);
  }, [reasoningEffort, activeName]);

  const displayEffort = localEffort ?? reasoningEffort;

  // Fetch the context limit once from the current profile's model info
  useEffect(() => {
    async function fetchLimit() {
      try {
        const info = await rest.modelInfo();
        const win = info.capabilities?.context_window;
        if (typeof win === 'number' && win > 0) setContextLimit(win);
      } catch { /* ignore */ }
    }
    void fetchLimit();
  }, [rest, modelLabel]);

  // Close on outside tap
  useEffect(() => {
    if (!dropdown) return;
    function onClick(e: MouseEvent | TouchEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setDropdown(null);
    }
    document.addEventListener('mousedown', onClick, { passive: true });
    document.addEventListener('touchstart', onClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('touchstart', onClick);
    };
  }, [dropdown]);

  // Fetch model options when model dropdown opens
  useEffect(() => {
    if (dropdown !== 'model') { setModelOptions(null); setSelectedProvider(null); return; }
    rest.modelOptions().then(setModelOptions).catch(() => setModelOptions({ providers: [] }));
  }, [dropdown, rest]);

  // Live polling: recalculate every 3s so the display updates during streaming
  useEffect(() => {
    const interval = setInterval(() => setForceTick((t) => t + 1), 3000);
    return () => clearInterval(interval);
  }, []);

  // Try to get real context from session.status once when sessionId changes
  const [rpcContext, setRpcContext] = useState<{ used: number; limit: number } | null>(null);
  useEffect(() => {
    if (!rpc || !sessionId) { setRpcContext(null); return; }
    let cancelled = false;
    async function fetchCtx() {
      try {
        const result = await rpc.request<Record<string, unknown>>('session.status', { session_id: sessionId });
        if (cancelled) return;
        const ctxTokens = typeof result.context_tokens === 'number' ? result.context_tokens
          : typeof result.contextTokens === 'number' ? result.contextTokens
          : typeof result.usage === 'object' && result.usage
            ? (result.usage as Record<string, unknown>).total_tokens
            : undefined;
        const rawLimit = typeof result.context_limit === 'number' ? result.context_limit
          : typeof result.contextLimit === 'number' ? result.contextLimit
          : undefined;
        const ctxLimit = (typeof rawLimit === 'number' && rawLimit > 0) ? rawLimit : contextLimit;
        if (typeof ctxTokens === 'number' && ctxTokens >= 0) {
          setRpcContext({ used: ctxTokens, limit: ctxLimit });
        }
      } catch { /* silent */ }
    }
    void fetchCtx();
    const interval = setInterval(fetchCtx, 2_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [rpc, sessionId, contextLimit]);

  const estimated = useMemo(() => estimateTokens(messages), [messages, forceTick]);

  const used = (rpcContext?.used ?? estimated) + (forceTick * 0);
  const limit = rpcContext?.limit ?? contextLimit;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isReal = rpcContext !== null;

  async function switchProfile(name: string) {
    try { await rest.profileActivate(name); setDropdown(null); } catch { /* ignore */ }
  }

  function handleProviderSelect(provider: string) {
    setSelectedProvider(provider);
  }

  function handleModelSelect(model: string) {
    const provider = selectedProvider ?? (providerLabel || 'default');
    onModelChange(provider, model);
    setDropdown(null);
    setSelectedProvider(null);
  }

  function handleEffortSelect(effort: ReasoningEffort) {
    setLocalEffort(effort);
    onEffortChange?.(effort);
    setDropdown(null);
  }

  return (
    <div className="hm-profile-bar-wrap" ref={barRef}>
      <div className="hm-profile-bar">
        <button type="button" className="hm-profile-bar__item" onClick={() => setDropdown(dropdown === 'profile' ? null : 'profile')}>
          <Icon name="profiles" size={14} />
          <span className="hm-profile-bar__label">{profileLabel}</span>
          <Icon name="chevD" size={10} />
        </button>

        <button type="button" className="hm-profile-bar__item hm-profile-bar__item--model" onClick={() => setDropdown(dropdown === 'model' ? null : 'model')}>
          <Icon name="sparkle" size={14} />
          <span className="hm-profile-bar__label hm-profile-bar__label--trim">{summary}</span>
          <Icon name="chevD" size={10} />
        </button>

        <button
          type="button"
          className="hm-profile-bar__item hm-profile-bar__item--effort"
          onClick={() => setDropdown(dropdown === 'effort' ? null : 'effort')}
          aria-label="Reasoning effort"
        >
          <Icon name="bolt" size={14} />
          <span className="hm-profile-bar__label">{effortShort(displayEffort)}</span>
          <Icon name="chevD" size={10} />
        </button>

        <div className="hm-profile-bar__spacer" />
        <ContextRing used={used} limit={limit} onClick={() => setDropdown(dropdown === 'context' ? null : 'context')} />
      </div>

      {dropdown === 'profile' && (
        <div className="hm-profile-dropdown hm-profile-dropdown--up">
          {profiles.length === 0 && <div className="hm-profile-dropdown__empty">No profiles</div>}
          {profiles.map((p) => (
            <button key={p.name} className={`hm-profile-dropdown__item${p.name === activeName ? ' hm-profile-dropdown__item--active' : ''}`}
              onClick={() => void switchProfile(p.name)}>
              <span className="hm-profile-dropdown__name">{p.displayName ?? p.name}</span>
              {p.model && <span className="hm-profile-dropdown__meta">{p.provider ?? ''} · {p.model}</span>}
            </button>
          ))}
        </div>
      )}

      {dropdown === 'model' && (
        <div className="hm-profile-dropdown hm-profile-dropdown--up">
          {!modelOptions ? (
            <div className="hm-profile-dropdown__empty">Loading providers…</div>
          ) : selectedProvider === null ? (
            modelOptions.providers.length === 0 ? (
              <div className="hm-profile-dropdown__empty">No providers configured.</div>
            ) : (
              modelOptions.providers.map((prov) => (
                <button key={prov.slug} className="hm-profile-dropdown__item" onClick={() => handleProviderSelect(prov.slug)}>
                  <span className="hm-profile-dropdown__name">{prov.name}</span>
                  <span className="hm-profile-dropdown__meta">{prov.models.length} models{prov.authenticated ? ' · ✅' : ''}</span>
                </button>
              ))
            )
          ) : (
            <>
              <button className="hm-profile-dropdown__back" onClick={() => setSelectedProvider(null)}>
                <Icon name="chevR" size={12} /> Back to providers
              </button>
              {(() => {
                const prov = modelOptions.providers.find((p) => p.slug === selectedProvider);
                const models = prov?.models ?? [];
                return models.length === 0 ? (
                  <div className="hm-profile-dropdown__empty">No models for {selectedProvider}</div>
                ) : (
                  models.map((m) => (
                    <button key={m} className="hm-profile-dropdown__item" onClick={() => handleModelSelect(m)}>
                      <span className="hm-profile-dropdown__name">{m}</span>
                    </button>
                  ))
                );
              })()}
            </>
          )}
        </div>
      )}

      {dropdown === 'effort' && (
        <div className="hm-profile-dropdown hm-profile-dropdown--up">
          {REASONING_EFFORTS.map((effort) => (
            <button
              key={effort}
              type="button"
              className={`hm-profile-dropdown__item${displayEffort === effort ? ' hm-profile-dropdown__item--active' : ''}`}
              onClick={() => handleEffortSelect(effort)}
            >
              <span className="hm-profile-dropdown__name">{effortLabel(effort)}</span>
              <span className="hm-profile-dropdown__meta">{effortShort(effort)}</span>
            </button>
          ))}
        </div>
      )}

      {dropdown === 'context' && (
        <div className="hm-context-popover hm-profile-dropdown--up">
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Model</span>
            <span className="hm-context-popover__value">{modelLabel}</span>
          </div>
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Provider</span>
            <span className="hm-context-popover__value">{providerLabel || modelLabel.split(' ')[0] || '—'}</span>
          </div>
          <div className="hm-context-popover__divider" />
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Used</span>
            <span className="hm-context-popover__value">{fmtTokens(used)} tokens</span>
          </div>
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Limit</span>
            <span className="hm-context-popover__value">{fmtTokens(limit)} tokens</span>
          </div>
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Usage</span>
            <span className="hm-context-popover__value" style={{ color: pct >= 90 ? '#dc4b46' : pct >= 70 ? '#c2790f' : '#2540ff' }}>{pct}%</span>
          </div>
          {isReal ? (
            <div className="hm-context-popover__footnote">Live from gateway · every 2s</div>
          ) : (
            <div className="hm-context-popover__footnote">Live: every 3s · estimated from message text</div>
          )}
        </div>
      )}
    </div>
  );
}
