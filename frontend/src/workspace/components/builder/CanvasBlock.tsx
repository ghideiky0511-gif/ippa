// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useState, memo } from 'react';
import { getBlockDefinition, CANVAS_WIDTH, MIN_SIZE } from '@/workspace/lib/blockRegistry';

const MAX_HEIGHT = 2000;

// Trava o arrastar/redimensionar numa grade de 20px — fica mais previsível
// (evita "quase alinhado") e ajuda a montar um layout mais parecido com
// grade de verdade, tipo o oficina.com, em vez de pixel solto.
const GRID = 20;
function snap(value) {
  return Math.round(value / GRID) * GRID;
}

function summarize(section, products) {
  if (section.type === 'banner') {
    const count = section.banners?.length || 0;
    return `Banner — ${count} ${count === 1 ? 'item' : 'itens'}`;
  }
  if (section.type === 'product') {
    const product = (products || []).find((p) => p.id === section.productId);
    return product ? `Produto — ${product.name}` : 'Produto — nenhum selecionado';
  }
  return section.type;
}

function CanvasBlock({ section, products, selected, onSelect, onRemove, onMove, onResize }) {
  const def = getBlockDefinition(section.type);
  const Preview = def?.Preview;
  const baseX = section.x || 0;
  const baseY = section.y || 0;
  const baseWidth = section.width || 280;
  const baseHeight = section.height || 300;

  // Enquanto o gesto de arrastar/redimensionar está rolando, a posição só
  // vive aqui (estado local do próprio bloco) — só grava no estado da
  // lista de sections (BuilderApp) quando solta o botão. Escrever lá a
  // cada pixel forçava recalcular/re-renderizar TODOS os blocos a cada
  // movimento do mouse, que era o que deixava a área de edição travando.
  const [live, setLive] = useState(null);

  const x = live?.x ?? baseX;
  const y = live?.y ?? baseY;
  const width = live?.width ?? baseWidth;
  const height = live?.height ?? baseHeight;

  function handleMoveStart(e) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let finalX = baseX;
    let finalY = baseY;

    function onPointerMove(ev) {
      // Trava dentro do canvas (0 até CANVAS_WIDTH - largura do bloco) —
      // além dessa borda é a área da toolbox, que não é a página de
      // verdade, então não faz sentido soltar um bloco lá.
      const rawX = snap(baseX + (ev.clientX - startX));
      const rawY = snap(baseY + (ev.clientY - startY));
      finalX = Math.min(CANVAS_WIDTH - baseWidth, Math.max(0, rawX));
      finalY = Math.max(0, rawY);
      setLive({ x: finalX, y: finalY });
    }
    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      onMove(section.id, finalX, finalY);
      setLive(null);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function handleResizeStart(e, axis) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let finalWidth = baseWidth;
    let finalHeight = baseHeight;

    function onPointerMove(ev) {
      if (axis === 'w' || axis === 'both') {
        // Não deixa esticar pra além da borda direita do canvas (onde
        // começa a área da toolbox).
        const maxWidth = CANVAS_WIDTH - baseX;
        finalWidth = Math.min(maxWidth, Math.max(MIN_SIZE, snap(baseWidth + (ev.clientX - startX))));
      }
      if (axis === 'h' || axis === 'both') {
        finalHeight = Math.min(MAX_HEIGHT, Math.max(MIN_SIZE, snap(baseHeight + (ev.clientY - startY))));
      }
      setLive({ width: finalWidth, height: finalHeight });
    }
    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      onResize(section.id, finalWidth, finalHeight);
      setLive(null);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  return (
    <div
      style={{ position: 'absolute', left: x, top: y, width, height, zIndex: selected || live ? 5 : 1 }}
      className={[adminUi.blockCard, selected ? 'border-brand-primary shadow-[0_4px_16px_rgba(24,24,27,.18)]' : '', live ? 'opacity-90 shadow-[0_8px_24px_rgba(0,0,0,.18)]' : ''].join(' ')}
      onClick={() => onSelect(section.id)}
    >
      <div className={adminUi.blockHeader}>
        <span className={adminUi.blockHandle} onPointerDown={handleMoveStart} title="Arraste pra mover">
          ⠿
        </span>
        <span className={adminUi.blockLabel}>{summarize(section, products)}</span>
        <button
          className={adminUi.iconButton}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(section.id);
          }}
        >
          Excluir
        </button>
      </div>
      <div className={adminUi.blockPreview}>{Preview && <Preview section={section} products={products} />}</div>

      <div className={adminUi.resizeH} onPointerDown={(e) => handleResizeStart(e, 'h')} title="Redimensionar altura">
        <span />
      </div>
      <div className={adminUi.resizeW} onPointerDown={(e) => handleResizeStart(e, 'w')} title="Redimensionar largura" />
      <div className={adminUi.resizeCorner} onPointerDown={(e) => handleResizeStart(e, 'both')} title="Redimensionar" />
    </div>
  );
}

export default memo(CanvasBlock);
