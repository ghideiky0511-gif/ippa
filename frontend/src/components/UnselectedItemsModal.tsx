'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function UnselectedItemsModal({ names, onContinue, onReview }: { names: string[]; onContinue: () => void; onReview: () => void }) {
  const itemLabel = names.length === 1 ? 'O item' : 'Os itens';
  const verb = names.length === 1 ? 'não foi selecionado' : 'não foram selecionados';
  return (
    <Dialog open onOpenChange={(open) => !open && onReview()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Revisar seleção</DialogTitle></DialogHeader>
        <DialogDescription>
          {itemLabel} {names.map((name, index) => <strong key={name}>{index > 0 && (index === names.length - 1 ? ' e ' : ', ')}{name}</strong>)} {verb}. Escolha cor e tamanho ou continue sem esses itens.
        </DialogDescription>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onReview}>Revisar carrinho</Button>
          <Button type="button" onClick={onContinue}>Continuar para pagamento</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
