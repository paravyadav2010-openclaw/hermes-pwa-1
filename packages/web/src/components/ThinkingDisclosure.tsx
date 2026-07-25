import { useEffect, useState } from 'react';
import { Icon } from './Icon';

interface ThinkingDisclosureProps {
  text: string;
  streaming?: boolean | undefined;
}

export function ThinkingDisclosure({ text, streaming }: ThinkingDisclosureProps) {
  const [open, setOpen] = useState(streaming ?? false);

  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);

  const lineCount = text.split('\n').length;

  return (
    <div className="hm-thinking">
      <button type="button" className="hm-thinking__header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="hm-thinking__icon">
          <Icon name="bolt" size={14} />
        </span>
        <span className="hm-thinking__title">Thinking</span>
        <span className="hm-thinking__lines">{lineCount} lines</span>
        {streaming && <span className="hm-thinking__spinner" aria-label="thinking" />}
        <span className={`hm-thinking__chevron${open ? ' hm-thinking__chevron--open' : ''}`}>
          <Icon name="chevR" size={14} />
        </span>
      </button>
      {open && (
        <pre className="hm-thinking__body">
          <code>{text}</code>
        </pre>
      )}
    </div>
  );
}
