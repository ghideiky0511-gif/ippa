// @ts-nocheck
'use client';
import BlockCtaBadge from './BlockCtaBadge';

export default function BannerPreview({ section }) {
  const banners = section.banners || [];
  const first = banners[0];

  if (!first || !first.mediaUrl) {
    return (
      <div className="relative flex size-full min-h-[120px] items-center justify-center bg-brand-background p-4 text-center text-sm text-muted-foreground">
        <p>Sem mídia ainda — adicione uma imagem ou vídeo no painel ao lado.</p>
        <BlockCtaBadge cta={section.cta} />
      </div>
    );
  }

  return (
    <article className="relative size-full min-h-[120px] overflow-hidden bg-brand-background">
      {first.type === 'video' ? (
        <video src={first.mediaUrl} muted loop playsInline className="size-full object-cover" />
      ) : (
        // A mídia do banner aceita URLs externas configuráveis; `next/image`
        // exigiria liberar cada origem no build e impediria essa prévia.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.mediaUrl} alt={first.title || ''} className="size-full object-cover" />
      )}
      {(first.title || first.subtitle) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pt-12 pb-4 text-white">
          {first.title && <h2 className="text-lg font-extrabold">{first.title}</h2>}
          {first.subtitle && <p className="mt-1 text-sm text-white/85">{first.subtitle}</p>}
        </div>
      )}
      {banners.length > 1 && (
        <span className="absolute top-3 right-3 rounded-full bg-black/65 px-2 py-1 text-xs font-semibold text-white">+{banners.length - 1} no carrossel</span>
      )}
      <BlockCtaBadge cta={section.cta} />
    </article>
  );
}
