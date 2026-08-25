// @ts-nocheck
'use client';
export default function BannerPreview({ section }) {
  const banners = section.banners || [];
  const first = banners[0];
  const style = section.height ? { height: section.height } : undefined;

  if (!first || !first.mediaUrl) {
    return (
      <div className="contents" style={style}>
        <p>Sem mídia ainda — adicione uma imagem ou vídeo no painel ao lado.</p>
      </div>
    );
  }

  return (
    <div className="contents" style={style}>
      {first.type === 'video' ? (
        <video src={first.mediaUrl} muted loop playsInline className="contents" />
      ) : (
        <img src={first.mediaUrl} alt={first.title || ''} className="contents" />
      )}
      <div className="contents">
        {first.title && <h2>{first.title}</h2>}
        {first.subtitle && <p>{first.subtitle}</p>}
      </div>
      {banners.length > 1 && (
        <span className="contents">+{banners.length - 1} no carrossel</span>
      )}
    </div>
  );
}
