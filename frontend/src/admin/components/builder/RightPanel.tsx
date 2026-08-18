// @ts-nocheck
'use client';
import { adminUi } from '@/admin/lib/ui';
import Toolbox from './Toolbox';
import { getBlockDefinition, CANVAS_WIDTH, MIN_SIZE } from '@/admin/lib/blockRegistry';

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

export default function RightPanel({ selectedSection, products, onUpdate, onDeselect, onRemove }) {
  if (!selectedSection) {
    return <Toolbox />;
  }

  const def = getBlockDefinition(selectedSection.type);
  const Editor = def?.Editor;

  return (
    <aside className={adminUi.toolbox}>
      <div className={adminUi.panelHeader}>
        <h2>Editando</h2>
        <button className={adminUi.iconButton} onClick={onDeselect}>Fechar</button>
      </div>

      <PositionFields section={selectedSection} onUpdate={onUpdate} />

      {Editor && <Editor section={selectedSection} onUpdate={onUpdate} products={products} />}
      <button className={adminUi.dangerButton} style={{ marginTop: 14, width: '100%' }} onClick={onRemove}>
        Excluir bloco
      </button>
    </aside>
  );
}
