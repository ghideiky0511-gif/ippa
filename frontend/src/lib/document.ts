// Compatibilidade para os consumidores atuais: a regra real fica no
// contrato sincronizado e é a mesma usada pelo backend.
export {
  documentDigits,
  getDocumentType,
  type DocumentType,
} from '@/contracts/shared';
import { getDocumentType } from '@/contracts/shared';

// CNPJ mostra o representante (quando cadastrado) + o número; CPF mostra só
// o número — mais útil que o canal pra diferenciar contas com nomes
// parecidos (ex. filiais de um cliente master, ver TalaoDrawer.tsx e
// TalaoHubApp.tsx). Sem documento, quem chama decide o fallback.
export function clientSubtext(client?: { cpfCnpj?: string; companyResponsible?: string } | null): string | null {
  if (!client?.cpfCnpj) return null;
  if (getDocumentType(client.cpfCnpj) === 'cnpj') {
    return client.companyResponsible ? `${client.companyResponsible} · ${client.cpfCnpj}` : client.cpfCnpj;
  }
  return client.cpfCnpj;
}
