import { BudgetGrid } from '@/components/BudgetGrid';
import { getAuthUrl } from '@/lib/contaazul';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function Home({ searchParams }: { searchParams: Promise<{ connected?: string }> }) {
  const params = await searchParams;
  // Generate a random state for security (simulated for now)
  const state = Math.random().toString(36).substring(7);
  const authUrl = getAuthUrl(state);

  // Check if we have any tenants
  const tenantCount = await prisma.tenant.count();
  const isConnected = tenantCount > 0 || params.connected === 'true';

  return (
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: 'hsl(var(--primary))' }}>Dashboard Financeiro</h1>
        <p className="text-muted">Visão Consolidada Orçado x Realizado</p>
      </header>

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
          border: '1px solid hsl(var(--green-500, #22c55e))',
          borderRadius: 'var(--radius)',
          backgroundColor: 'hsl(var(--green-50, #f0fdf4))',
          marginBottom: '2rem',
          color: '#15803d'
        }}>
          <strong>✅ Empresa Conectada com Sucesso!</strong>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>Os dados estão prontos para serem sincronizados.</p>
        </div>
      )}

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Planejamento Orçamentário</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <select style={{ padding: '0.5rem', borderRadius: 'var(--radius)', borderColor: 'hsl(var(--border))' }}>
            <option>Todas as Empresas (Consolidado)</option>
            <option>Empresa A</option>
            <option>Empresa B</option>
          </select>
          <select style={{ padding: '0.5rem', borderRadius: 'var(--radius)', borderColor: 'hsl(var(--border))' }}>
            <option>2024</option>
            <option>2025</option>
          </select>
        </div>

        <BudgetGrid />
      </section>
    </main>
  )
}
