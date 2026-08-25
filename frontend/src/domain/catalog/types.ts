// Fonte única em backend/src/contracts/catalog.ts — este arquivo só
// reexporta pra manter o import path @/domain/catalog/types que o resto
// do frontend já usa. Ver scripts/sync-contracts.mjs.
export * from '@/contracts/catalog';
