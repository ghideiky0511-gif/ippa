import { NextRequest, NextResponse } from 'next/server';
import { isControlRouteError, requirePlatformUser } from '@/lib/http/controlRoute';
import { getStripeClient } from '@/payments/providers/stripe/client';

type StripePlatformAccount = {
  id: string;
  business_profile?: { name?: string | null } | null;
  country?: string | null;
  capabilities?: { transfers?: 'active' | 'inactive' | 'pending' | null } | null;
};

type StripePlatformClient = {
  accounts: { retrieve: () => Promise<unknown> };
};

export type StripePlatformStatus =
  | { configured: false }
  | { configured: true; available: false }
  | {
      configured: true;
      available: true;
      mode: 'test' | 'live';
      accountId: string;
      displayName: string | null;
      country: string | null;
      connectEnabled: boolean;
    };

export async function readStripePlatformStatus(
  client: StripePlatformClient | null = getStripeClient() as StripePlatformClient | null,
): Promise<StripePlatformStatus> {
  if (!client) return { configured: false };

  try {
    // A API v1 permite consultar, sem ID, a conta dona da chave da plataforma.
    // A API Accounts v2 exige o ID de uma connected account e não serve aqui.
    const account = await client.accounts.retrieve() as StripePlatformAccount;
    const secretKey = String(process.env.STRIPE_SECRET_KEY ?? '').trim();
    return {
      configured: true,
      available: true,
      mode: secretKey.startsWith('sk_live_') ? 'live' : 'test',
      accountId: account.id,
      displayName: account.business_profile?.name ?? null,
      country: account.country ?? null,
      connectEnabled: account.capabilities?.transfers === 'active',
    };
  } catch {
    return { configured: true, available: false };
  }
}

export async function GET(request: NextRequest) {
  const user = await requirePlatformUser(request);
  if (isControlRouteError(user)) return user;
  return NextResponse.json(await readStripePlatformStatus());
}
