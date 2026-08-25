export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatMarkup(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`;
}

export function priceWithPercentOff(price: number, percent: number): number {
  return Math.round(price * (1 - percent / 100) * 100) / 100;
}
