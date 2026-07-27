import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MARKDOWN_COMPONENTS } from './MessageBubble.helpers';
import { Icon } from './Icon';

interface ThinkingDisclosureProps {
  text: string;
  streaming?: boolean | undefined;
  label?: string | undefined;
}

export function ThinkingDisclosure({ text, streaming, label = 'Thinking' }: ThinkingDisclosureProps) {
  const cleaned = text.trim();
  // Desktop drops empty reasoning blocks entirely — no blank "Thinking" row.
  if (!cleaned) return null;

  // Open while streaming; collapse when the turn finishes.
  const [open, setOpen] = useState(Boolean(streaming));

  useEffect(() => {
    if (streaming) {
      setOpen(true);
      return;
    }
    setOpen(false);
  }, [streaming]);

  return (
    <div className={`hm-thinking${open ? ' hm-thinking--open' : ' hm-thinking--collapsed'}`}>
      <button type="button" className="hm-thinking__header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`hm-thinking__title${streaming ? ' hm-thinking__title--streaming' : ''}`}>{label}</span>
        {streaming && <span className="hm-thinking__spinner" aria-label="thinking" />}
        <span className={`hm-thinking__chevron${open ? ' hm-thinking__chevron--open' : ''}`} aria-hidden="true">
          <Icon name="chevR" size={12} />
        </span>
      </button>
      {open && (
        <div className="hm-thinking__body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{cleaned}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
