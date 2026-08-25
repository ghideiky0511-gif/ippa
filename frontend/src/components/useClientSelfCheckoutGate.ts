'use client';
import { useEffect, useState } from 'react';
import { useClientSession } from './ClientSessionProvider';

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
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    fetch('/api/store-settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((settings) => {
        if (settings) setEnabled(settings.features?.clientSelfCheckout !== false);
      })
      .catch(() => {});
  }, []);

  return !!clientSession?.activeSession && !enabled;
}
