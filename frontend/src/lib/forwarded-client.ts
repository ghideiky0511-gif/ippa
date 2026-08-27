type HeaderReader = Pick<Headers, 'get'>;

const CLIENT_IP_HEADERS = ['x-forwarded-for', 'x-real-ip'] as const;

/**
 * Preserva o IP que chegou ao frontend quando ele chama o backend pela rede
 * interna. Sem isso, o Next preenche x-forwarded-for com o IP do container do
 * frontend e todos os visitantes acabam compartilhando o mesmo rate limit.
 */
export function forwardClientIpHeaders(source: HeaderReader, destination: Headers): void {
  for (const name of CLIENT_IP_HEADERS) {
    destination.delete(name);
    const value = source.get(name)?.trim();
    if (value) destination.set(name, value);
  }
}
