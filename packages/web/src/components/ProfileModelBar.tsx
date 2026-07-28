import { useEffect, useRef, useState } from 'react';
import type { ModelOptions, ReasoningEffort, RpcClient, RestClient } from '@hermes-pwa/core';
import { useProfilesStore } from '@hermes-pwa/core';
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

function ContextRing({ used, limit, onClick }: { used: number | null; limit: number | null; onClick: () => void }) {
  const pct = used !== null && limit !== null && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const radius = 14;
  const circ = 2 * Math.PI * radius;
  const color = pct !== null && pct >= 90 ? '#dc4b46' : pct !== null && pct >= 70 ? '#c2790f' : '#2540ff';

  return (
    <button type="button" className="hm-context-ring" onClick={onClick} aria-label="Context usage">
      <span className="hm-context-ring__hit">
      <svg width={34} height={34} viewBox="0 0 34 34">
        <circle cx={17} cy={17} r={radius} fill="none" stroke="var(--hm-color-border)" strokeWidth={3} />
        <circle cx={17} cy={17} r={radius} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={pct === null ? circ : Math.max(0, circ * (1 - pct / 100))}
          strokeLinecap="round" transform="rotate(-90, 17, 17)"
          style={{ transition: 'stroke-dashoffset 0.3s, stroke 0.3s' }}
        />
      </svg>
      </span>
      <span className="hm-context-ring__pct">{pct ?? '—'}</span>
    </button>
  );
}

type Dropdown = 'profile' | 'model' | 'effort' | 'context' | null;
type ModelSwitchState =
  | { kind: 'idle' }
  | { kind: 'pending'; detail: string }
  | { kind: 'success'; detail: string }
  | { kind: 'error'; detail: string };

type LiveSessionStatus = {
  used: number | null;
  limit: number | null;
  input: number;
  output: number;
  total: number;
  calls: number;
  running: boolean;
  model: string;
  provider: string;
  reasoningEffort: string;
  profileName: string;
};

interface ProfileModelBarProps {
  profiles: { name: string; displayName?: string; model?: string; provider?: string }[];
  activeName: string | undefined;
  currentName: string | undefined;
  rpc: RpcClient | null;
  sessionId: string | undefined;
  rest: RestClient;
  onModelChange: (provider: string, model: string) => void | Promise<void>;
  onEffortChange?: (effort: ReasoningEffort) => void | Promise<void>;
  reasoningEffort?: ReasoningEffort | undefined;
  modelLabel: string;
  providerLabel: string;

}

