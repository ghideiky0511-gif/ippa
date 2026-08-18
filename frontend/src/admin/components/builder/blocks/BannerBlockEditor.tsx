// @ts-nocheck
'use client';
import { adminUi } from '@/admin/lib/ui';
function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function BannerBlockEditor({ section, onUpdate }) {
  const banners = section.banners || [];

  function updateBanner(id, changes) {
    onUpdate((s) => ({
      ...s,
      banners: s.banners.map((b) => (b.id === id ? { ...b, ...changes } : b)),
    }));
  }

  function removeBanner(id) {
    onUpdate((s) => ({ ...s, banners: s.banners.filter((b) => b.id !== id) }));
  }

  function addBanner() {
    onUpdate((s) => ({
      ...s,
      banners: [...s.banners, { id: newId(), type: 'image', mediaUrl: '', title: '', subtitle: '' }],
    }));
  }

  return (
    <>
      {banners.map((b) => (
        <div key={b.id} className={adminUi.itemCard}>
          <div className={adminUi.field}>
            <label>Tipo</label>
            <select value={b.type} onChange={(e) => updateBanner(b.id, { type: e.target.value })}>
              <option value="image">Imagem</option>
              <option value="video">Vídeo</option>
            </select>
          </div>
          <div className={adminUi.field}>
            <label>URL da mídia</label>
            <input
              value={b.mediaUrl}
              onChange={(e) => updateBanner(b.id, { mediaUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className={adminUi.fieldRow}>
            <div className={adminUi.field}>
              <label>Título</label>
              <input value={b.title || ''} onChange={(e) => updateBanner(b.id, { title: e.target.value })} />
            </div>
            <div className={adminUi.field}>
              <label>Subtítulo</label>
              <input value={b.subtitle || ''} onChange={(e) => updateBanner(b.id, { subtitle: e.target.value })} />
            </div>
          </div>
          <button
            className={adminUi.dangerButton}
            onClick={() => removeBanner(b.id)}
            disabled={banners.length <= 1}
          >
            Remover este item
          </button>
        </div>
      ))}
      <button className={adminUi.button} onClick={addBanner}>+ Adicionar item ao carrossel</button>
    </>
  );
}
