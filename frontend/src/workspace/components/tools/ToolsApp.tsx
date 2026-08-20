// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useMemo, useState } from 'react';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';
import { saveStoreSettings } from '@/workspace/lib/storeSettingsClient';
import { saveSimilarProductsSettings } from '@/workspace/lib/similarProductsSettingsClient';
import { setClassificationActive } from '@/workspace/lib/classificationsClient';

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
  {
    id: 'hidePriceWithoutLogin',
    label: 'Esconder preço de quem não está logado',
    description:
      'Visitante sem cadastro/login vê só foto, nome e cores — o preço vira um link pra entrar/criar conta. Desligada por padrão (diferente das outras ferramentas acima, aqui a peça começa sempre com preço à mostra em storeSettings.json até a loja ligar).',
  },
  {
    id: 'allowCpfSignup',
    label: 'Permitir cadastro com CPF',
    description:
      'Define o documento aceito no autocadastro público. Ligada aceita CPF ou CNPJ; desligada aceita somente CNPJ.',
  },
  {
    id: 'clientSelfCheckout',
    label: 'Cliente finaliza sozinha (talão)',
    description:
      'Quando uma vendedora monta o pedido no talão e vincula o cadastro da cliente, essa ferramenta decide se a cliente pode confirmar o pedido sozinha pela plataforma (ligada) ou só a vendedora pode fechar — pelo link de pagamento (desligada). Não afeta compra sem talão nenhum (cliente comprando sozinha, sem vendedora envolvida).',
  },
];

const ASSIGNMENT_STRATEGIES = [
  { value: 'leastBusy', label: 'Quem tem menos pedidos abertos agora' },
  { value: 'roundRobin', label: 'Rodízio (revezamento fixo)' },
  { value: 'any', label: 'Qualquer uma disponível, sem regra' },
];

// Regras disponíveis pra "produtos similares" (ver web/src/lib/similarProducts.ts,
// SIMILAR_PRODUCTS_RULES) — adicionar uma regra nova no backend também
// precisa de uma entrada aqui (id + rótulo + descrição) pra loja poder
// ligá-la; nenhum outro lugar desta tela muda.
const AVAILABLE_RULES = [
  {
    id: 'sameSubcategory',
    label: 'Peça parecida (mesma subcategoria)',
    description: 'Ex.: um cropped mostra outros croppeds — mesma categoria e mesma subcategoria da peça vista.',
  },
  {
    id: 'sameCategory',
    label: 'Categoria parecida (mesma categoria)',
    description: 'Ex.: uma blusa regata também mostra outras blusas, de qualquer subcategoria.',
  },
  {
    id: 'complementaryCategory',
    label: 'Categoria complementar (combina com)',
    description: 'Ex.: peça de cima sugerindo peça de baixo — usa o mapa de categorias complementares configurado abaixo.',
  },
];

const SIMILAR_CONTEXTS = [
  { key: 'quickview', label: 'Quick-view (e página do produto)' },
  { key: 'cart', label: 'Carrinho' },
];

const DEFAULT_SIMILAR_PRODUCTS_SETTINGS = {
  quickview: { limit: 3, rules: ['sameSubcategory', 'sameCategory'] },
  cart: { limit: 10, rules: ['sameSubcategory', 'complementaryCategory', 'sameCategory'] },
  complementaryCategories: {},
};

