import React, { useEffect, useState } from 'react';

/**
 * Infer a usable MIME type when the DB has octet-stream or empty values.
 */
export function inferMimeType(mimeType, fileName) {
  const raw = String(mimeType || '').trim().toLowerCase();
  if (raw && raw !== 'application/octet-stream') return raw;

  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  const byExt = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    heic: 'image/heic',
    heif: 'image/heif',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    html: 'text/html',
    htm: 'text/html',
    log: 'text/plain',
    md: 'text/markdown',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  return byExt[ext] || raw || 'application/octet-stream';
}

export function getPreviewVariant(mimeType, fileName) {
  const mime = inferMimeType(mimeType, fileName);

  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || mime.includes('pdf')) return 'pdf';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'text/markdown'
  ) {
    return 'text';
  }
  if (
    mime.includes('wordprocessing') ||
    mime.includes('spreadsheetml') ||
    mime.includes('presentationml') ||
    mime.includes('msword') ||
    mime.includes('ms-excel') ||
    mime.includes('ms-powerpoint') ||
    mime.includes('officedocument')
  ) {
    return 'office';
  }
  return 'iframe';
}

/**
 * Inline preview for a public share URL (token-based). Supports images, PDF, video, audio, text, generic iframe, + office fallback.
 */
export default function DocumentPreview({ shareUrl, mimeType, fileName }) {
  const [imgError, setImgError] = useState(false);
  const inlineSrc = shareUrl || '';
  const displayName = fileName || 'Document';
  const variant = getPreviewVariant(mimeType, fileName);

  useEffect(() => {
    setImgError(false);
  }, [inlineSrc, mimeType, fileName]);

  const openNewTab = () => {
    window.open(inlineSrc, '_blank', 'noopener,noreferrer');
  };

  if (!inlineSrc) {
    return (
      <div className="document-preview-fallback">
        <p className="muted-cell">No preview URL available.</p>
      </div>
    );
  }

  if (variant === 'image') {
    if (imgError) {
      return (
        <div className="document-preview-fallback">
          <p className="muted-cell">This image could not be displayed in the browser (unsupported format or broken file).</p>
          <button type="button" className="table-action" onClick={openNewTab}>
            Open in new tab
          </button>
        </div>
      );
    }
    return (
      <div className="document-preview-shell document-preview-image">
        <img src={inlineSrc} alt={displayName} onError={() => setImgError(true)} />
      </div>
    );
  }

  if (variant === 'pdf') {
    return <iframe title="Document preview" src={inlineSrc} className="document-preview-iframe" />;
  }

  if (variant === 'video') {
    return (
      <div className="document-preview-shell document-preview-video-wrap">
        <video src={inlineSrc} controls playsInline className="document-preview-video" />
      </div>
    );
  }

  if (variant === 'audio') {
    return (
      <div className="document-preview-shell document-preview-audio-wrap">
        <audio src={inlineSrc} controls className="document-preview-audio" />
      </div>
    );
  }

  if (variant === 'text') {
    return <iframe title="Document preview" src={inlineSrc} className="document-preview-iframe document-preview-text-iframe" />;
  }

  if (variant === 'office') {
    return (
      <div className="document-preview-fallback">
        <p className="muted-cell">
          Word, Excel, or PowerPoint files cannot be previewed inside this window. Open in a new tab (your browser may download the file) or use Download.
        </p>
        <div className="document-preview-fallback-actions">
          <button type="button" className="table-action" onClick={openNewTab}>
            Open in new tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="document-preview-generic">
      <iframe title="Document preview" src={inlineSrc} className="document-preview-iframe" />
      <p className="document-preview-generic-hint muted-cell">
        If the preview is blank, use Open in new tab or Download — some file types need an external app.
      </p>
      <button type="button" className="table-action document-preview-open-tab" onClick={openNewTab}>
        Open in new tab
      </button>
    </div>
  );
}
