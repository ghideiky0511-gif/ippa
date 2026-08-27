// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useDraggable } from '@dnd-kit/core';
import { BLOCK_REGISTRY } from '@/workspace/lib/blockRegistry';

function ToolItem({ block }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `new:${block.type}`,
    data: { type: block.type },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : 'auto' }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className={adminUi.toolItem} {...listeners} {...attributes}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-brand-background text-[10px] font-extrabold tracking-wide text-brand-primary" aria-hidden="true">{block.icon}</span>
      <span>{block.label}</span>
    </div>
  );
}

export default function Toolbox() {
  return (
    <aside className={adminUi.toolbox}>
      <h2 className="text-base font-extrabold text-foreground">Ferramentas</h2>
      <p className="mt-1 text-sm text-muted-foreground">Arraste um bloco para a área de edição.</p>
      <div className={adminUi.toolboxList}>
        {BLOCK_REGISTRY.map((block) => (
          <ToolItem key={block.type} block={block} />
        ))}
      </div>
    </aside>
  );
}
