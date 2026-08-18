'use client';

import { useState, memo } from 'react';
import { getBlockDefinition, CANVAS_WIDTH, MIN_SIZE } from '@/admin/lib/blockRegistry';

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
      className={`block-card${selected ? ' selected' : ''}${live ? ' interacting' : ''}`}
      onClick={() => onSelect(section.id)}
    >
      <div className="block-card-header">
        <span className="block-card-handle" onPointerDown={handleMoveStart} title="Arraste pra mover">
          ⠿
        </span>
        <span className="block-card-label">{summarize(section, products)}</span>
        <button
          className="btn btn-icon btn-danger"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(section.id);
          }}
        >
          Excluir
        </button>
      </div>
      <div className="block-card-preview">{Preview && <Preview section={section} products={products} />}</div>

      <div className="block-resize-handle-h" onPointerDown={(e) => handleResizeStart(e, 'h')} title="Redimensionar altura">
        <span />
      </div>
      <div className="block-resize-handle-w" onPointerDown={(e) => handleResizeStart(e, 'w')} title="Redimensionar largura" />
      <div className="block-resize-handle-corner" onPointerDown={(e) => handleResizeStart(e, 'both')} title="Redimensionar" />
    </div>
  );
}

export default memo(CanvasBlock);
