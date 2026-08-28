'use client';
import { useClientSession } from './ClientSessionProvider';
import { useStoreSettings } from './StoreSettingsProvider';

// Ferramenta "cliente finaliza sozinha (talão)" — storeSettings.json
// `features.clientSelfCheckout`, editável em /ferramentas (mesmo padrão de
// liga/desliga do resto de TOOLS em admin/.../ToolsApp.js: ausente ou
// `true` = ligada, só `false` explícito desliga). Decide se uma cliente
// atendida por uma vendedora (sessão de talão compartilhada, ver
// ClientSessionProvider.tsx — o carrinho dela É o mesmo pedido da
// vendedora) pode confirmar o pedido sozinha em /pagamento, ou só a
// vendedora pode fechar (link de pagamento ou fechamento manual no talão).
// Não se aplica a compra sem talão nenhum (cliente comprando sozinha, sem
// vendedora envolvida) — nesse caso `activeSession` é null e o hook nunca
// bloqueia.
export function useClientSelfCheckoutGate(): boolean {
  const clientSession = useClientSession();
  const storeSettings = useStoreSettings();
  const enabled = storeSettings.features?.clientSelfCheckout !== false;

  return !!clientSession?.activeSession && !enabled;
}
