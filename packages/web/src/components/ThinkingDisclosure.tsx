import { useEffect, useState } from 'react';
import { Icon } from './Icon';

interface ThinkingDisclosureProps {
  text: string;
  streaming?: boolean | undefined;
  label?: string | undefined;
}

export function ThinkingDisclosure({ text, streaming, label = 'Thinking' }: ThinkingDisclosureProps) {
  // Open while streaming; collapse when the turn finishes (same pattern as Tool actions).
  const [open, setOpen] = useState(Boolean(streaming));

  useEffect(() => {
    if (streaming) {
      setOpen(true);
      return;
    }
    setOpen(false);
  }, [streaming]);

  const lineCount = text.split('\n').filter((l) => l.length > 0).length || 1;

  return (
    <div className={`hm-thinking${open ? ' hm-thinking--open' : ' hm-thinking--collapsed'}`}>
      <button type="button" className="hm-thinking__header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="hm-thinking__icon">
          <Icon name="bolt" size={14} />
        </span>
        <span className="hm-thinking__title">{label}</span>
        <span className="hm-thinking__lines">{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
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
