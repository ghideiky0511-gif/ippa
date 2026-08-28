import DeliveryTypesApp from '@/workspace/components/delivery/DeliveryTypesApp';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';
import { fetchDeliveryTypes } from '@/workspace/lib/deliveryTypesClient.server';

export const dynamic = 'force-dynamic';

export default async function EntregasPage() {
  let types: Awaited<ReturnType<typeof fetchDeliveryTypes>> = [];
  let loadError: string | null = null;
  try {
    types = await fetchDeliveryTypes();
  } catch (cause) {
    loadError = cause instanceof Error ? cause.message : 'Erro desconhecido';
  }
  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar as entregas (${loadError}).`} showBackendHint />;
  return <DeliveryTypesApp initialTypes={types} />;
}
