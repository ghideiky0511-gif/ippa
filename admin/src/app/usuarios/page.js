import UsersApp from '@/components/usuarios/UsersApp';
import { fetchUsers } from '@/lib/usersClient';

export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  let users = [];
  let loadError = null;

  try {
    users = await fetchUsers();
  } catch (err) {
    loadError = err.message;
  }

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar os usuários ({loadError}).</p>
        <p>Confira se o app `web` está rodando em localhost:3000.</p>
      </div>
    );
  }

  return <UsersApp initialUsers={users} />;
}