export function ProfileModelBar({
  profiles, activeName, currentName, rpc, sessionId, rest, onModelChange,
  onEffortChange, reasoningEffort, modelLabel, providerLabel,
}: ProfileModelBarProps) {
  const [dropdown, setDropdown] = useState<Dropdown>(null);
  const [modelOptions, setModelOptions] = useState<ModelOptions | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [localEffort, setLocalEffort] = useState<ReasoningEffort | undefined>(reasoningEffort);
  const barRef = useRef<HTMLDivElement>(null);
  const switchSequenceRef = useRef(0);
  const [contextLimit, setContextLimit] = useState(1_000_000);
  const [switchState, setSwitchState] = useState<ModelSwitchState>({ kind: 'idle' });
  const [rpcContext, setRpcContext] = useState<LiveSessionStatus | null>(null);

  // Keep bar label in sync when profile/prop changes; selection updates local first.
  useEffect(() => {
    setLocalEffort(reasoningEffort);
  }, [reasoningEffort, activeName]);

  const liveEffort = REASONING_EFFORTS.includes(rpcContext?.reasoningEffort as ReasoningEffort)
    ? rpcContext?.reasoningEffort as ReasoningEffort
    : undefined;
  const displayEffort = liveEffort ?? (sessionId && rpcContext ? undefined : localEffort ?? reasoningEffort);
  const liveProfileName = rpcContext?.profileName || (sessionId ? currentName : activeName);
  const liveProfile = profiles.find((p) => p.name === liveProfileName);
  const profileLabel = liveProfile?.displayName ?? liveProfileName ?? 'default';
  const displayModel = rpcContext?.model || modelLabel;
  const displayProvider = rpcContext?.provider || providerLabel;
  const summary = displayProvider ? `${displayProvider} · ${displayModel}` : displayModel;

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


  // Try to get real context from session.status once when sessionId changes
  useEffect(() => {
    if (!rpc || !sessionId) { setRpcContext(null); return; }
    const client: RpcClient = rpc;
    let cancelled = false;
    async function fetchCtx() {
      try {
        const result = await client.request<Record<string, unknown>>('session.status', { session_id: sessionId });
        if (cancelled) return;
        const numberValue = (key: string) => typeof result[key] === 'number' ? result[key] as number : 0;
        const ctxTokens = typeof result.context_tokens === 'number' ? result.context_tokens
          : typeof result.contextTokens === 'number' ? result.contextTokens
          : typeof result.usage === 'object' && result.usage
            ? (result.usage as Record<string, unknown>).total_tokens
            : undefined;
        const rawLimit = typeof result.context_limit === 'number' ? result.context_limit
          : typeof result.contextLimit === 'number' ? result.contextLimit
          : undefined;
        const ctxLimit = (typeof rawLimit === 'number' && rawLimit > 0) ? rawLimit : null;
        setRpcContext({
            used: typeof ctxTokens === 'number' && ctxTokens > 0 ? ctxTokens : null,
            limit: ctxLimit,
            input: numberValue('input_tokens'),
            output: numberValue('output_tokens'),
            total: numberValue('total_tokens'),
            calls: numberValue('calls'),
            running: result.running === true,
            model: typeof result.model === 'string' ? result.model : modelLabel,
            provider: typeof result.provider === 'string' ? result.provider : providerLabel,
            reasoningEffort: typeof result.reasoning_effort === 'string' ? result.reasoning_effort : '',
            profileName: typeof result.profile_name === 'string' ? result.profile_name : '',
          });
      } catch { /* silent */ }
    }
    void fetchCtx();
    const interval = setInterval(fetchCtx, 2_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [rpc, sessionId, contextLimit]);

  const used = rpcContext?.used ?? null;
  const limit = rpcContext?.limit ?? (sessionId ? null : contextLimit);
  const pct = used !== null && limit !== null && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const isReal = rpcContext?.used !== null;

  async function switchProfile(name: string) {
    try {
      await rest.profileActivate(name);
      // Update the profiles store so activeName (and the label) react immediately.
      const store = useProfilesStore.getState();
      const profiles = store.profiles.map((p) => ({ ...p, isActive: p.name === name }));
      useProfilesStore.setState({ profiles, activeName: name });
      setDropdown(null);
      // A profile contains identity, skills, tools, and workspace as well as a
      // model. Do not silently attach an existing live agent to a different
      // profile; the selected profile is used by the next new chat instead.
      setSwitchState({ kind: 'success', detail: `Profile selected: ${name}. Start a new chat to use it.` });
    } catch { /* ignore */ }
  }

  function handleProviderSelect(provider: string) {
    setSelectedProvider(provider);
  }

  async function handleModelSelect(model: string) {
    const provider = selectedProvider ?? (providerLabel || 'default');
    try {
      await onModelChange(provider, model);
    } catch (error) {
      const detail = error instanceof Error && error.message ? error.message : 'The profile update was rejected.';
      setSwitchState({ kind: 'error', detail: `Model unchanged: ${detail}` });
      return;
    }
    setDropdown(null);
    setSelectedProvider(null);
    if (!sessionId) {
      setSwitchState({ kind: 'success', detail: 'Default updated. Start a session to use it.' });
      return;
    }

    const sequence = switchSequenceRef.current + 1;
    switchSequenceRef.current = sequence;
    setSwitchState({ kind: 'pending', detail: `Switching to ${model}…` });
    try {
      await rest.sessionSwitchModel({ sessionId, model, modelProvider: provider });
      if (switchSequenceRef.current === sequence) {
        setSwitchState({ kind: 'success', detail: `Current session: ${provider} · ${model}` });
      }
    } catch (error) {
      if (switchSequenceRef.current === sequence) {
        const msg = error instanceof Error && error.message ? error.message : '';
        // Session expired on the gateway — the profile default was already
        // updated above; surface a gentle reminder instead of an error.
        if (msg.includes('not found') || msg.includes('not live')) {
          setSwitchState({ kind: 'success', detail: `Default updated: ${provider} · ${model}. Start a new chat to use it.` });
        } else {
          setSwitchState({ kind: 'error', detail: `Model unchanged: ${msg || 'The gateway rejected the model switch.'}` });
        }
      }
    }
  }

  async function handleEffortSelect(effort: ReasoningEffort) {
    setLocalEffort(effort);
    setDropdown(null);
    setSwitchState({ kind: 'pending', detail: `Setting reasoning effort to ${effortLabel(effort)}…` });
    try {
      await onEffortChange?.(effort);
      setSwitchState({ kind: 'success', detail: `Applied. Confirming current session reasoning…` });
    } catch (error) {
      setLocalEffort(liveEffort ?? reasoningEffort);
      const detail = error instanceof Error && error.message ? error.message : 'The gateway rejected the reasoning update.';
      setSwitchState({ kind: 'error', detail: `Reasoning unchanged: ${detail}` });
    }
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
      {switchState.kind !== 'idle' && (
        <div className={`hm-profile-bar__switch-status hm-profile-bar__switch-status--${switchState.kind}`} role="status" aria-live="polite">
          {switchState.detail}
        </div>
      )}

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
              onClick={() => void handleEffortSelect(effort)}
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
            <span className="hm-context-popover__label">Profile</span>
            <span className="hm-context-popover__value">{profileLabel}</span>
          </div>
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Model</span>
            <span className="hm-context-popover__value">{displayModel}</span>
          </div>
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Provider</span>
            <span className="hm-context-popover__value">{displayProvider || '—'}</span>
          </div>
          <div className="hm-context-popover__divider" />
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Used</span>
            <span className="hm-context-popover__value">{used === null ? 'Unavailable' : `${fmtTokens(used)} tokens`}</span>
          </div>
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Limit</span>
            <span className="hm-context-popover__value">{limit === null ? 'Unavailable' : `${fmtTokens(limit)} tokens`}</span>
          </div>
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Usage</span>
            <span className="hm-context-popover__value" style={{ color: pct !== null && pct >= 90 ? '#dc4b46' : pct !== null && pct >= 70 ? '#c2790f' : '#2540ff' }}>{pct === null ? 'Waiting for measured prompt' : `${pct}%`}</span>
          </div>
          {rpcContext && (
            <>
              <div className="hm-context-popover__row">
                <span className="hm-context-popover__label">Input / output</span>
                <span className="hm-context-popover__value">{fmtTokens(rpcContext.input)} / {fmtTokens(rpcContext.output)}</span>
              </div>
              <div className="hm-context-popover__row">
                <span className="hm-context-popover__label">Calls</span>
                <span className="hm-context-popover__value">{rpcContext.calls} · {rpcContext.running ? 'Running' : 'Idle'}</span>
              </div>
              {rpcContext.reasoningEffort && (
                <div className="hm-context-popover__row">
                  <span className="hm-context-popover__label">Reasoning</span>
                  <span className="hm-context-popover__value">{effortLabel(rpcContext.reasoningEffort as ReasoningEffort)}</span>
                </div>
              )}
            </>
          )}
          <div className="hm-context-popover__divider" />
          <div className="hm-context-popover__row">
            <span className="hm-context-popover__label">Model switch</span>
            <span className="hm-context-popover__value">{switchState.kind === 'idle' ? 'Ready' : switchState.detail}</span>
          </div>
          {isReal ? (
            <div className="hm-context-popover__footnote">Live from gateway · every 2s</div>
          ) : (
            <div className="hm-context-popover__footnote">Awaiting a measured gateway context value</div>
          )}
        </div>
      )}
    </div>
  );
}
