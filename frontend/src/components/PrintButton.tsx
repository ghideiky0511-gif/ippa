'use client';
import { publicUi } from '@/lib/ui';

export default function PrintButton() {
  return (
    <button className={publicUi.primaryButton} onClick={() => window.print()}>
      Salvar como PDF / Imprimir
    </button>
  );
}
