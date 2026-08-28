import Redis from 'ioredis';
import { logger, errorMeta } from './logger';

let client: Redis | undefined;
let nextConnectAttemptAt = 0;

// Redis é só uma camada de cache (ver stockCacheService) -- nunca uma
// dependência obrigatória. lazyConnect + timeouts curtos + sem retry
// automático garantem que uma instância fora do ar/mal configurada nunca
// trava quem chama; o efeito deve sempre ser "trate como cache miss",
// nunca uma exceção subindo pro código de negócio.
//
// `retryStrategy: () => null` faz o ioredis desistir de vez após a
// primeira falha de conexão (status vai pra 'end' e não volta sozinho) --
// sem o descarte abaixo, uma única instabilidade transitória (deploy do
// Redis, blip de rede, allowlist propagando) travaria o cache permanente
// pro resto da vida do processo. Descartar o singleton num status terminal
// deixa a próxima chamada tentar de novo do zero; o cooldown evita bater
// reconexão a cada request enquanto a instância estiver mesmo fora do ar --
// 20s porque cada tentativa reprovada já paga o teto cheio de connect+comando
// abaixo, então repetir isso em toda requisição durante uma instabilidade
// prolongada é pior do que só assumir cache miss por um tempo.
const RECONNECT_COOLDOWN_MS = 20_000;

function getRedisClient(): Redis | undefined {
  if (!process.env.REDIS_URL) return undefined;
  if (client && (client.status === 'end' || client.status === 'close')) {
    client.removeAllListeners();
    client = undefined;
  }
  if (!client) {
    if (Date.now() < nextConnectAttemptAt) return undefined;
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      // Um cache tem que falhar rápido, não devagar: se o Redis não responde
      // quase na hora, cair pro Postgres é sempre melhor que segurar a
      // página esperando. Afrouxar isso pra "dar mais tempo pro Redis"
      // (tentativa anterior) piorou -- toda tentativa que falha paga o teto
      // cheio, e como a conexão está caindo com frequência (rediss:// pela
      // internet pública, sem rede privada no plano Free), isso virou 3s
      // médios por request. Teto curto + cooldown longo acima é o par certo.
      connectTimeout: 300,
      commandTimeout: 300,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    client.on('error', (error) => logger.error('redis', 'Conexão Redis falhou.', errorMeta(error)));
    client.on('ready', () => logger.info('redis', 'Conexão Redis estabelecida.'));
    client.on('end', () => { nextConnectAttemptAt = Date.now() + RECONNECT_COOLDOWN_MS; });
  }
  return client;
}

// Ponto único onde uma falha de Redis (conexão recusada, timeout, comando
// mal formado) vira "sem cache" em vez de propagar -- todo call site em
// stockCacheService passa por aqui, nunca chama o client do ioredis direto.
export async function safeRedis<T>(operation: (redis: Redis) => Promise<T>): Promise<T | undefined> {
  const redis = getRedisClient();
  if (!redis) return undefined;
  try {
    if (redis.status === 'wait') await redis.connect();
    return await operation(redis);
  } catch (error) {
    logger.error('redis', 'Operação Redis falhou, seguindo sem cache.', errorMeta(error));
    return undefined;
  }
}
