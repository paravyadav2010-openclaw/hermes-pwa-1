import { useRef } from 'react';
import { Icon } from './Icon';

interface AttachMenuProps {
  open: boolean;
  onClose: () => void;
  onFiles: (files: FileList | null) => void;
  allowFiles?: boolean;
  onPaste?: () => void;
}

export function AttachMenu({ open, onClose, onFiles, allowFiles = true, onPaste }: AttachMenuProps) {
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
        {onPaste && (
          <button
            type="button"
            className="hm-attach-item"
            role="menuitem"
            onClick={() => {
              onPaste();
              onClose();
            }}
          >
            <span className="hm-attach-item__icon" aria-hidden><Icon name="clipboard" size={18} /></span>
            <span className="hm-attach-item__label">Paste</span>
          </button>
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