export default function ToolsApp({ initialSettings, initialSimilarProductsSettings, products, initialClassifications }) {
  const [settings, setSettings] = useState(initialSettings || {});
  const [pendingId, setPendingId] = useState(null);
  const [errorId, setErrorId] = useState(null);

  const [classifications, setClassifications] = useState(initialClassifications || []);
  const [pendingClassificationId, setPendingClassificationId] = useState(null);
  const [errorClassificationId, setErrorClassificationId] = useState(null);
  const [assignmentSaveState, setAssignmentSaveState] = useState('idle');
  const [expirationInput, setExpirationInput] = useState(
    initialSettings?.paymentLinkExpirationMinutes != null ? String(initialSettings.paymentLinkExpirationMinutes) : '15'
  );
  const [expirationSaveState, setExpirationSaveState] = useState('idle');

  const [similarSettings, setSimilarSettings] = useState(
    initialSimilarProductsSettings || DEFAULT_SIMILAR_PRODUCTS_SETTINGS
  );
  const [similarSaveState, setSimilarSaveState] = useState('idle');
  const [similarDirty, setSimilarDirty] = useState(false);
  const [newComplementaryCategory, setNewComplementaryCategory] = useState('');

  const categories = useMemo(
    () => Array.from(new Set((products || []).map((p) => p.category).filter(Boolean))).sort(),
    [products]
  );

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

  const categoryTree = useMemo(() => {
    const categories = classifications.filter((c) => c.kind === 'category');
    const subcategories = classifications.filter((c) => c.kind === 'subcategory');
    return categories.map((category) => ({
      ...category,
      subcategories: subcategories.filter((sub) => sub.parentId === category.id),
    }));
  }, [classifications]);

  async function handleClassificationToggle(item) {
    setPendingClassificationId(item.id);
    setErrorClassificationId(null);
    try {
      const updated = await setClassificationActive(item.id, !item.active);
      setClassifications((prev) => prev.map((c) => (c.id === updated.id ? { ...c, active: updated.active } : c)));
    } catch {
      setErrorClassificationId(item.id);
    } finally {
      setPendingClassificationId(null);
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

  async function handleSaveExpiration() {
    const minutes = Number(expirationInput);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setExpirationSaveState('error');
      return;
    }
    const nextSettings = { ...settings, paymentLinkExpirationMinutes: minutes };
    setExpirationSaveState('saving');
    try {
      await saveStoreSettings(nextSettings);
      setSettings(nextSettings);
      setExpirationSaveState('saved');
    } catch {
      setExpirationSaveState('error');
    }
  }

  function updateContextLimit(context, limit) {
    setSimilarSettings((prev) => ({ ...prev, [context]: { ...prev[context], limit } }));
    setSimilarDirty(true);
  }

  function toggleContextRule(context, ruleId) {
    setSimilarSettings((prev) => {
      const rules = prev[context].rules.includes(ruleId)
        ? prev[context].rules.filter((r) => r !== ruleId)
        : [...prev[context].rules, ruleId];
      return { ...prev, [context]: { ...prev[context], rules } };
    });
    setSimilarDirty(true);
  }

  function addComplementaryCategoryRow(category) {
    if (!category || similarSettings.complementaryCategories[category]) return;
    setSimilarSettings((prev) => ({
      ...prev,
      complementaryCategories: { ...prev.complementaryCategories, [category]: [] },
    }));
    setSimilarDirty(true);
  }

  function removeComplementaryCategoryRow(category) {
    setSimilarSettings((prev) => {
      const next = { ...prev.complementaryCategories };
      delete next[category];
      return { ...prev, complementaryCategories: next };
    });
    setSimilarDirty(true);
  }

  function addComplementaryTarget(category, target) {
    if (!target) return;
    setSimilarSettings((prev) => {
      const current = prev.complementaryCategories[category] || [];
      if (current.includes(target)) return prev;
      return {
        ...prev,
        complementaryCategories: { ...prev.complementaryCategories, [category]: [...current, target] },
      };
    });
    setSimilarDirty(true);
  }

  function removeComplementaryTarget(category, target) {
    setSimilarSettings((prev) => ({
      ...prev,
      complementaryCategories: {
        ...prev.complementaryCategories,
        [category]: (prev.complementaryCategories[category] || []).filter((c) => c !== target),
      },
    }));
    setSimilarDirty(true);
  }

  async function handleSaveSimilar() {
    setSimilarSaveState('saving');
    try {
      await saveSimilarProductsSettings(similarSettings);
      setSimilarSaveState('saved');
      setSimilarDirty(false);
    } catch {
      setSimilarSaveState('error');
    }
  }

  return (
    <div className="products-page">
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Ferramentas</h1>
          <WorkspaceNav />
        </div>
      </div>

      <main className={adminUi.productsEditor}>
        <p className={adminUi.previewEmpty}>
          Liga/desliga de funcionalidades opcionais do catálogo — desligada aqui, some pro cliente mesmo que a
          peça tenha o dado preenchido. Cada mudança já salva na hora, sem precisar de um botão Salvar à parte.
        </p>

        <div className={adminUi.toolsList}>
          {TOOLS.map((tool) => {
            const enabled = isEnabled(tool.id);
            return (
              <div key={tool.id} className={adminUi.toolRow}>
                <div className="contents">
                  <span className="contents">{tool.label}</span>
                  <span className="contents">{tool.description}</span>
                  {errorId === tool.id && <span className={adminUi.status}>Erro ao salvar — tente de novo.</span>}
                </div>
                <button
                  type="button"
                  className={[adminUi.toggle, enabled ? 'bg-brand-primary' : ''].join(' ')}
                  onClick={() => handleToggle(tool.id)}
                  disabled={pendingId === tool.id}
                  aria-pressed={enabled}
                  aria-label={`${enabled ? 'Desligar' : 'Ligar'} ${tool.label}`}
                >
                  <span className="contents" />
                </button>
              </div>
            );
          })}
        </div>

        <h2 className={adminUi.subheading}>Categorias visíveis no menu</h2>
        <p className={adminUi.previewEmpty}>
          Liga/desliga cada categoria e subcategoria do menu lateral do catálogo — desligada aqui, some do menu
          mesmo que ainda tenha peças cadastradas nela. Cada mudança já salva na hora.
        </p>
        {categoryTree.length === 0 && <p className={adminUi.previewEmpty}>Nenhuma categoria cadastrada ainda.</p>}
        <div className={adminUi.toolsList}>
          {categoryTree.map((category) => (
            <div key={category.id} className={adminUi.toolRow}>
              <div className="contents">
                <span className="contents">{category.name}</span>
                {errorClassificationId === category.id && <span className={adminUi.status}>Erro ao salvar — tente de novo.</span>}
                <button
                  type="button"
                  className={[adminUi.toggle, category.active ? 'bg-brand-primary' : ''].join(' ')}
                  onClick={() => handleClassificationToggle(category)}
                  disabled={pendingClassificationId === category.id}
                  aria-pressed={category.active}
                  aria-label={`${category.active ? 'Desligar' : 'Ligar'} ${category.name}`}
                >
                  <span className="contents" />
                </button>
              </div>
              {category.subcategories.length > 0 && (
                <div className="mt-2 space-y-1 pl-3">
                  {category.subcategories.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between gap-2">
                      <span className="text-[13px]">{sub.name}</span>
                      {errorClassificationId === sub.id && <span className={adminUi.status}>Erro ao salvar.</span>}
                      <button
                        type="button"
                        className={[adminUi.toggle, sub.active ? 'bg-brand-primary' : ''].join(' ')}
                        onClick={() => handleClassificationToggle(sub)}
                        disabled={pendingClassificationId === sub.id}
                        aria-pressed={sub.active}
                        aria-label={`${sub.active ? 'Desligar' : 'Ligar'} ${sub.name}`}
                      >
                        <span className="contents" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <h2 className={adminUi.subheading}>Talão de pedidos</h2>
        <p className={adminUi.previewEmpty}>
          Quando uma cliente cadastrada começa a montar um pedido sozinha (sem estar com nenhuma vendedora ainda),
          essa regra decide qual vendedora logada recebe — só vale pra cliente nova ou cuja última vendedora não
          está logada agora; se ela já tiver sido atendida antes, cai direto pra quem atendeu da última vez.
        </p>
        <div className={adminUi.field} style={{ maxWidth: 340 }}>
          <label>Distribuição de cliente nova</label>
          <select value={settings.assignmentStrategy || 'leastBusy'} onChange={handleAssignmentStrategyChange}>
            {ASSIGNMENT_STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {assignmentSaveState === 'saved' && <span className={adminUi.status}>Salvo</span>}
          {assignmentSaveState === 'error' && <span className={adminUi.status}>Erro ao salvar</span>}
        </div>

        <p className={adminUi.previewEmpty}>
          Prazo até o link de pagamento gerado pela vendedora (em /frete) expirar — depois disso a cliente vê
          "link expirado" e a vendedora precisa gerar um novo (mesmo botão, reaproveita se ainda estiver válido).
        </p>
        <div className={adminUi.fieldRow} style={{ alignItems: 'flex-end' }}>
          <div className={adminUi.field} style={{ maxWidth: 140 }}>
            <label>Expira em (minutos)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={expirationInput}
              onChange={(e) => {
                setExpirationInput(e.target.value);
                setExpirationSaveState('idle');
              }}
            />
          </div>
          <button className={adminUi.primaryButton} onClick={handleSaveExpiration} disabled={expirationSaveState === 'saving'}>
            {expirationSaveState === 'saving' ? 'Salvando…' : 'Salvar'}
          </button>
          {expirationSaveState === 'saved' && <span className={adminUi.status}>Salvo</span>}
          {expirationSaveState === 'error' && <span className={adminUi.status}>Valor inválido ou erro ao salvar</span>}
        </div>

        <h2 className={adminUi.subheading}>Produtos similares</h2>
        <p className={adminUi.previewEmpty}>
          Regra usada na fileira "Você também pode gostar" — página do produto, quick-view e carrinho. Curadoria
          manual 1 por 1 (substitui a regra pra um produto específico) fica em /produtos.
        </p>

        {SIMILAR_CONTEXTS.map(({ key, label }) => (
          <div key={key} className="contents">
            <div className={adminUi.fieldRow}>
              <h3 className="contents">{label}</h3>
              <div className={adminUi.field} style={{ maxWidth: 120 }}>
                <label>Quantidade</label>
                <input
                  type="number"
                  min="1"
                  value={similarSettings[key].limit}
                  onChange={(e) => updateContextLimit(key, Number(e.target.value) || 1)}
                />
              </div>
            </div>
            <div className="contents">
              {AVAILABLE_RULES.map((rule) => (
                <label key={rule.id} className="contents">
                  <input
                    type="checkbox"
                    checked={similarSettings[key].rules.includes(rule.id)}
                    onChange={() => toggleContextRule(key, rule.id)}
                  />
                  <span>
                    <span className="contents">{rule.label}</span>
                    <span className="contents">{rule.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <h3 className="contents">Categorias complementares</h3>
        <p className={adminUi.previewEmpty}>
          Usado pela regra "categoria complementar" acima — ex.: peças de cima combinando com peças de baixo.
        </p>
        <div className="contents">
          {Object.entries(similarSettings.complementaryCategories).map(([category, targets]) => (
            <div key={category} className="contents">
              <span className="contents">{category}</span>
              <div className="contents">
                {targets.map((t) => (
                  <span key={t} className="contents">
                    {t}
                    <button type="button" onClick={() => removeComplementaryTarget(category, t)} aria-label={`Remover ${t}`}>
                      ✕
                    </button>
                  </span>
                ))}
                <select value="" onChange={(e) => addComplementaryTarget(category, e.target.value)}>
                  <option value="">+ adicionar categoria...</option>
                  {categories
                    .filter((c) => c !== category && !targets.includes(c))
                    .map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                </select>
              </div>
              <button
                className={adminUi.iconButton}
                onClick={() => removeComplementaryCategoryRow(category)}
                title="Remover linha"
              >
                ✕
              </button>
            </div>
          ))}
          {Object.keys(similarSettings.complementaryCategories).length === 0 && (
            <p className={adminUi.previewEmpty}>Nenhuma categoria complementar cadastrada ainda.</p>
          )}
        </div>
        <div className={adminUi.fieldRow}>
          <div className={adminUi.field} style={{ maxWidth: 260 }}>
            <label>Nova categoria</label>
            <select value={newComplementaryCategory} onChange={(e) => setNewComplementaryCategory(e.target.value)}>
              <option value="">Selecione...</option>
              {categories
                .filter((c) => !similarSettings.complementaryCategories[c])
                .map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
            </select>
          </div>
          <button
            className={adminUi.button}
            onClick={() => {
              addComplementaryCategoryRow(newComplementaryCategory);
              setNewComplementaryCategory('');
            }}
            disabled={!newComplementaryCategory}
          >
            + adicionar categoria
          </button>
        </div>

        <div className={adminUi.fieldRow} style={{ marginTop: 12 }}>
          <button className={adminUi.primaryButton} onClick={handleSaveSimilar} disabled={similarSaveState === 'saving'}>
            {similarSaveState === 'saving' ? 'Salvando…' : 'Salvar produtos similares'}
          </button>
          {similarSaveState === 'saved' && !similarDirty && <span className={adminUi.status}>Salvo</span>}
          {similarSaveState === 'error' && <span className={adminUi.status}>Erro ao salvar</span>}
          {similarDirty && similarSaveState !== 'saving' && <span className={adminUi.status}>Alterações não salvas</span>}
        </div>
      </main>
    </div>
  );
}
