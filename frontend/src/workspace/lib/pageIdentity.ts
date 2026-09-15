/**
 * Remove o prefixo do tenant para que a mesma pagina tenha a mesma identidade
 * em todos os tenants. `usePathname` nao inclui query strings, portanto filtros
 * e abas controlados pela URL tambem nao reiniciam a transicao da pagina.
 */
export function workspacePathname(pathname: string, tenantSlug: string): string {
  const tenantPrefix = `/${tenantSlug}`;
  const tenantRelativePath = pathname === tenantPrefix
    ? '/'
    : pathname.startsWith(`${tenantPrefix}/`)
      ? pathname.slice(tenantPrefix.length)
      : pathname;

  if (tenantRelativePath.length > 1 && tenantRelativePath.endsWith('/')) {
    return tenantRelativePath.slice(0, -1);
  }

  return tenantRelativePath || '/';
}

/**
 * Codificacao reversivel em code points. Alem de produzir um `id` valido sem
 * espacos, evita colisoes entre rotas que apenas parecem iguais depois de um
 * slugify (por exemplo, `/a-b` e `/a_b`).
 */
function encodePathForDomId(pathname: string): string {
  return Array.from(pathname, (character) => character.codePointAt(0)!.toString(16)).join('-');
}

/**
 * Fonte unica dos IDs usados nas transicoes do workspace. Como o shell chama
 * esta funcao, toda pagina atual ou futura sob `/workspace` entra no contrato
 * automaticamente, inclusive rotas dinamicas.
 */
export function workspacePageId(pathname: string): string {
  return `workspace-page-${encodePathForDomId(pathname)}`;
}
