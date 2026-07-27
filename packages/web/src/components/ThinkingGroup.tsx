import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MARKDOWN_COMPONENTS } from './MessageBubble.helpers';
import { Icon } from './Icon';

interface ThinkingGroupProps {
  /** Settled thinking parts to keep inside the collapsible group. */
  parts: string[];
  /** While the turn is still streaming (group stays available; usually collapsed for settled parts). */
  streaming?: boolean | undefined;
}

function summaryLabel(count: number): string {
  if (count <= 0) return 'Thinking';
  if (count === 1) return 'Thinking';
  return `${count} thoughts`;
}

function ThinkingPartRow({
  text,
  index,
  total,
  defaultOpen = false,
}: {
  text: string;
  index: number;
  total: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const label = total > 1 ? `Thought ${index + 1}` : 'Thought';

  return (
    <div className={`hm-thinking-group__row${open ? ' hm-thinking-group__row--open' : ''}`}>
      <button
        type="button"
        className="hm-thinking-group__row-button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="hm-thinking-group__row-title">{label}</span>
        <span className={`hm-thinking-group__row-chevron${open ? ' hm-thinking-group__row-chevron--open' : ''}`} aria-hidden="true">
          <Icon name="chevR" size={12} />
        </span>
      </button>
      {open && (
        <div className="hm-thinking-group__row-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/**
 * Finished thinking — always collapsed, inside a group.
 * Settled thoughts never open on their own; the user expands them.
 */
export function ThinkingGroup({ parts, streaming: _streaming }: ThinkingGroupProps) {
  const cleaned = parts.map((p) => p.trim()).filter(Boolean);
  const [groupOpen, setGroupOpen] = useState(false);

  if (cleaned.length === 0) return null;

  const summary = summaryLabel(cleaned.length);

  return (
    <div className={`hm-thinking-group${groupOpen ? ' hm-thinking-group--open' : ' hm-thinking-group--collapsed'}`}>
      <button
        type="button"
        className="hm-thinking-group__header"
        onClick={() => setGroupOpen((v) => !v)}
        aria-expanded={groupOpen}
      >
        <span className="hm-thinking-group__header-title">{summary}</span>
        <span className={`hm-thinking-group__chevron${groupOpen ? ' hm-thinking-group__chevron--open' : ''}`} aria-hidden="true">
          <Icon name="chevR" size={12} />
        </span>
      </button>

      {groupOpen && (
        <div className="hm-thinking-group__body">
          {cleaned.map((part, idx) => (
            <ThinkingPartRow
              key={`thought-${idx}`}
              text={part}
              index={idx}
              total={cleaned.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Live thinking stream — sits OUTSIDE the collapsible group while active.
 * Always expanded while streaming; folds into ThinkingGroup when settled.
 */
export function LiveThinking({ text }: { text: string }) {
  const cleaned = text.trim();
  if (!cleaned) return null;
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Keep the live body scrolled to the latest tokens
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [cleaned]);

  return (
    <div className="hm-thinking hm-thinking--live hm-thinking--open" data-hm-thinking-live="1">
      <div className="hm-thinking__header hm-thinking__header--static" aria-live="polite">
        <span className="hm-thinking__title hm-thinking__title--streaming">Thinking</span>
        <span className="hm-thinking__spinner" aria-label="thinking" />
      </div>
      <div ref={bodyRef} className="hm-thinking__body hm-thinking__body--live">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{cleaned}</ReactMarkdown>
      </div>
    </div>
  );
}
