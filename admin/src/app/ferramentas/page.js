import ToolsApp from '@/components/tools/ToolsApp';
import { fetchStoreSettings } from '@/lib/storeSettingsClient';

export const dynamic = 'force-dynamic';

export default async function FerramentasPage() {
  let settings = {};
  let loadError = null;

  try {
    settings = await fetchStoreSettings();
  } catch (err) {
    loadError = err.message;
  }

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar as configurações da loja ({loadError}).</p>
        <p>Confira se o app `web` está rodando em localhost:3000.</p>
      </div>
    );
  }

  return <ToolsApp initialSettings={settings} />;
}
