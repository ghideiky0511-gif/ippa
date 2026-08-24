import TalaoHubApp from '@/workspace/talao/TalaoHubApp';
import { fetchOrderBooks, fetchOrderSessions } from '@/workspace/lib/ordersClient.server';

export const dynamic = 'force-dynamic';

export default async function TalaoPage() {
  let books: Awaited<ReturnType<typeof fetchOrderBooks>> = [];
  let sessions: Awaited<ReturnType<typeof fetchOrderSessions>> = [];
  let loadError: string | null = null;

  try {
    [books, sessions] = await Promise.all([
      fetchOrderBooks(),
      fetchOrderSessions(),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Erro desconhecido';
  }

  if (loadError) {
    return <div style={{ padding: 40 }}>Não foi possível carregar o talão ({loadError}).</div>;
  }

  return <TalaoHubApp initialBooks={books} initialSessions={sessions} />;
}
