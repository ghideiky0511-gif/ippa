import Redis from 'ioredis';

let client: Redis | undefined;

// Redis é só uma camada de cache (ver stockCacheService) -- nunca uma
// dependência obrigatória. lazyConnect + timeouts curtos + sem retry
// automático garantem que uma instância fora do ar/mal configurada nunca
// trava quem chama; o efeito deve sempre ser "trate como cache miss",
// nunca uma exceção subindo pro código de negócio.
function getRedisClient(): Redis | undefined {
  if (!process.env.REDIS_URL) return undefined;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 1_000,
      commandTimeout: 500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    client.on('error', (error) => console.error('Conexão Redis falhou.', error));
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
    console.error('Operação Redis falhou, seguindo sem cache.', error);
    return undefined;
  }
}
