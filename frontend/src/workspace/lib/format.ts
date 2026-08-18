export function formatBRL(value?: number | null): string {
  return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatMarkup(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`;
}
