'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
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
    const [activeTab, setActiveTab] = useState<'visao' | 'graficos' | 'kpi'>('visao');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const storedTab = localStorage.getItem('dashboardActiveTab');
        if (storedTab === 'visao' || storedTab === 'graficos' || storedTab === 'kpi') {
            setActiveTab(storedTab as 'visao' | 'graficos' | 'kpi');
        }
    }, []);

    useEffect(() => {
        if (isConnected) {
            fetch('/api/companies')
                .then(res => res.json())
                .then(data => {
                    if (data.success) setCompanies(data.companies || []);
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
            padding: '1.25rem 1.5rem 2rem',
            boxSizing: 'border-box'
        }}>
            {/* Mockup Header Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '1rem', background: '#0f62ac', padding: '0.5rem 1.25rem', borderRadius: '12px', border: '1px solid #0b579f', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' }}>
                    {/* Left side: Tabs & Year Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(255, 255, 255, 0.15)', padding: '3px', borderRadius: '8px', height: '34px', boxSizing: 'border-box' }}>
                            <button 
                                onClick={() => {
                                    setActiveTab('visao');
                                    localStorage.setItem('dashboardActiveTab', 'visao');
                                }} 
                                style={{ 
                                    padding: '0 1rem', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 700,
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.4rem', 
                                    border: 'none', 
                                    borderRadius: '6px', 
                                    cursor: 'pointer', 
                                    height: '28px',
                                    background: activeTab === 'visao' ? '#ffffff' : 'transparent',
                                    color: activeTab === 'visao' ? '#0f62ac' : 'rgba(255, 255, 255, 0.8)',
                                    boxShadow: activeTab === 'visao' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
                                Visão Geral
                            </button>
                            <button 
                                onClick={() => {
                                    setActiveTab('graficos');
                                    localStorage.setItem('dashboardActiveTab', 'graficos');
                                }} 
                                style={{ 
                                    padding: '0 1rem', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 700,
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.4rem', 
                                    border: 'none', 
                                    borderRadius: '6px', 
                                    cursor: 'pointer', 
                                    height: '28px',
                                    background: activeTab === 'graficos' ? '#ffffff' : 'transparent',
                                    color: activeTab === 'graficos' ? '#0f62ac' : 'rgba(255, 255, 255, 0.8)',
                                    boxShadow: activeTab === 'graficos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
                                Indicadores
                            </button>
                            <button 
                                onClick={() => {
                                    setActiveTab('kpi');
                                    localStorage.setItem('dashboardActiveTab', 'kpi');
                                }} 
                                style={{ 
                                    padding: '0 1rem', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 700,
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.4rem', 
                                    border: 'none', 
                                    borderRadius: '6px', 
                                    cursor: 'pointer', 
                                    height: '28px',
                                    background: activeTab === 'kpi' ? '#ffffff' : 'transparent',
                                    color: activeTab === 'kpi' ? '#0f62ac' : 'rgba(255, 255, 255, 0.8)',
                                    boxShadow: activeTab === 'kpi' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                                KPI
                            </button>
                        </div>

                        {isConnected && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 0.5rem', height: '34px', userSelect: 'none', marginLeft: '0.5rem' }}>
                                <button 
                                    onClick={() => setSelectedYear(prev => prev - 1)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '0 0.3rem', color: '#64748b' }}
                                    title="Ano Anterior"
                                >
                                    ◀
                                </button>
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', minWidth: '40px', textAlign: 'center', fontFamily: 'monospace' }}>
                                    {selectedYear}
                                </span>
                                <button 
                                    onClick={() => setSelectedYear(prev => prev + 1)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '0 0.3rem', color: '#64748b' }}
                                    title="Próximo Ano"
                                >
                                    ▶
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Center: Search input */}
                    <div style={{ display: 'flex', justifyContent: 'center', flex: 1, minWidth: '220px', maxWidth: '360px' }}>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}>🔍</span>
                            <input 
                                type="text" 
                                placeholder="Busca..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ width: '100%', padding: '0.45rem 1rem 0.45rem 2.25rem', fontSize: '0.8rem', borderRadius: '9999px', border: '1px solid #e2e8f0', background: '#ffffff', outline: 'none', color: '#0f172a', transition: 'border 0.2s' }}
                            />
                        </div>
                    </div>


                </div>
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
                        searchQuery={searchQuery}
                        activeTab={activeTab}
                    />
                </section>
        </main>
    );
}
