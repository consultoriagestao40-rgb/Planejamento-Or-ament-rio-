'use client';

import React, { useState } from 'react';
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

    const triggerRefresh = () => {
        console.log('Refreshing grid...');
        setRefreshKey(prev => prev + 1);
    };

    return (
        <main style={{ width: '100%', padding: '2rem 4rem', boxSizing: 'border-box' }}>
            <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ color: 'hsl(var(--primary))' }}>Dashboard Financeiro</h1>
                    <p className="text-muted">Visão Consolidada Orçado x Realizado</p>
                </div>
                {isConnected && <SyncButton onSyncComplete={triggerRefresh} />}
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
                    color: isTestMode ? '#854d0e' : '#15803d',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <strong>{isTestMode ? '⚠️ Conexão de Teste (Fake)' : '✅ Empresa Conectada com Sucesso!'}</strong>
                        <p style={{ margin: 0, fontSize: '0.875rem' }}>
                            {isTestMode
                                ? 'Este é apenas um registro de teste. Para conectar na Conta Azul, clique em "Limpar Banco" e depois conecte a empresa real.'
                                : 'Os dados estão prontos para serem sincronizados.'
                            }
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            if (confirm('Tem certeza que deseja desconectar? Isso exigirá login novamente na Conta Azul.')) {
                                await fetch('/api/auth/disconnect', { method: 'POST' });
                                window.location.reload();
                            }
                        }}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: 'white',
                            border: '1px solid currentColor',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            color: 'inherit'
                        }}
                    >
                        Desconectar / Trocar Conta
                    </button>
                </div>
            )}

            <section style={{ marginBottom: '2rem' }}>
                <h2 style={{ marginBottom: '1rem' }}>Previsto x Realizado</h2>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    {/* Filters */}
                </div>
                <BudgetGrid refreshKey={refreshKey} />
            </section>


        </main>
    );
}
