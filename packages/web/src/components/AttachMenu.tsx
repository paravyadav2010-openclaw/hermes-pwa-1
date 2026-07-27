import { useRef } from 'react';
import { Icon } from './Icon';
import { clipboardHistoryPreview } from '../lib/clipboardHistory';

interface AttachMenuProps {
  open: boolean;
  onClose: () => void;
  onFiles: (files: FileList | null) => void;
  allowFiles?: boolean;
  onPasteCurrent?: () => void;
  clipboardHistory?: string[];
  onPasteHistory?: (text: string) => void;
}

export function AttachMenu({ open, onClose, onFiles, allowFiles = true, onPasteCurrent, clipboardHistory = [], onPasteHistory }: AttachMenuProps) {
  const filesInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <>
      <button type="button" className="hm-attach-overlay" onClick={onClose} aria-label="Close attachment menu" />
      <div className="hm-attach-menu" role="menu">
        {allowFiles && (
          <>
            <button
              type="button"
              className="hm-attach-item"
              role="menuitem"
              onClick={() => filesInputRef.current?.click()}
            >
              <span className="hm-attach-item__icon" aria-hidden>📁</span>
              <span className="hm-attach-item__label">File</span>
            </button>
            <button
              type="button"
              className="hm-attach-item"
              role="menuitem"
              onClick={() => photosInputRef.current?.click()}
            >
              <span className="hm-attach-item__icon" aria-hidden><Icon name="photos" size={18} /></span>
              <span className="hm-attach-item__label">Photos</span>
            </button>
            <button
              type="button"
              className="hm-attach-item"
              role="menuitem"
              onClick={() => cameraInputRef.current?.click()}
            >
              <span className="hm-attach-item__icon" aria-hidden><Icon name="camera" size={18} /></span>
              <span className="hm-attach-item__label">Camera</span>
            </button>
          </>
        )}
        {(onPasteCurrent || clipboardHistory.length > 0) && (
          <div className="hm-attach-clipboard">
            <span className="hm-attach-clipboard__heading">Clipboard</span>
            {onPasteCurrent && (
          <button
            type="button"
            className="hm-attach-item"
            role="menuitem"
            onClick={() => {
              onPasteCurrent();
              onClose();
            }}
          >
            <span className="hm-attach-item__icon" aria-hidden><Icon name="clipboard" size={18} /></span>
            <span className="hm-attach-item__label">Paste current</span>
          </button>
            )}
            {clipboardHistory.map((text, index) => (
              <button
                key={`${text}-${index}`}
                type="button"
                className="hm-attach-item hm-attach-item--history"
                role="menuitem"
                aria-label={`Paste recent copy ${index + 1}: ${clipboardHistoryPreview(text)}`}
                onClick={() => {
                  onPasteHistory?.(text);
                  onClose();
                }}
              >
                <span className="hm-attach-item__icon" aria-hidden><Icon name="clipboard" size={18} /></span>
                <span className="hm-attach-item__label hm-attach-item__label--preview">{clipboardHistoryPreview(text)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {allowFiles && (
        <>
          <input
            ref={filesInputRef}
            type="file"
            multiple
            className="hm-composer__file-input"
            onChange={(e) => {
              onFiles(e.target.files);
              onClose();
            }}
          />
          <input
            ref={photosInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hm-composer__file-input"
            onChange={(e) => {
              onFiles(e.target.files);
              onClose();
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hm-composer__file-input"
            onChange={(e) => {
              onFiles(e.target.files);
              onClose();
            }}
          />
        </>
      )}
    </>
  );
}
