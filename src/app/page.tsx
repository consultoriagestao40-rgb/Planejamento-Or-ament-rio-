import { getAuthUrl } from '@/lib/contaazul';
import { prisma } from '@/lib/prisma';
import dynamicImport from 'next/dynamic';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

const Loading = () => (
  <main className="dashboard-loading-screen">
    <style>{`
      .dashboard-loading-screen {
        width: 100%;
        min-height: 100vh;
        background-color: var(--bg-base);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
      }
      .dashboard-loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }
      .dashboard-loading-text {
        font-size: 0.90rem;
        font-weight: 700;
      }
    `}</style>
    <div className="dashboard-loading-container">
      <div className="spinner" />
      <span className="dashboard-loading-text">Carregando Painel...</span>
    </div>
  </main>
);

const FinancialDashboard = dynamicImport(
  () => import('@/components/FinancialDashboard'),
  { 
    ssr: false,
    loading: Loading
  }
);

export const dynamic = 'force-dynamic';
export const revalidate = 0;


import { ensureTenantSchema } from '@/lib/db-utils';

export default async function Home({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  await ensureTenantSchema();
  const params = await searchParams;
  const state = Math.random().toString(36).substring(7);
  const authUrl = getAuthUrl(state);
  const tenant = await prisma.tenant.findFirst();
  const tenantCount = tenant ? 1 : 0;
  // V31: Apenas mostramos conectado se REALMENTE houver um tenant no banco.
  // Ignoramos o parâmetro 'connected=true' da URL se o banco estiver vazio.
  const isConnected = tenantCount > 0;
  const isTestMode = tenant?.accessToken === 'test-token';

  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  let userRole = 'GESTOR';
  if (token) {
    const payload = await verifyToken(token);
    if (payload && payload.role) {
      userRole = payload.role as string;
    }
  }

  return (
    <FinancialDashboard
      isConnected={isConnected}
      isTestMode={isTestMode}
      authUrl={authUrl}
      params={params}
      serverUserRole={userRole}
    />
  );
}
