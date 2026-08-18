// @ts-nocheck
'use client';

import { useDraggable } from '@dnd-kit/core';
import { BLOCK_REGISTRY } from '@/admin/lib/blockRegistry';

function ToolItem({ block }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `new:${block.type}`,
    data: { type: block.type },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : 'auto' }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className="tool-item" {...listeners} {...attributes}>
      <span className="tool-icon">{block.icon}</span>
      <span className="tool-label">{block.label}</span>
    </div>
  );
}

export default function Toolbox() {
  return (
    <aside className="builder-toolbox">
      <h2>Ferramentas</h2>
      <div className="toolbox-list">
        {BLOCK_REGISTRY.map((block) => (
          <ToolItem key={block.type} block={block} />
        ))}
      </div>
    </aside>
  );
}
