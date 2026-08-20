import CustomersApp from '@/workspace/customers/CustomersApp';
import { fetchClients } from '@/workspace/lib/customersClient.server';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  let clients: Awaited<ReturnType<typeof fetchClients>> | null = null;
  let loadError: string | null = null;

  try {
    clients = await fetchClients();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar os clientes ({loadError}).</p>
        <p>Confira se o serviço `backend` está rodando em localhost:3011.</p>
      </div>
    );
  }

  return <CustomersApp initialPage={clients!} />;
}
