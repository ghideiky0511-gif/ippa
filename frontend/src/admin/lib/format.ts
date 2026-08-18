// @ts-nocheck
// Espelha web/src/lib/format.ts — mesma formatação de preço nos dois apps.
export function formatBRL(value) {
  return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatMarkup(value) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`;
}
