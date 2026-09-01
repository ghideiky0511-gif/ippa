// Fonte única em backend/src/contracts/payments.ts -- este arquivo só
// reexporta pra manter o import path @/domain/payments/types que o resto do
// frontend usa. Ver scripts/sync-contracts.mjs.
export * from '@/contracts/payments';
