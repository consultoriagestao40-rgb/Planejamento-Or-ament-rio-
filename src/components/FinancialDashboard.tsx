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
        <main style={{ width: '100%', minHeight: '100vh', backgroundColor: '#f8fafc', padding: '2rem 4rem', boxSizing: 'border-box' }}>
            <header style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', backgroundColor: '#fff', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {/* Linha 1: Título e Navegação Principal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                        <h1 style={{ color: '#2563eb', margin: 0, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.025em' }}>Budget Hub</h1>
                        
                        {isConnected && (
                            <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 0.75rem', height: '38px', transition: 'border-color 0.2s' }}>
                                    <span style={{ fontSize: '0.85rem', marginRight: '0.5rem', color: '#64748b' }}>📅</span>
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}
                                    >
                                        {[2024, 2025, 2026, 2027, 2028].map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                                <SyncButton onSyncStart={() => setIsSyncing(true)} onSyncComplete={triggerRefresh} year={selectedYear} />
                                <a href="/summary" style={{ padding: '0 1rem', height: '38px', backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e2e8f0'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}>📋 Resumo por CC</a>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {userRole === 'MASTER' && (
                            <div style={{ display: 'flex', gap: '0.5rem', borderRight: '2px solid #e2e8f0', paddingRight: '1rem' }}>
                                <a href="/users" style={{ padding: '0 0.75rem', height: '38px', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', borderRadius: '8px', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>🪪 Usuários</a>
                                <a href="/radar" style={{ padding: '0 0.75rem', height: '38px', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', borderRadius: '8px', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>🎯 Gestão de Radar</a>
                                <a href={authUrl} style={{ padding: '0 1rem', height: '38px', backgroundColor: '#2563eb', color: '#fff', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', borderRadius: '8px', boxShadow: '0 2px 4px rgba(37,99,235,0.2)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}>➕ Conectar Empresa</a>
                            </div>
                        )}
                        <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }} style={{ padding: '0 1rem', height: '38px', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fecaca'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}>Sair</button>
                    </div>
                </div>

                {/* Linha 2: Empresas Conectadas */}
                {isConnected && companies.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                        {companies.map(c => (
                            <div key={c.id} style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.35rem 0.85rem',
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '16px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: '#334155'
                            }}>
                                <span>{c.name}</span>
                                {userRole === 'MASTER' && (
                                    <>
                                        <button onClick={() => handleRename(c.id, c.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.2rem', color: '#94a3b8', fontSize: '0.8rem', outline: 'none' }} title="Renomear">✏️</button>
                                        <button onClick={() => handleDisconnect(c.id, c.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.2rem', color: '#ef4444', fontSize: '1.2rem', lineHeight: '10px', outline: 'none' }} title="Desconectar empresa">×</button>
                                    </>
                                )}
                            </div>
                        ))}
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
                    {userRole === 'MASTER' && (
                        <a
                            href={authUrl}
                            style={{
                                display: 'inline-block',
                                padding: '0.5rem 1rem',
                                backgroundColor: 'hsl(var(--primary))',
                                color: 'hsl(var(--primary-foreground))',
                                borderRadius: 'var(--radius)',
                                textDecoration: 'none',
                                fontWeight: 600,
                                marginTop: '1rem'
                            }}>
                            ➕ Conectar Nova Empresa (Conta Azul)
                        </a>
                    )}
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
                                <input type="checkbox" checked={showAH_MoM} onChange={(e) => setShowAH_MoM(e.target.checked)} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                                AH (R x Rant)
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

        </main>
    );
}
