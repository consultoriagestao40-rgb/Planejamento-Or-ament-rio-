import { BudgetGrid } from '@/components/BudgetGrid';
import { getAuthUrl } from '@/lib/contaazul';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { SyncButton } from '@/components/SyncButton';
import { TestDbButton } from '@/components/TestDbButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const params = await searchParams;
  const state = Math.random().toString(36).substring(7);
  const authUrl = getAuthUrl(state);

  const tenant = await prisma.tenant.findFirst();
  const tenantCount = tenant ? 1 : 0;
  const isConnected = tenantCount > 0 || params.connected === 'true';
  const isTestMode = tenant?.accessToken === 'test-token';

  return (
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'hsl(var(--primary))' }}>Dashboard Financeiro</h1>
          <p className="text-muted">Visão Consolidada Orçado x Realizado</p>
        </div>
        {isConnected && <SyncButton />}
      </header>

      {params.error && (
        <div style={{
          padding: '1rem',
          border: '1px solid hsl(var(--destructive))',
          borderRadius: 'var(--radius)',
          backgroundColor: '#fef2f2',
          color: '#991b1b',
          marginBottom: '2rem'
        }}>
          <strong>Erro na Conexão:</strong> {params.error}
        </div>
      )}

      {!isConnected ? (
        <div style={{
          padding: '2rem',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--radius)',
          backgroundColor: 'hsl(var(--card))',
          marginBottom: '2rem'
        }}>
          <h2>Conexão</h2>
          <p style={{ marginBottom: '1rem' }}>Conecte suas empresas (CNPJs) para sincronizar os dados realizados.</p>
          <a
            href={authUrl}
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              borderRadius: 'var(--radius)',
              textDecoration: 'none',
              fontWeight: 500
            }}>
            Conectar Nova Empresa (Conta Azul)
          </a>
        </div>
      ) : (
        <div style={{
          padding: '1rem',
          border: '1px solid ' + (isTestMode ? '#eab308' : 'hsl(var(--green-500, #22c55e))'),
          borderRadius: 'var(--radius)',
          backgroundColor: isTestMode ? '#fefce8' : 'hsl(var(--green-50, #f0fdf4))',
          marginBottom: '2rem',
          color: isTestMode ? '#854d0e' : '#15803d'
        }}>
          <strong>{isTestMode ? '⚠️ Conexão de Teste (Fake)' : '✅ Empresa Conectada com Sucesso!'}</strong>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            {isTestMode
              ? 'Este é apenas um registro de teste. Para conectar na Conta Azul, clique em "Limpar Banco" e depois conecte a empresa real.'
              : 'Os dados estão prontos para serem sincronizados.'
            }
          </p>
        </div>
      )}

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Planejamento Orçamentário</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          {/* Filters */}
        </div>
        <BudgetGrid />
      </section>

      {/* DEBUG PANEL - REMOVER DEPOIS */}
      <div style={{ marginTop: '4rem', padding: '1rem', background: '#f5f5f5', fontSize: '0.8rem', border: '1px dashed #999', opacity: 0.8, wordBreak: 'break-all' }}>
        <h3>🔧 Painel de Diagnóstico</h3>
        <p><strong>DB Tenant Count:</strong> {tenantCount}</p>
        <p><strong>URL Params:</strong> {JSON.stringify(params)}</p>
        <p><strong>Render Time:</strong> {new Date().toLocaleTimeString()}</p>
        <p><strong>Generated Link:</strong> {authUrl}</p>
        <p><strong>Env Vars Check:</strong></p>
        <ul style={{ paddingLeft: '1rem' }}>
          <li>
            CLIENT_ID: {process.env.CONTA_AZUL_CLIENT_ID
              ? <span title={process.env.CONTA_AZUL_CLIENT_ID}>{process.env.CONTA_AZUL_CLIENT_ID.substring(0, 4)}...{process.env.CONTA_AZUL_CLIENT_ID.slice(-4)} ✅</span>
              : '❌'}
          </li>
          <li>
            CLIENT_SECRET: {process.env.CONTA_AZUL_CLIENT_SECRET
              ? <span>{process.env.CONTA_AZUL_CLIENT_SECRET.substring(0, 4)}...{process.env.CONTA_AZUL_CLIENT_SECRET.slice(-4)} ✅</span>
              : '❌'}
          </li>
          <li>
            REDIRECT_URI: "{process.env.CONTA_AZUL_REDIRECT_URI}"
          </li>
          <li>DB_URL: {process.env.POSTGRES_PRISMA_URL ? '✅' : '❌'}</li>
        </ul>
        <TestDbButton />

        <div style={{ marginTop: '1rem' }}>
          <a href="/api/auth/callback?code=TEST_MANUAL" target="_blank" style={{ color: '#666', textDecoration: 'underline' }}>
            🔗 Testar Rota de Callback (Direct Link)
          </a>
        </div>
      </div>
    </main>
  )
}
