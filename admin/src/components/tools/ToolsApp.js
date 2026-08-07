'use client';

import { useState } from 'react';
import AdminNav from '@/components/AdminNav';
import { saveStoreSettings } from '@/lib/storeSettingsClient';

// Lista de ferramentas opcionais do catálogo — cada uma tem um id (chave em
// storeSettings.json `features`), um rótulo e uma descrição curta. Adicionar
// uma nova ferramenta liga/desliga aqui não exige mexer no resto da página.
const TOOLS = [
  {
    id: 'suggestedPrice',
    label: 'Preço sugerido + markup',
    description:
      'Preço de revenda sugerido e o chip de markup na página de produto e no quick-view. Editável por peça e com markup padrão em /produtos.',
  },
  {
    id: 'preSale',
    label: 'Filtro de pré-venda',
    description: 'Botão "pré-venda" no filtro de entrega da página de produto/quick-view (grade de cor×tamanho).',
  },
  {
    id: 'readyToShip',
    label: 'Filtro de pronta entrega',
    description: 'Botão "pronta-entrega" no filtro de entrega da página de produto/quick-view (grade de cor×tamanho).',
  },
];

const ASSIGNMENT_STRATEGIES = [
  { value: 'leastBusy', label: 'Quem tem menos pedidos abertos agora' },
  { value: 'roundRobin', label: 'Rodízio (revezamento fixo)' },
  { value: 'any', label: 'Qualquer uma disponível, sem regra' },
];

export default function ToolsApp({ initialSettings }) {
  const [settings, setSettings] = useState(initialSettings || {});
  const [pendingId, setPendingId] = useState(null);
  const [errorId, setErrorId] = useState(null);
  const [assignmentSaveState, setAssignmentSaveState] = useState('idle');

  // Ausente em storeSettings.json = ligada (comportamento padrão de quando
  // a ferramenta foi construída) — só `false` explícito desliga.
  function isEnabled(id) {
    return settings.features?.[id] !== false;
  }

  async function handleToggle(id) {
    const nextSettings = { ...settings, features: { ...(settings.features || {}), [id]: !isEnabled(id) } };
    setPendingId(id);
    setErrorId(null);
    try {
      await saveStoreSettings(nextSettings);
      setSettings(nextSettings);
    } catch {
      setErrorId(id);
    } finally {
      setPendingId(null);
    }
  }

  async function handleAssignmentStrategyChange(e) {
    const nextSettings = { ...settings, assignmentStrategy: e.target.value };
    setSettings(nextSettings);
    setAssignmentSaveState('saving');
    try {
      await saveStoreSettings(nextSettings);
      setAssignmentSaveState('saved');
    } catch {
      setAssignmentSaveState('error');
    }
  }

  return (
    <div className="products-page">
      <div className="builder-topbar">
        <div className="builder-topbar-left">
          <h1>Ferramentas</h1>
          <AdminNav />
        </div>
      </div>

      <main className="products-editor">
        <p className="preview-empty-text">
          Liga/desliga de funcionalidades opcionais do catálogo — desligada aqui, some pro cliente mesmo que a
          peça tenha o dado preenchido. Cada mudança já salva na hora, sem precisar de um botão Salvar à parte.
        </p>

        <div className="tools-list">
          {TOOLS.map((tool) => {
            const enabled = isEnabled(tool.id);
            return (
              <div key={tool.id} className="tool-row">
                <div className="tool-info">
                  <span className="tool-label">{tool.label}</span>
                  <span className="tool-description">{tool.description}</span>
                  {errorId === tool.id && <span className="status">Erro ao salvar — tente de novo.</span>}
                </div>
                <button
                  type="button"
                  className={'toggle-switch' + (enabled ? ' on' : '')}
                  onClick={() => handleToggle(tool.id)}
                  disabled={pendingId === tool.id}
                  aria-pressed={enabled}
                  aria-label={`${enabled ? 'Desligar' : 'Ligar'} ${tool.label}`}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
            );
          })}
        </div>

        <h2 className="collections-subheading">Talão de pedidos</h2>
        <p className="preview-empty-text">
          Quando uma cliente cadastrada começa a montar um pedido sozinha (sem estar com nenhuma vendedora ainda),
          essa regra decide qual vendedora logada recebe — só vale pra cliente nova ou cuja última vendedora não
          está logada agora; se ela já tiver sido atendida antes, cai direto pra quem atendeu da última vez.
        </p>
        <div className="field" style={{ maxWidth: 340 }}>
          <label>Distribuição de cliente nova</label>
          <select value={settings.assignmentStrategy || 'leastBusy'} onChange={handleAssignmentStrategyChange}>
            {ASSIGNMENT_STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {assignmentSaveState === 'saved' && <span className="status">Salvo</span>}
          {assignmentSaveState === 'error' && <span className="status">Erro ao salvar</span>}
        </div>
      </main>
    </div>
  );
}
