// Fonte única em backend/src/contracts/orders.ts (+ shared.ts pra
// CartItem/FreightQuote/SessionFreight/OrderFreight) — este arquivo só
// reexporta pra manter o import path @/domain/orders/types que o resto do
// frontend já usa. Ver scripts/sync-contracts.mjs.
export * from '@/contracts/orders';
export * from '@/contracts/shared';
