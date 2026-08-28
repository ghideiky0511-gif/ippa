// @ts-nocheck
'use client';

// Prévia (não clicável) do hiperlink que a loja configura no painel de
// edição — mostra no canto inferior direito do bloco exatamente onde ele
// vai aparecer no catálogo público (ver HomeApp.tsx). Só renderiza quando
// a loja marcou o checkbox e escreveu um texto.
export default function BlockCtaBadge({ cta }) {
  if (!cta?.enabled || !cta.label) return null;
  return (
    <span className="pointer-events-none absolute right-2 bottom-2 z-10 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 truncate rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white shadow">
      <span className="truncate">{cta.label}</span>
      <span aria-hidden="true">→</span>
    </span>
  );
}
