export function formatBRL(value) {
  if (typeof value !== 'number') return value;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
