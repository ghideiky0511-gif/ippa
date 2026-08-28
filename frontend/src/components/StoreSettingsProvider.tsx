'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { StoreSettings } from '@/domain/catalog/types';

const StoreSettingsContext = createContext<StoreSettings | null>(null);

// storeSettings já é buscado uma vez no server (RootLayout, GET
// /api/store-settings com revalidate: 30) — este provider só redistribui
// esse valor pra quem precisar de storeSettings.features no cliente, em vez
// de cada componente refazer o próprio fetch('/api/store-settings') a cada
// vez que monta (produto, /login, /cadastro, /pagamento faziam isso
// independentemente, gerando requisições repetidas e sem necessidade).
export function StoreSettingsProvider({ storeSettings, children }: { storeSettings: StoreSettings; children: ReactNode }) {
  return <StoreSettingsContext.Provider value={storeSettings}>{children}</StoreSettingsContext.Provider>;
}

export function useStoreSettings(): StoreSettings {
  const context = useContext(StoreSettingsContext);
  if (!context) throw new Error('useStoreSettings precisa estar dentro de <StoreSettingsProvider>.');
  return context;
}
