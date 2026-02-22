import { getAuthUrl } from '@/lib/contaazul';
import { prisma } from '@/lib/prisma';
import FinancialDashboard from '@/components/FinancialDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const params = await searchParams;
  const state = Math.random().toString(36).substring(7);
  const authUrl = getAuthUrl(state);
  const tenant = await prisma.tenant.findFirst();
  const tenantCount = tenant ? 1 : 0;
  // V31: Apenas mostramos conectado se REALMENTE houver um tenant no banco.
  // Ignoramos o parâmetro 'connected=true' da URL se o banco estiver vazio.
  const isConnected = tenantCount > 0;
  const isTestMode = tenant?.accessToken === 'test-token';


  return (
    <FinancialDashboard
      isConnected={isConnected}
      isTestMode={isTestMode}
      authUrl={authUrl}
      params={params}
    />
  );
}
