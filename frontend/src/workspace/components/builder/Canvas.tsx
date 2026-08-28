// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useDroppable } from '@dnd-kit/core';
import CanvasBlock from './CanvasBlock';
import { STARTER_TEMPLATE } from '@/workspace/lib/blockRegistry';
import { HOME_CANVAS_WIDTH, canvasHeightFor } from '@/lib/homeLayout';

const MIN_CANVAS_HEIGHT = 600;
const BOTTOM_PADDING = 160;

export default function Canvas({
  sections,
  products,
  device = 'desktop',
  selectedId,
  onSelect,
  onRemoveSection,
  onMoveSection,
  onResizeSection,
  onUseTemplate,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' });

  const canvasWidth = HOME_CANVAS_WIDTH[device];
  const canvasHeight = sections.length
    ? canvasHeightFor(sections, device, MIN_CANVAS_HEIGHT, BOTTOM_PADDING)
    : MIN_CANVAS_HEIGHT;

  return (
    <main className={adminUi.canvasWrap}>
      <p className={`${adminUi.hint} mb-3`}>
        Arraste um bloco pra mover; pelas bordas, pra redimensionar. Nada se move sozinho quando você mexe
        em outro bloco. Cada modo de visualização (desktop, tablet, celular) tem seu próprio layout.
      </p>

      <div
        ref={setNodeRef}
        className={[adminUi.canvas, isOver ? 'outline-2 outline-dashed outline-brand-primary outline-offset-[-2px]' : ''].join(' ')}
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        {sections.length === 0 && (
          <div className={adminUi.emptyCanvas}>
            <p>Arraste uma ferramenta aqui pra começar a montar a home.</p>
            <button type="button" className={adminUi.button} onClick={() => onUseTemplate(STARTER_TEMPLATE)}>
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
            device={device}
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
