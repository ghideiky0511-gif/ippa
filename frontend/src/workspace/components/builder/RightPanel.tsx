// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { cn } from '@/lib/cn';
import Toolbox from './Toolbox';
import { getBlockDefinition, CANVAS_WIDTH, MIN_SIZE } from '@/workspace/lib/blockRegistry';

// Campos numéricos de posição/tamanho — sempre visíveis aqui no painel,
// então mesmo que o bloco fique maior que a área visível do canvas (ou as
// alças de arrastar fiquem fora da tela), ainda dá pra redimensionar e
// mover digitando o valor, sem depender de alcançar a borda do bloco.
function PositionFields({ section, onUpdate }) {
  const x = section.x || 0;
  const y = section.y || 0;
  const width = section.width || 280;
  const height = section.height || 300;

  function setX(value) {
    const w = section.width || width;
    const next = Math.min(CANVAS_WIDTH - w, Math.max(0, value));
    onUpdate((s) => ({ ...s, x: next }));
  }

  function setY(value) {
    onUpdate((s) => ({ ...s, y: Math.max(0, value) }));
  }

  function setWidth(value) {
    const curX = section.x || x;
    const next = Math.min(CANVAS_WIDTH - curX, Math.max(MIN_SIZE, value));
    onUpdate((s) => ({ ...s, width: next }));
  }

  function setHeight(value) {
    onUpdate((s) => ({ ...s, height: Math.max(MIN_SIZE, value) }));
  }

  return (
    <div className={adminUi.positionFields}>
      <div className={adminUi.fieldRow}>
        <div className={adminUi.field}>
          <label>Posição X</label>
          <input type="number" step="10" value={x} onChange={(e) => setX(Number(e.target.value))} />
        </div>
        <div className={adminUi.field}>
          <label>Posição Y</label>
          <input type="number" step="10" min="0" value={y} onChange={(e) => setY(Number(e.target.value))} />
        </div>
      </div>
      <div className={adminUi.fieldRow}>
        <div className={adminUi.field}>
          <label>Largura</label>
          <input type="number" step="10" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </div>
        <div className={adminUi.field}>
          <label>Altura</label>
          <input type="number" step="10" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
        </div>
      </div>
    </div>
  );
}

export default function RightPanel({ selectedSection, products, onUpdate, onDeselect, onRemove, className = '' }) {
  if (!selectedSection) {
    return <Toolbox />;
  }

  const def = getBlockDefinition(selectedSection.type);
  const Editor = def?.Editor;

  return (
    <aside className={cn(adminUi.toolbox, className)}>
      <div className={adminUi.panelHeader}>
        <div>
          <h2 className="text-base font-extrabold text-foreground">Editando bloco</h2>
          <p className="mt-1 text-xs text-muted-foreground">Ajuste o conteúdo, posição e tamanho.</p>
        </div>
        <button type="button" className={adminUi.iconButton} onClick={onDeselect} aria-label="Fechar editor">Fechar</button>
      </div>

      <PositionFields section={selectedSection} onUpdate={onUpdate} />

      {Editor && <Editor section={selectedSection} onUpdate={onUpdate} products={products} />}
      <button type="button" className={`${adminUi.dangerButton} mt-4 w-full`} onClick={onRemove}>
        Excluir bloco
      </button>
    </aside>
  );
}
