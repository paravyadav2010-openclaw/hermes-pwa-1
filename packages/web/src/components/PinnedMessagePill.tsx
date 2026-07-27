import { Icon } from './Icon';

export interface PinnedMessage {
  id: string;
  preview: string;
}

export function pinnedMessagePreview(text: string): string {
  const plain = text
    .replace(/MEDIA:\/[^\s\n]+/gu, '[media]')
    .replace(/@file:[^\s\n]+/gu, '[file]')
    .replace(/[`*_>#]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!plain) return 'Pinned message';
  return plain.length > 112 ? `${plain.slice(0, 111).trimEnd()}…` : plain;
}

export function PinnedMessagePill({ message, onOpen, onUnpin }: {
  message: PinnedMessage;
  onOpen: () => void;
  onUnpin: () => void;
}) {
  return (
    <div className="hm-pinned-message" role="region" aria-label="Pinned message">
      <button type="button" className="hm-pinned-message__body" onClick={onOpen} aria-label={`Open pinned message: ${message.preview}`}>
        <Icon name="pin" size={14} />
        <span>{message.preview}</span>
      </button>
      <button type="button" className="hm-pinned-message__close" onClick={onUnpin} aria-label="Unpin message" title="Unpin message">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
