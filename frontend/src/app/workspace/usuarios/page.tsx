import UsersApp from '@/workspace/components/usuarios/UsersApp';
import { fetchUsers } from '@/workspace/lib/usersClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  let users: Awaited<ReturnType<typeof fetchUsers>> = [];
  let loadError: string | null = null;

  try {
    users = await fetchUsers();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar os usuários (${loadError}).`} showBackendHint />;

  return <UsersApp initialUsers={users} />;
}
