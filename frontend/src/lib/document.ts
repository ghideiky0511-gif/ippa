// CPF (11 dígitos) x CNPJ (14 dígitos) só pela contagem de dígitos do que
// foi digitado — sem validar dígito verificador, mesmo padrão frouxo já
// usado pro resto do cadastro (cpfCnpj nunca teve validação de formato).
// Usado só pra decidir qual campo extra opcional mostrar (ver Client.storeName/
// companyResponsible em web/src/lib/types.ts): CNPJ pergunta o responsável
// pela empresa, CPF pergunta o nome da loja da cliente.
export type DocumentType = 'cpf' | 'cnpj' | null;

export function getDocumentType(cpfCnpj: string): DocumentType {
  const digits = cpfCnpj.replace(/\D/g, '');
  if (digits.length === 11) return 'cpf';
  if (digits.length === 14) return 'cnpj';
  return null;
}
