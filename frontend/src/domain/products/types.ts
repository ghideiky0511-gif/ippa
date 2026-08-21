// Fonte única em backend/src/contracts/products.ts — este arquivo só
// reexporta pra manter o import path @/domain/products/types que o resto
// do frontend já usa. Ver scripts/sync-contracts.mjs.
export * from '@/contracts/products';
