'use client';

import { useState, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import Canvas from './Canvas';
import RightPanel from './RightPanel';
import AdminNav from '@/components/AdminNav';
import { BLOCK_REGISTRY, CANVAS_WIDTH } from '@/lib/blockRegistry';
import { saveHomeSections } from '@/lib/homeSectionsClient';

/** @param {{ initialSections: import('@/lib/homeSectionTypes').HomeSection[], products: import('@/lib/homeSectionTypes').Product[] }} props */
export default function BuilderApp({ initialSections, products }) {
  const [sections, setSections] = useState(initialSections || []);
  const [selectedId, setSelectedId] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [dirty, setDirty] = useState(false);

  // Só usado pra soltar uma ferramenta nova da toolbox no canvas — mover ou
  // redimensionar um bloco já existente é um drag próprio (pointer events
  // direto em CanvasBlock.js), não passa por aqui.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const selectedSection = sections.find((s) => s.id === selectedId) || null;

  // Todos com identidade estável (deps vazias, sempre a forma funcional do
  // setState) de propósito: CanvasBlock.js é React.memo, e só fica leve de
  // verdade (não travar arrastando com vários blocos na tela) se essas
  // funções não forem recriadas a cada render — senão o memo não segura.
  const updateSection = useCallback((id, updater) => {
    setSections((prev) => prev.map((s) => (s.id === id ? updater(s) : s)));
    setDirty(true);
  }, []);

  const moveSection = useCallback((id, x, y) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)));
    setDirty(true);
  }, []);

  const resizeSection = useCallback((id, width, height) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, width, height } : s)));
    setDirty(true);
  }, []);

  const removeSection = useCallback((id) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setDirty(true);
  }, []);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || over.id !== 'canvas') return;

    const activeId = String(active.id);
    if (!activeId.startsWith('new:')) return;

    const toolType = active.data.current?.type;
    const def = BLOCK_REGISTRY.find((b) => b.type === toolType);
    if (!def) return;

    const dropRect = active.rect.current.translated;
    const canvasRect = over.rect;
    const rawX = Math.round((dropRect?.left ?? canvasRect.left) - canvasRect.left);
    const y = Math.max(0, Math.round((dropRect?.top ?? canvasRect.top) - canvasRect.top));

    const section = def.createDefault(0, y);
    // Trava dentro do canvas — soltar perto da borda não pode deixar o
    // bloco esticando pra área da toolbox.
    section.x = Math.min(CANVAS_WIDTH - section.width, Math.max(0, rawX));
    setSections((prev) => [...prev, section]);
    setSelectedId(section.id);
    setDirty(true);
  }

  function useTemplate(template) {
    setSections(template);
    setSelectedId(null);
    setDirty(true);
  }

  async function handleSave() {
    setSaveState('saving');
    try {
      await saveHomeSections(sections);
      setSaveState('saved');
      setDirty(false);
    } catch (err) {
      setSaveState('error');
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="builder">
        <div className="builder-topbar">
          <div className="builder-topbar-left">
            <h1>Editor da home</h1>
            <AdminNav />
          </div>
          <div>
            {saveState === 'saved' && !dirty && <span className="status">Salvo</span>}
            {saveState === 'error' && <span className="status">Erro ao salvar</span>}
            {dirty && saveState !== 'saving' && <span className="status">Alterações não salvas</span>}
            <button className="btn btn-primary" onClick={handleSave} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>

        <Canvas
          sections={sections}
          products={products}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRemoveSection={removeSection}
          onMoveSection={moveSection}
          onResizeSection={resizeSection}
          onUseTemplate={useTemplate}
        />

        <RightPanel
          selectedSection={selectedSection}
          products={products}
          onUpdate={(updater) => updateSection(selectedId, updater)}
          onDeselect={() => setSelectedId(null)}
          onRemove={() => removeSection(selectedId)}
        />
      </div>
    </DndContext>
  );
}
