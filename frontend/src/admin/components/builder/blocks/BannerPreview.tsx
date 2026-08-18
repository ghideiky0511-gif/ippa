// @ts-nocheck
'use client';

export default function BannerPreview({ section }) {
  const banners = section.banners || [];
  const first = banners[0];
  const style = section.height ? { height: section.height } : undefined;

  if (!first || !first.mediaUrl) {
    return (
      <div className="banner preview-banner preview-empty" style={style}>
        <p>Sem mídia ainda — adicione uma imagem ou vídeo no painel ao lado.</p>
      </div>
    );
  }

  return (
    <div className="banner preview-banner" style={style}>
      {first.type === 'video' ? (
        <video src={first.mediaUrl} muted loop playsInline className="banner-media" />
      ) : (
        <img src={first.mediaUrl} alt={first.title || ''} className="banner-media" />
      )}
      <div className="banner-content">
        {first.title && <h2>{first.title}</h2>}
        {first.subtitle && <p>{first.subtitle}</p>}
      </div>
      {banners.length > 1 && (
        <span className="preview-badge">+{banners.length - 1} no carrossel</span>
      )}
    </div>
  );
}
