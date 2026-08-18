// @ts-nocheck
'use client';

import { useState, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import Canvas from './Canvas';
import RightPanel from './RightPanel';
import AdminNav from '@/admin/components/AdminNav';
import { BLOCK_REGISTRY, CANVAS_WIDTH } from '@/admin/lib/blockRegistry';
import { saveHomeSections, generateHomeSections, fetchHomeAiHistory } from '@/admin/lib/homeSectionsClient';

/** @param {{ initialSections: import('@/admin/lib/homeSectionTypes').HomeSection[], products: import('@/admin/lib/homeSectionTypes').Product[] }} props */
export default function BuilderApp({ initialSections, products }) {
  const [sections, setSections] = useState(initialSections || []);
  const [selectedId, setSelectedId] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [dirty, setDirty] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiState, setAiState] = useState('idle'); // idle | generating | error
  const [aiError, setAiError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState('idle'); // idle | loading | error
  const [historyError, setHistoryError] = useState('');

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

  function applyTemplate(template) {
    setSections(template);
    setSelectedId(null);
    setDirty(true);
  }

  async function handleGenerateAI(e) {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    if (sections.length > 0 && !window.confirm('Isso substitui os blocos atuais do canvas. Continuar?')) {
      return;
    }
    setAiState('generating');
    setAiError('');
    try {
      const generated = await generateHomeSections(aiPrompt.trim(), sections);
      if (!generated || generated.length === 0) {
        setAiState('error');
        setAiError('Não reconheci nenhum bloco válido nessa descrição — tenta detalhar melhor.');
        return;
      }
      applyTemplate(generated);
      setAiState('idle');
    } catch (err) {
      setAiState('error');
      setAiError(err.message);
    }
  }

  async function toggleHistory() {
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (!opening) return;
    setHistoryState('loading');
    setHistoryError('');
    try {
      const items = await fetchHomeAiHistory();
      setHistory(items);
      setHistoryState('idle');
    } catch (err) {
      setHistoryState('error');
      setHistoryError(err.message);
    }
  }

  function handleReapplyHistory(entry) {
    if (sections.length > 0 && !window.confirm('Isso substitui os blocos atuais do canvas. Continuar?')) {
      return;
    }
    applyTemplate(entry.sections);
    setAiPrompt(entry.prompt);
    setHistoryOpen(false);
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

        <form className="builder-ai-bar" onSubmit={handleGenerateAI}>
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder='Descreva a estrutura, ex.: "banner de vídeo 660x880 no início, com mais 3 cards abaixo"'
          />
          <button type="submit" className="btn btn-primary" disabled={aiState === 'generating' || !aiPrompt.trim()}>
            {aiState === 'generating' ? 'Gerando…' : 'Gerar com IA'}
          </button>
          <button type="button" className="btn" onClick={toggleHistory}>
            Histórico
          </button>
          {aiState === 'error' && <span className="builder-ai-error">{aiError}</span>}

          {historyOpen && (
            <div className="builder-ai-history">
              {historyState === 'loading' && <p className="builder-ai-history-empty">Carregando…</p>}
              {historyState === 'error' && <p className="builder-ai-history-empty">{historyError}</p>}
              {historyState === 'idle' && history.length === 0 && (
                <p className="builder-ai-history-empty">Nenhuma geração ainda.</p>
              )}
              {historyState === 'idle' &&
                history.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="builder-ai-history-item"
                    onClick={() => handleReapplyHistory(entry)}
                  >
                    <span className="builder-ai-history-prompt">{entry.prompt}</span>
                    <span className="builder-ai-history-date">{new Date(entry.at).toLocaleString('pt-BR')}</span>
                  </button>
                ))}
            </div>
          )}
        </form>

        <Canvas
          sections={sections}
          products={products}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRemoveSection={removeSection}
          onMoveSection={moveSection}
          onResizeSection={resizeSection}
          onUseTemplate={applyTemplate}
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
