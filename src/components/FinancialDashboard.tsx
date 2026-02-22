'use client';

import React, { useState, useEffect } from 'react';
import BudgetGrid from '@/components/BudgetGrid';
import { SyncButton } from '@/components/SyncButton';

interface FinancialDashboardProps {
    isConnected: boolean;
    isTestMode: boolean;
    authUrl: string;
    params: { connected?: string; error?: string };
}

export default function FinancialDashboard({
    isConnected,
    isTestMode,
    authUrl,
    params
}: FinancialDashboardProps) {
    const [refreshKey, setRefreshKey] = useState(0);
    const [companies, setCompanies] = useState<any[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

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
        <main style={{ width: '100%', padding: '2rem 4rem', boxSizing: 'border-box' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ color: 'hsl(var(--primary))', margin: 0 }}>Budget Hub</h1>
                    {isConnected && companies.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
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
                </div>

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
                    </div>
                )}
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
                <h2 style={{ marginBottom: '1rem' }}>Previsto x Realizado</h2>
                <BudgetGrid refreshKey={refreshKey} isExternalLoading={isSyncing} />
            </section>

        </main>
    );
}
