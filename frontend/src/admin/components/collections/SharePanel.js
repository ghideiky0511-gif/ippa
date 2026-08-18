'use client';

import { useState } from 'react';

export default function SharePanel({ collectionId }) {
  const [copied, setCopied] = useState(false);
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010';
  const link = `${origin}/catalogo?destaque=${encodeURIComponent(collectionId)}`;
  const pdfLink = `${origin}/catalogo/pdf?destaque=${encodeURIComponent(collectionId)}`;

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(`Confira esta coleção: ${link}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  return (
    <div className="share-panel">
      <h2 className="collections-subheading">Compartilhar</h2>
      <p className="preview-hint">Salve a coleção antes de compartilhar — o link mostra o que estiver salvo.</p>
      <div className="share-link-row">
        <input readOnly value={link} onClick={(e) => e.currentTarget.select()} />
        <button className="btn" onClick={copyLink}>
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
      </div>
      <div className="share-actions">
        <button className="btn" onClick={shareWhatsApp}>
          Compartilhar no WhatsApp
        </button>
        <a className="btn" href={pdfLink} target="_blank" rel="noreferrer">
          Exportar PDF
        </a>
      </div>
    </div>
  );
}
