// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useState, useCallback } from 'react';
import { Save } from 'lucide-react';
import { cn } from '@/lib/cn';
import { HOME_DEVICES, withDeviceLayout, type HomeDevice } from '@/lib/homeLayout';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import Canvas from './Canvas';
import RightPanel from './RightPanel';
import BuilderMobileList from './BuilderMobileList';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { BLOCK_REGISTRY, CANVAS_WIDTH } from '@/workspace/lib/blockRegistry';
import { saveHomeSections, generateHomeSections, fetchHomeAiHistory } from '@/workspace/lib/homeSectionsClient';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** @param {{ initialSections: import('@/workspace/lib/homeSectionTypes').HomeSection[], products: import('@/workspace/lib/homeSectionTypes').Product[] }} props */
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
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  // Modo de visualização sendo editado. Cada bloco guarda um layout por
  // modo (desktop no topo da section; tablet/celular em section.tablet /
  // section.mobile) — ver homeLayout.ts.
  const [device, setDevice] = useState<HomeDevice>('desktop');

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

  // `device` nas deps: a identidade só muda ao trocar de modo (raro), nunca
  // durante um arraste — então o React.memo de CanvasBlock continua
  // segurando os blocos parados enquanto um é movido.
  const moveSection = useCallback((id, x, y) => {
    setSections((prev) => prev.map((s) => (s.id === id ? withDeviceLayout(s, device, { x, y }) : s)));
    setDirty(true);
  }, [device]);

  const resizeSection = useCallback((id, width, height) => {
    setSections((prev) => prev.map((s) => (s.id === id ? withDeviceLayout(s, device, { width, height }) : s)));
    setDirty(true);
  }, [device]);

  const removeSection = useCallback((id) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setDirty(true);
  }, []);

  // Reordenação mobile troca só o `y` (posição vertical) entre vizinhos na
  // ordem atual — mesma fonte de verdade que já decide a ordem de
  // renderização no site (resolveHomeSections), sem precisar de um campo
  // de ordem separado.
  const swapNeighbors = useCallback((id, direction) => {
    setSections((prev) => {
      const sorted = [...prev].sort((a, b) => (a.y || 0) - (b.y || 0));
      const index = sorted.findIndex((s) => s.id === id);
      const neighborIndex = index + direction;
      if (index === -1 || neighborIndex < 0 || neighborIndex >= sorted.length) return prev;
      const current = sorted[index];
      const neighbor = sorted[neighborIndex];
      return prev.map((s) => {
        if (s.id === current.id) return { ...s, y: neighbor.y || 0 };
        if (s.id === neighbor.id) return { ...s, y: current.y || 0 };
        return s;
      });
    });
    setDirty(true);
  }, []);
  const moveSectionUp = useCallback((id) => swapNeighbors(id, -1), [swapNeighbors]);
  const moveSectionDown = useCallback((id) => swapNeighbors(id, 1), [swapNeighbors]);

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

  async function generateAI() {
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

  function handleGenerateAI(e) {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    if (sections.length > 0) {
      setPendingConfirmation(() => () => generateAI());
      return;
    }
    return generateAI();
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
    const reapply = () => {
      applyTemplate(entry.sections);
      setAiPrompt(entry.prompt);
      setHistoryOpen(false);
    };
    if (sections.length > 0) {
      setPendingConfirmation(() => reapply);
      return;
    }
    reapply();
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
      <div className={adminUi.page}>
        <HubHeader
          title="Editor da home"
          secondaryActions={<>
            {saveState === 'saved' && !dirty && <span className={adminUi.status}>Salvo</span>}
            {saveState === 'error' && <span className={adminUi.status}>Erro ao salvar</span>}
            {dirty && saveState !== 'saving' && <span className={adminUi.status}>Alterações não salvas</span>}
          </>}
          primaryAction={{ label: saveState === 'saving' ? 'Salvando…' : 'Salvar', onClick: handleSave, disabled: saveState === 'saving', icon: <Save className="size-5" aria-hidden="true" /> }}
        />

        <section className={adminUi.builderAiPanel} aria-label="Gerar estrutura com IA">
          <form className={adminUi.builderAiForm} onSubmit={handleGenerateAI}>
            <div className={`${adminUi.field} min-w-0 flex-1`}>
              <label htmlFor="builder-ai-prompt">Monte a página com IA</label>
              <Input
                id="builder-ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder='Descreva a estrutura, ex.: "banner de vídeo 660x880 no início, com mais 3 cards abaixo"'
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={adminUi.primaryButton} disabled={aiState === 'generating' || !aiPrompt.trim()}>
                {aiState === 'generating' ? 'Gerando…' : 'Gerar com IA'}
              </button>
              <button type="button" className={adminUi.button} onClick={toggleHistory} aria-expanded={historyOpen}>
                Histórico
              </button>
            </div>
          </form>
          {aiState === 'error' && <p className="mx-auto mt-2 max-w-6xl text-sm text-danger" role="alert">{aiError}</p>}

          {historyOpen && (
            <div className={adminUi.builderHistory}>
              {historyState === 'loading' && <p className={adminUi.hint}>Carregando…</p>}
              {historyState === 'error' && <p className="text-sm text-danger" role="alert">{historyError}</p>}
              {historyState === 'idle' && history.length === 0 && (
                <p className={adminUi.hint}>Nenhuma geração ainda.</p>
              )}
              {historyState === 'idle' && history.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {history.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="rounded-control border border-border bg-surface p-3 text-left transition-colors hover:border-brand-primary/30 hover:bg-brand-primary/5"
                      onClick={() => handleReapplyHistory(entry)}
                    >
                      <span className="block truncate text-sm font-semibold text-foreground">{entry.prompt}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{new Date(entry.at).toLocaleString('pt-BR')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="hidden border-b border-border bg-surface px-4 py-2.5 sm:px-6 lg:block">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Editando:</span>
            {HOME_DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDevice(d.id)}
                aria-pressed={device === d.id}
                title={`${d.label} — canvas de ${d.canvasWidth}px`}
                className={cn(
                  'cursor-pointer rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
                  device === d.id
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-[#ddd] bg-white text-brand-text hover:border-brand-primary hover:text-brand-primary',
                )}
              >
                {d.short}
                <span className="ml-1.5 font-normal opacity-70">{d.canvasWidth}px</span>
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              Tablet e celular partem do desktop reduzido; o que você mover aqui fica fixo nesse modo.
            </span>
          </div>
        </div>

        <div className={adminUi.builderLayout}>
          <Canvas
            sections={sections}
            products={products}
            device={device}
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
            device={device}
            onUpdate={(updater) => updateSection(selectedId, updater)}
            onDeselect={() => setSelectedId(null)}
            onRemove={() => removeSection(selectedId)}
          />
        </div>

        <div className="lg:hidden">
          <BuilderMobileList
            sections={sections}
            products={products}
            onSelect={(id) => { setSelectedId(id); setMobileEditorOpen(true); }}
            onMoveUp={moveSectionUp}
            onMoveDown={moveSectionDown}
            onRemove={removeSection}
          />
        </div>

        <Sheet open={mobileEditorOpen && !!selectedSection} onOpenChange={(open) => { if (!open) { setMobileEditorOpen(false); setSelectedId(null); } }}>
          <SheetContent side="right" className="w-[min(100%,25rem)]">
            <RightPanel
              className="w-full border-l-0"
              selectedSection={selectedSection}
              products={products}
              device={device}
              onUpdate={(updater) => updateSection(selectedId, updater)}
              onDeselect={() => { setMobileEditorOpen(false); setSelectedId(null); }}
              onRemove={() => removeSection(selectedId)}
            />
          </SheetContent>
        </Sheet>

        <ConfirmDialog open={!!pendingConfirmation} onOpenChange={(open) => !open && setPendingConfirmation(null)} title="Substituir blocos atuais?" description="Os blocos atuais do canvas serão substituídos pela nova estrutura." confirmLabel="Substituir" destructive onConfirm={() => pendingConfirmation ? pendingConfirmation() : undefined} />
      </div>
    </DndContext>
  );
}
