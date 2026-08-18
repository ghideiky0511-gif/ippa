'use client';
import { publicUi } from '@/lib/ui';

// Aviso antes de seguir pro frete/pagamento (ou finalizar via WhatsApp)
// quando sobrou alguma peça no carrinho sem cor/tamanho escolhidos (grade
// zerada ou ainda rascunho) — ver unselectedProductNames em
// /carrinho/page.tsx. Clicar fora ou em "revisar carrinho" só fecha o
// aviso; "continuar" segue com a ação que a pessoa tinha clicado.
export default function UnselectedItemsModal({
  names,
  onContinue,
  onReview,
}: {
  names: string[];
  onContinue: () => void;
  onReview: () => void;
}) {
  return (
    <div className={publicUi.modal} onClick={onReview}>
      <div className={publicUi.modalPanel} onClick={(e) => e.stopPropagation()}>
        <p>
          {names.length === 1 ? 'O item ' : 'Os itens '}
          {names.map((name, i) => (
            <span key={name}>
              <strong>{name}</strong>
              {i < names.length - 2 ? ', ' : i === names.length - 2 ? ' e ' : ''}
            </span>
          ))}
          {names.length === 1 ? ' não foi selecionado' : ' não foram selecionados'} (nenhuma cor/tamanho
          escolhido ainda). Deseja continuar para o pagamento ou revisar o carrinho?
        </p>
        <div className="contents">
          <button className={publicUi.whatsapp} onClick={onContinue}>Continuar para pagamento</button>
          <button className={publicUi.primaryButton} onClick={onReview}>Revisar carrinho</button>
        </div>
      </div>
    </div>
  );
}
