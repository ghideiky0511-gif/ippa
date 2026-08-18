// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useDroppable } from '@dnd-kit/core';
import CanvasBlock from './CanvasBlock';
import { STARTER_TEMPLATE } from '@/workspace/lib/blockRegistry';

const MIN_CANVAS_HEIGHT = 600;
const BOTTOM_PADDING = 160;

export default function Canvas({
  sections,
  products,
  selectedId,
  onSelect,
  onRemoveSection,
  onMoveSection,
  onResizeSection,
  onUseTemplate,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' });

  const canvasHeight = sections.length
    ? Math.max(MIN_CANVAS_HEIGHT, ...sections.map((s) => (s.y || 0) + (s.height || 300) + BOTTOM_PADDING))
    : MIN_CANVAS_HEIGHT;

  return (
    <main className={adminUi.canvasWrap}>
      <p className={adminUi.hint}>
        Arraste um bloco pra mover; pelas bordas, pra redimensionar. Nada se move sozinho quando você mexe
        em outro bloco.
      </p>

      <div
        ref={setNodeRef}
        className={[adminUi.canvas, isOver ? 'outline-2 outline-dashed outline-brand-primary outline-offset-[-2px]' : ''].join(' ')}
        style={{ height: canvasHeight }}
      >
        {sections.length === 0 && (
          <div className={adminUi.emptyCanvas}>
            <p>Arraste uma ferramenta aqui pra começar a montar a home.</p>
            <button className={adminUi.button} onClick={() => onUseTemplate(STARTER_TEMPLATE)}>
              Usar modelo inicial
            </button>
          </div>
        )}

        {/* onSelect/onRemoveSection/onMoveSection/onResizeSection são
           passados direto (mesma referência pra todo mundo, sem criar uma
           closure nova por bloco) — é isso que deixa o React.memo de
           CanvasBlock funcionar de verdade e não re-renderizar os blocos
           parados enquanto um só está sendo arrastado. */}
        {sections.map((section) => (
          <CanvasBlock
            key={section.id}
            section={section}
            products={products}
            selected={selectedId === section.id}
            onSelect={onSelect}
            onRemove={onRemoveSection}
            onMove={onMoveSection}
            onResize={onResizeSection}
          />
        ))}
      </div>
    </main>
  );
}
