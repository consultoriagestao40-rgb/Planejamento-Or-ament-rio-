'use client';

import React, { useState, useEffect } from 'react';
import BudgetGrid from '@/components/BudgetGrid';
import { SyncButton } from '@/components/SyncButton';

interface FinancialDashboardProps {
    isConnected: boolean;
    isTestMode: boolean;
    authUrl: string;
    params: { connected?: string; error?: string };
    serverUserRole?: string;
}

export default function FinancialDashboard({
    isConnected,
    isTestMode,
    authUrl,
    params,
    serverUserRole
}: FinancialDashboardProps) {
    const [refreshKey, setRefreshKey] = useState(0);
    const [companies, setCompanies] = useState<any[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showAV, setShowAV] = useState(false);
    const [showAH, setShowAH] = useState(false);
    const [showAR, setShowAR] = useState(false);
    const [userRole, setUserRole] = useState<'MASTER' | 'GESTOR'>((serverUserRole as 'MASTER' | 'GESTOR') || 'GESTOR');

    useEffect(() => {
        if (isConnected) {
            fetch('/api/companies')
                .then(res => res.json())
                .then(data => {
                    if (data.success) setCompanies(data.companies);
                })
                .catch(console.error);
        }
    }, [isConnected, refreshKey]);

    const triggerRefresh = () => {
        setIsSyncing(false);
        setRefreshKey(prev => prev + 1);
    };

    const handleDisconnect = async (tenantId: string, companyName: string) => {
        if (confirm(`Tem certeza que deseja desconectar a empresa ${companyName}?`)) {
            await fetch('/api/auth/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId })
            });
            window.location.reload();
        }
    };

    return (
        <main style={{ width: '100%', minHeight: '100vh', backgroundColor: '#f8fafc', padding: '2rem 4rem', boxSizing: 'border-box' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h1 style={{ color: 'hsl(var(--primary))', margin: 0 }}>Budget Hub</h1>
                    {userRole === 'MASTER' && (
                        <a href="/users" style={{ padding: '0.4rem 0.8rem', backgroundColor: '#e2e8f0', color: '#334155', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', transition: 'background 0.2s', marginLeft: '1rem' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#cbd5e1'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}>
                            🪪 Usuários
                        </a>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {isConnected && companies.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {companies.map(c => (
                                <div key={c.id} style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.25rem 0.75rem',
                                    backgroundColor: 'hsl(var(--muted))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '16px',
                                    fontSize: '0.75rem',
                                    fontWeight: 500
                                }}>
                                    <span style={{ color: 'hsl(var(--foreground))' }}>{c.name}</span>
                                    <button
                                        onClick={() => handleDisconnect(c.id, c.name)}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                            color: 'hsl(var(--destructive))', fontSize: '1rem', lineHeight: 1
                                        }}
                                        title="Desconectar empresa"
                                    >×</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {isConnected && (
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <a
                                href={authUrl}
                                style={{
                                    padding: '0.5rem 1rem',
                                    height: '36px',
                                    backgroundColor: '#2563eb',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: 'white',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    whiteSpace: 'nowrap',
                                    textDecoration: 'none'
                                }}
                            >
                                + Adicionar Empresa
                            </a>
                            <SyncButton onSyncStart={() => setIsSyncing(true)} onSyncComplete={triggerRefresh} />

                            <button
                                onClick={async () => {
                                    await fetch('/api/auth/logout', { method: 'POST' });
                                    window.location.href = '/login';
                                }}
                                style={{ marginLeft: '0.5rem', padding: '0.4rem 0.8rem', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fecaca'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                            >
                                Sair
                            </button>
                        </div>
                    )}
                </div>
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
            ) : null}

            <section style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '1rem' }}>
                    <h2 style={{ margin: 0 }}>Previsto x Realizado</h2>
                    {isConnected && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                <input type="checkbox" checked={showAV} onChange={(e) => setShowAV(e.target.checked)} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                                AV
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                <input type="checkbox" checked={showAH} onChange={(e) => setShowAH(e.target.checked)} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                                AH (O x R)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                <input type="checkbox" checked={showAR} onChange={(e) => setShowAR(e.target.checked)} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                                Radar (R x R)
                            </label>
                        </div>
                    )}
                </div>
                <BudgetGrid
                    refreshKey={refreshKey}
                    isExternalLoading={isSyncing}
                    showAV={showAV}
                    setShowAV={setShowAV}
                    showAH={showAH}
                    setShowAH={setShowAH}
                    showAR={showAR}
                    setShowAR={setShowAR}
                    userRole={userRole}
                    setUserRole={setUserRole}
                />
            </section>

        </main>
    );
}
