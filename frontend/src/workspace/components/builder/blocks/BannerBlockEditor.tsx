// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
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
      <div className={adminUi.itemCard}>
        <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0"
            checked={!!section.fullBleed}
            onChange={(e) => onUpdate((s) => ({ ...s, fullBleed: e.target.checked }))}
          />
          <span className="min-w-0">Largura total (borda a borda)</span>
        </label>
        <label className={`flex items-start gap-2 text-sm font-semibold ${section.fullBleed ? 'cursor-pointer text-foreground' : 'text-brand-muted'}`}>
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0"
            checked={!!section.fullHeight}
            disabled={!section.fullBleed}
            onChange={(e) => onUpdate((s) => ({ ...s, fullHeight: e.target.checked }))}
          />
          <span className="min-w-0">Altura da tela cheia (hero)</span>
        </label>
        <p className={adminUi.hint}>
          Largura total faz o banner ocupar toda a largura da janela em qualquer
          dispositivo. Com “altura da tela cheia”, ele vira um hero de 100% da
          altura visível.
        </p>
      </div>

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
            type="button"
            className={adminUi.dangerButton}
            onClick={() => removeBanner(b.id)}
            disabled={banners.length <= 1}
          >
            Remover este item
          </button>
        </div>
      ))}
      <button type="button" className={adminUi.button} onClick={addBanner}>+ Adicionar item ao carrossel</button>
    </>
  );
}
