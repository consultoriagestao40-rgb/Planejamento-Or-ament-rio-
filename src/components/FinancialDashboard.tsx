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
    const [showAH_MoM, setShowAH_MoM] = useState(false);
    const [showAR, setShowAR] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
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

    const handleRename = async (tenantId: string, currentName: string) => {
        const newName = prompt(`Digite o novo nome para a empresa "${currentName}":`, currentName);
        if (newName && newName.trim() !== '' && newName !== currentName) {
            try {
                const res = await fetch(`/api/companies/${tenantId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName.trim() })
                });
                if (res.ok) {
                    triggerRefresh();
                } else {
                    const data = await res.json();
                    alert(`Erro ao salvar: ${data.error}`);
                }
            } catch (err) {
                alert('Erro na requisição para renomear.');
            }
        }
    };

    return (
        <main style={{
            width: '100%',
            minHeight: '100vh',
            backgroundColor: 'var(--bg-base)',
            padding: '0 0 3rem',
            boxSizing: 'border-box'
        }}>
            {/* ─── HEADER ─────────────────────────────────── */}
            <header style={{
                position: 'sticky',
                top: 0,
                zIndex: 40,
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(20px)',
                borderBottom: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-card)',
            }}>
                <div style={{
                    maxWidth: '1600px',
                    margin: '0 auto',
                    padding: '0 2.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0',
                }}>
                    {/* Row 1 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '56px', gap: '1rem' }}>
                        {/* Left: Brand + Year */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <span className="brand-text">Budget Hub</span>

                            {isConnected && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    {/* Year Selector */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '8px',
                                        padding: '0 0.5rem',
                                        height: '34px',
                                        userSelect: 'none'
                                    }}>
                                        <button 
                                            onClick={() => setSelectedYear(prev => prev - 1)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0 0.4rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}
                                            className="hover-opacity"
                                            title="Ano Anterior"
                                        >
                                            ◀
                                        </button>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', minWidth: '45px', textAlign: 'center', fontFamily: 'monospace' }}>
                                            {selectedYear}
                                        </span>
                                        <button 
                                            onClick={() => setSelectedYear(prev => prev + 1)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0 0.4rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}
                                            className="hover-opacity"
                                            title="Próximo Ano"
                                        >
                                            ▶
                                        </button>
                                    </div>

                                    <SyncButton onSyncStart={() => setIsSyncing(true)} onSyncComplete={triggerRefresh} year={selectedYear} />

                                    <a href="/summary" className="btn btn-secondary" style={{ height: '34px', fontSize: '0.78rem' }}>
                                        📋 Resumo por CC
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* Right: Nav Links */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {userRole === 'MASTER' && (
                                <>
                                    <a href="/users" className="btn btn-secondary" style={{ height: '34px', fontSize: '0.78rem' }}>
                                        🪪 Usuários
                                    </a>
                                    <a href="/radar" className="btn btn-secondary" style={{ height: '34px', fontSize: '0.78rem' }}>
                                        🎯 Gestão de Radar
                                    </a>
                                    <a href={authUrl} className="btn btn-primary" style={{ height: '34px', fontSize: '0.78rem' }}>
                                        ➕ Conectar Empresa
                                    </a>
                                    <div style={{ width: '1px', height: '24px', background: 'var(--border-default)', margin: '0 0.25rem' }} />
                                </>
                            )}
                            <button
                                onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}
                                className="btn btn-danger"
                                style={{ height: '34px', fontSize: '0.78rem' }}
                            >
                                Sair
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Company Chips */}
                    {isConnected && companies.length > 0 && (
                        <div style={{
                            display: 'flex',
                            gap: '0.4rem',
                            flexWrap: 'wrap',
                            padding: '0.75rem 0',
                            borderTop: '1px solid var(--border-subtle)',
                        }}>
                            {companies.map(c => (
                                <div key={c.id} className="chip">
                                    <span>{c.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            {/* ─── BODY ────────────────────────────────────── */}
            <div style={{ maxWidth: '100%', margin: '0 auto', padding: '1.5rem 2rem 0' }}>
                {params.error && (
                    <div style={{
                        padding: '1rem 1.25rem',
                        borderRadius: '10px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        marginBottom: '1.5rem',
                        fontSize: '0.875rem'
                    }}>
                        <strong>Erro na Conexão:</strong> {params.error}
                    </div>
                )}

                {!isConnected ? (
                    <div style={{
                        padding: '3rem',
                        borderRadius: '16px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-default)',
                        boxShadow: 'var(--shadow-card)',
                        marginBottom: '2rem',
                        textAlign: 'center',
                        maxWidth: '480px',
                        margin: '3rem auto'
                    }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔗</div>
                        <h2 style={{ marginBottom: '0.75rem' }}>Conecte sua empresa</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                            Conecte seus CNPJs para sincronizar os dados realizados do Conta Azul.
                        </p>
                        {userRole === 'MASTER' && (
                            <a href={authUrl} className="btn btn-primary" style={{ fontSize: '0.9rem', padding: '0.65rem 1.5rem' }}>
                                ➕ Conectar Nova Empresa
                            </a>
                        )}
                    </div>
                ) : null}

                {/* DRE Section */}
                <section>
                    <BudgetGrid
                        refreshKey={refreshKey}
                        isExternalLoading={isSyncing}
                        showAV={showAV}
                        setShowAV={setShowAV}
                        showAH={showAH}
                        setShowAH={setShowAH}
                        showAH_MoM={showAH_MoM}
                        setShowAH_MoM={setShowAH_MoM}
                        showAR={showAR}
                        setShowAR={setShowAR}
                        userRole={userRole}
                        setUserRole={setUserRole}
                        companies={companies}
                        externalYear={selectedYear}
                    />
                </section>
            </div>
        </main>
    );
}
