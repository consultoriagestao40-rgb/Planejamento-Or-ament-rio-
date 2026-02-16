import { getAuthUrl } from '@/lib/contaazul';
import { prisma } from '@/lib/prisma';
import FinancialDashboard from '@/components/FinancialDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const params = await searchParams;
  const state = Math.random().toString(36).substring(7);
  const authUrl = getAuthUrl(state);
  const isDev = process.env.NODE_ENV === 'development';

  const tenant = await prisma.tenant.findFirst();
  const tenantCount = tenant ? 1 : 0;
  // V31: Apenas mostramos conectado se REALMENTE houver um tenant no banco.
  // Ignoramos o parâmetro 'connected=true' da URL se o banco estiver vazio.
  const isConnected = tenantCount > 0;
  const isTestMode = tenant?.accessToken === 'test-token';

  const envInfo = {
    clientId: process.env.CONTA_AZUL_CLIENT_ID
      ? `${process.env.CONTA_AZUL_CLIENT_ID.substring(0, 4)}...${process.env.CONTA_AZUL_CLIENT_ID.slice(-4)}`
      : '❌',
    clientSecret: process.env.CONTA_AZUL_CLIENT_SECRET
      ? `${process.env.CONTA_AZUL_CLIENT_SECRET.substring(0, 4)}...${process.env.CONTA_AZUL_CLIENT_SECRET.slice(-4)}`
      : '❌',
    redirectUri: process.env.CONTA_AZUL_REDIRECT_URI || '',
    dbUrl: !!process.env.POSTGRES_PRISMA_URL
  };

  return (
    <FinancialDashboard
      isConnected={isConnected}
      isTestMode={isTestMode}
      authUrl={authUrl}
      tenantCount={tenantCount}
      params={params}
      envInfo={envInfo}
      isDev={isDev}
    />
  );
}
