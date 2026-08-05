'use client';

export default function PrintButton() {
  return (
    <button className="btn-add" onClick={() => window.print()}>
      Salvar como PDF / Imprimir
    </button>
  );
}
