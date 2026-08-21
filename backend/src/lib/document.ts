// Compatibilidade para os consumidores atuais: a regra real fica no contrato
// compartilhado, evitando divergência entre frontend e backend.
export {
  documentDigits,
  getDocumentType,
  type DocumentType,
} from '@/contracts/shared';
