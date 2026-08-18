'use client';

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
        <div key={b.id} className="item-card">
          <div className="field">
            <label>Tipo</label>
            <select value={b.type} onChange={(e) => updateBanner(b.id, { type: e.target.value })}>
              <option value="image">Imagem</option>
              <option value="video">Vídeo</option>
            </select>
          </div>
          <div className="field">
            <label>URL da mídia</label>
            <input
              value={b.mediaUrl}
              onChange={(e) => updateBanner(b.id, { mediaUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Título</label>
              <input value={b.title || ''} onChange={(e) => updateBanner(b.id, { title: e.target.value })} />
            </div>
            <div className="field">
              <label>Subtítulo</label>
              <input value={b.subtitle || ''} onChange={(e) => updateBanner(b.id, { subtitle: e.target.value })} />
            </div>
          </div>
          <button
            className="btn btn-danger"
            onClick={() => removeBanner(b.id)}
            disabled={banners.length <= 1}
          >
            Remover este item
          </button>
        </div>
      ))}
      <button className="btn" onClick={addBanner}>+ Adicionar item ao carrossel</button>
    </>
  );
}
