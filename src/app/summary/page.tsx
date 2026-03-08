'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { SyncButton } from '@/components/SyncButton';

interface SummaryItem {
    tenantId: string;
    tenantName: string;
    costCenterId: string;
    costCenterName: string;
    totalRevenue: number;
    totalExpense: number;
    hasBudgetData: boolean;
    hasRealizedData: boolean;
    isLocked: boolean;
    status: string;
    n1ApprovedBy: string | null;
    n1ApprovedAt: string | null;
    n2ApprovedBy: string | null;
    n2ApprovedAt: string | null;
    currentUserAccessLevel: string;
}




interface TenantGroup {
    tenantId: string;
    tenantName: string;
    totalRevenue: number;
    totalExpense: number;
    hasBudget: boolean;
    finishedCount: number;
    totalCount: number;
    costCenters: SummaryItem[];
}

export default function BudgetSummaryPage() {
    const [data, setData] = useState<SummaryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [expandedTenants, setExpandedTenants] = useState<Set<string>>(new Set());
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isTogglingLock, setIsTogglingLock] = useState<string | null>(null);
    const [selectedForAudit, setSelectedForAudit] = useState<SummaryItem | null>(null);
    const [auditActionLoading, setAuditActionLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [summaryRes, authRes] = await Promise.all([
                fetch(`/api/cost-centers/summary?year=${selectedYear}`),
                fetch('/api/auth/me')
            ]);
            
            const [summaryResult, authResult] = await Promise.all([
                summaryRes.json(),
                authRes.json()
            ]);

            if (summaryResult.success) {
                setData(summaryResult.data);
            }
            if (authResult.success) {
                setUserRole(authResult.user.role);
            }
        } catch (e: any) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);


    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const groupedData = useMemo(() => {
        const groups = new Map<string, TenantGroup>();

        data.forEach(item => {
            if (!groups.has(item.tenantId)) {
                groups.set(item.tenantId, {
                    tenantId: item.tenantId,
                    tenantName: item.tenantName,
                    totalRevenue: 0,
                    totalExpense: 0,
                    hasBudget: false,
                    finishedCount: 0,
                    totalCount: 0,
                    costCenters: []
                });
            }
            const group = groups.get(item.tenantId)!;
            group.totalRevenue += item.totalRevenue;
            group.totalExpense += item.totalExpense;
            group.totalCount++;
            if (item.hasBudgetData) group.finishedCount++;
            group.costCenters.push(item);

        });

        groups.forEach(group => {
            group.hasBudget = group.finishedCount === group.totalCount;
            group.costCenters.sort((a, b) => a.costCenterName.localeCompare(b.costCenterName));
        });

        const sortedGroups = Array.from(groups.values()).sort((a, b) => a.tenantName.localeCompare(b.tenantName));

        if (searchTerm) {
            const lowTerm = searchTerm.toLowerCase();
            return sortedGroups.filter(group => {
                const matchesTenant = group.tenantName.toLowerCase().includes(lowTerm);
                const hasMatchingCC = group.costCenters.some(cc =>
                    cc.costCenterName.toLowerCase().includes(lowTerm)
                );
                return matchesTenant || hasMatchingCC;
            }).map(group => {
                const filteredCCs = group.costCenters.filter(cc =>
                    cc.costCenterName.toLowerCase().includes(lowTerm) ||
                    group.tenantName.toLowerCase().includes(lowTerm)
                );
                return {
                    ...group,
                    costCenters: filteredCCs
                };
            });
        }

        return sortedGroups;
    }, [data, searchTerm]);

    const toggleTenant = (id: string) => {
        setExpandedTenants(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleApprovalAction = async (action: string) => {
        if (!selectedForAudit) return;
        setAuditActionLoading(true);
        try {
            const res = await fetch('/api/cost-centers/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: selectedForAudit.tenantId,
                    costCenterId: selectedForAudit.costCenterId,
                    year: selectedYear,
                    action
                })
            });
            const result = await res.json();
            if (result.success) {
                // Refresh data
                await fetchData();
                setSelectedForAudit(null);
            } else {
                alert(result.error || 'Erro na aprovação');
            }
        } catch (e) {
            alert('Erro de conexão.');
        } finally {
            setAuditActionLoading(false);
        }
    };

    const toggleLockStatus = async (cc: SummaryItem, currentLockState: boolean) => {
        if (!userRole) return;
        // Only Master or specific roles can toggle lock directly
        const access = cc.currentUserAccessLevel;
        const canLock = userRole === 'MASTER' || ['APROVADOR_N1', 'APROVADOR_N2', 'APROVADOR_N1_N2'].includes(access);
        
        if (!canLock) {
            alert('Você não tem permissão para alterar o bloqueio deste orçamento.');
            return;
        }

        setIsTogglingLock(cc.costCenterId);
        try {
            const action = currentLockState ? 'REOPEN' : 'APPROVE_N2'; // Direto para approved/locked if bypassing N1
            
            // Usando endpoint dedicado se existir, simulando um toggle rápido passando as regras da API de aprovação
            // REOPEN destranca (coloca PENDING). APPROVE_N2 tranca (coloca APPROVED e isLocked=true). 
            // Se o usuário Master quiser só trancar sem passar por N1. Se der erro de regra de negócio, tentamos alertar.
            
            let fetchAction = currentLockState ? 'REOPEN' : 'APPROVE_N2';
            
            // Se tentar trancar e der erro de N2 (ex: n ta aguardando N2), Master pode só querer trancar.
            // O código na API de approve pode barrar. Vamos mandar uma requisição específica ou usar a que tem:
            
            const res = await fetch('/api/cost-centers/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: cc.tenantId,
                    costCenterId: cc.costCenterId,
                    year: selectedYear,
                    action: currentLockState ? 'REOPEN' : 'SUBMIT_N1' // Usar Submit N1 para trancar por garantias
                })
            });
            const result = await res.json();
            if (result.success) {
                await fetchData();
            } else {
                alert(result.error || 'Erro ao alterar bloqueio');
            }
        } catch (e) {
            console.error(e);
            alert('Erro de conexão ao alterar bloqueio.');
        } finally {
            setIsTogglingLock(null);
        }
    };

    const stats = useMemo(() => {
        const totalCCs = data.length;
        const withBudget = data.filter(i => i.hasBudgetData).length;
        const withoutBudget = totalCCs - withBudget;


        const totalRevenueBudgeted = data.reduce((acc, curr) => acc + curr.totalRevenue, 0);
        const totalExpenseBudgeted = data.reduce((acc, curr) => acc + curr.totalExpense, 0);
        const resultValue = totalRevenueBudgeted - totalExpenseBudgeted;
        const resultPercent = totalRevenueBudgeted !== 0 ? (resultValue / totalRevenueBudgeted) * 100 : 0;

        return {
            totalCCs, withBudget, withoutBudget,
            totalRevenueBudgeted, totalExpenseBudgeted,
            resultValue, resultPercent
        };
    }, [data]);

    const formatCurrency = (value: number) => {
        if (value === 0) return '-';
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2
        }).format(value);
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div className="spinner"></div>
                    <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Carregando resumo financeiro...</p>
                </div>
            </div>
        );
    }

    const th: React.CSSProperties = {
        background: 'var(--bg-surface)',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
        fontSize: '0.65rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        whiteSpace: 'nowrap'
    };
    const td: React.CSSProperties = {
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)'
    };
    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'Inter, system-ui, sans-serif', padding: '2.5rem 2rem' }}>
            <div className="container">

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.5rem' }}>
                    <div>
                        <h1 className="brand-text" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Resumo Consolidado</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Visão geral de orçamentos e centros de custo.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {userRole === 'MASTER' && (
                            <Link href="/radar" className="btn btn-primary" style={{ padding: '0.75rem 1.25rem' }}>
                                🎯 Gestão de Radar
                            </Link>
                        )}
                        <SyncButton year={selectedYear} onSyncStart={() => setLoading(true)} onSyncComplete={fetchData} />

                        <Link href="/" className="btn btn-secondary" style={{ padding: '0.75rem 1.25rem' }}>
                            ⬅️ Dashboard
                        </Link>
                    </div>
                </div>

                {/* KPI Section - Row 1: Operations */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div className="stat-card">
                        <p className="stat-label">Total de Unidades</p>
                        <p className="stat-value">{stats.totalCCs}</p>
                    </div>
                    <div className="stat-card">
                        <p className="stat-label" style={{ color: 'var(--accent-green)' }}>Digitados</p>
                        <p className="stat-value" style={{ color: 'var(--accent-green)' }}>{stats.withBudget}</p>
                    </div>
                    <div className="stat-card">
                        <p className="stat-label" style={{ color: 'var(--accent-red)' }}>Pendentes</p>
                        <p className="stat-value" style={{ color: 'var(--accent-red)' }}>{stats.withoutBudget}</p>
                    </div>
                    <div className="stat-card" style={{ borderStyle: 'dashed', borderColor: 'var(--border-strong)' }}>
                        <p className="stat-label">Ano Referência</p>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="premium-select"
                            style={{ 
                                width: '100%', 
                                border: 'none', 
                                background: 'transparent', 
                                fontSize: '1.5rem', 
                                fontWeight: 800, 
                                padding: 0, 
                                marginTop: '0.4rem',
                                color: 'var(--text-primary)'
                            }}
                        >
                            {[2024, 2025, 2026, 2027, 2028].map(y => (
                                <option key={y} value={y} style={{ background: 'var(--bg-elevated)' }}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* KPI Section - Row 2: Financials */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
                    <div className="stat-card" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                        <p className="stat-label" style={{ color: 'var(--accent-green)' }}>1. Receita Orçada</p>
                        <p className="stat-value" style={{ color: 'var(--accent-green)' }}>{formatCurrency(stats.totalRevenueBudgeted)}</p>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                        <p className="stat-label" style={{ color: 'var(--accent-red)' }}>2. Despesa Orçada</p>
                        <p className="stat-value" style={{ color: 'var(--accent-red)' }}>{formatCurrency(stats.totalExpenseBudgeted)}</p>
                    </div>
                    <div className="stat-card" style={{ borderLeft: '4px solid var(--accent-blue)' }}>
                        <p className="stat-label">3. Resultado</p>
                        <p className="stat-value">{formatCurrency(stats.resultValue)}</p>
                    </div>
                    <div className="stat-card" style={{ background: 'var(--gradient-brand)', border: 'none' }}>
                        <p className="stat-label" style={{ color: 'rgba(255,255,255,0.7)' }}>4. % Margem</p>
                        <p className="stat-value" style={{ color: '#fff' }}>{stats.resultPercent.toFixed(1)}%</p>
                    </div>
                </div>

                {/* Filter */}
                <div style={{
                    backgroundColor: 'var(--bg-card)',
                    padding: '1rem 1.5rem',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    marginBottom: '2rem',
                    boxShadow: 'var(--shadow-card)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <span style={{ fontSize: '1.25rem', opacity: 0.5 }}>🔍</span>
                    <input
                        type="text"
                        placeholder="Pesquisar organização ou centro de custo..."
                        className="premium-input"
                        style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '1rem', padding: 0, boxShadow: 'none' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Main Table */}
                <div className="glass-card" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="premium-table">
                            <thead>
                                <tr>
                                    <th style={{ ...th, textAlign: 'left', width: '400px' }}>Organização / Centro de Custo</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Receita Anual</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Despesa Anual</th>
                                    <th style={{ ...th, textAlign: 'center' }}>Progresso</th>
                                    <th style={{ ...th, textAlign: 'center', width: '80px' }} title="Trancar/Destrancar Orçamento">🔒 Cadeado</th>
                                    <th style={{ ...th, textAlign: 'center', width: '130px' }}>Ação / Status</th>
                                </tr>
                            </thead>

                            <tbody>
                                {groupedData.length > 0 ? groupedData.map((group) => {
                                    const isExpanded = expandedTenants.has(group.tenantId) || searchTerm !== '';
                                    const isComplete = group.finishedCount === group.totalCount;

                                    return (
                                        <React.Fragment key={group.tenantId}>
                                            <tr
                                                onClick={() => toggleTenant(group.tenantId)}
                                                style={{
                                                    background: 'var(--bg-elevated)',
                                                    cursor: 'pointer',
                                                    borderBottom: '1px solid var(--border-subtle)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                className="hover-row"
                                            >
                                                <td style={{ ...td, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '1rem' }}>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        color: 'var(--accent-blue)',
                                                        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                        opacity: 0.8
                                                    }}>▶</span>
                                                    {group.tenantName}
                                                </td>
                                                <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: group.totalRevenue > 0 ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                                                    {formatCurrency(group.totalRevenue)}
                                                </td>
                                                <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: group.totalExpense > 0 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                                                    {formatCurrency(group.totalExpense)}
                                                </td>
                                                <td style={{ ...td, textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '0.35rem 0.85rem',
                                                        borderRadius: '99px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: 800,
                                                        backgroundColor: isComplete ? 'var(--accent-green-glow)' : 'var(--accent-red-glow)',
                                                        color: isComplete ? 'var(--accent-green)' : 'var(--accent-red)',
                                                        border: `1px solid ${isComplete ? 'var(--accent-green-glow)' : 'var(--accent-red-glow)'}`,
                                                        display: 'inline-block',
                                                        minWidth: '110px',
                                                        letterSpacing: '0.02em'
                                                    }}>
                                                        {isComplete ? 'FINALIZADO' : `PENDENTE (${group.finishedCount}/${group.totalCount})`}
                                                    </span>
                                                </td>
                                                <td style={{ ...td, textAlign: 'center' }}>
                                                    {/* Company headers usually don't have a single lock, they are CC based */}
                                                    <span style={{ color: '#cbd5e1' }}>-</span>
                                                </td>
                                                <td style={{ ...td, textAlign: 'center' }}>
                                                    {/* Action column is empty at company level */}
                                                    <span style={{ color: '#cbd5e1' }}>-</span>
                                                </td>
                                            </tr>


                                            {isExpanded && group.costCenters.map((cc) => (
                                                <tr key={cc.costCenterId} className="cc-row" style={{ background: 'var(--bg-surface)' }}>
                                                    <td style={{ ...td, paddingLeft: '3.5rem', color: 'var(--text-secondary)', fontWeight: 500, padding: '0.75rem 1rem 0.75rem 3.5rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            {cc.costCenterName}
                                                            <Link
                                                                href={`/orcamento/${cc.costCenterId}?year=${selectedYear}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                title="Abrir tela de lançamento de orçamento"
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.3rem',
                                                                    padding: '0.25rem 0.65rem',
                                                                    borderRadius: '6px',
                                                                    background: 'rgba(59,130,246,0.08)',
                                                                    border: '1px solid rgba(59,130,246,0.2)',
                                                                    color: 'var(--accent-blue)',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    textDecoration: 'none',
                                                                    whiteSpace: 'nowrap',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                ✏️ Orçar
                                                            </Link>
                                                        </div>
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'right', color: cc.totalRevenue > 0 ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: 600 }}>
                                                        {formatCurrency(cc.totalRevenue)}
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'right', color: cc.totalExpense > 0 ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: 600 }}>
                                                        {formatCurrency(cc.totalExpense)}
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'center' }}>
                                                        {cc.hasBudgetData ? (
                                                            <span style={{ fontSize: '0.8rem', color: '#10b981' }}>✓ OK</span>
                                                        ) : (
                                                            <span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 700 }}>EM ABERTO</span>
                                                        )}
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {/* Botão de Trancar/Destrancar Rápido (Cadeado) */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleLockStatus(cc, cc.isLocked);
                                                                }}
                                                                disabled={isTogglingLock === cc.costCenterId}
                                                                title={cc.isLocked ? "Destrancar Orçamento" : "Trancar Orçamento"}
                                                                style={{
                                                                    background: cc.isLocked ? '#fee2e2' : '#dcfce3',
                                                                    border: `1px solid ${cc.isLocked ? '#fca5a5' : '#86efac'}`,
                                                                    borderRadius: '6px',
                                                                    padding: '0.4rem',
                                                                    cursor: isTogglingLock === cc.costCenterId ? 'wait' : 'pointer',
                                                                    color: cc.isLocked ? '#dc2626' : '#16a34a',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    transition: 'all 0.2s',
                                                                    opacity: isTogglingLock === cc.costCenterId ? 0.5 : 1
                                                                }}
                                                            >
                                                                {isTogglingLock === cc.costCenterId ? (
                                                                    <div style={{ width: '16px', height: '16px', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                                                ) : cc.isLocked ? (
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                                                    </svg>
                                                                ) : (
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                                                        <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>

                                                    {/* Coluna: Ação / Status */}
                                                    <td style={{ ...td, textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {/* Botão Detalhes/Aprovação */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedForAudit(cc);
                                                                }}
                                                                style={{
                                                                    background: cc.status === 'APPROVED' ? '#d1fae5' : cc.status === 'AWAITING_N2' ? '#fef08a' : cc.status === 'REJECTED' ? '#fee2e2' : '#f8fafc',
                                                                    border: `1px solid ${cc.status === 'APPROVED' ? '#34d399' : cc.status === 'AWAITING_N2' ? '#fde047' : cc.status === 'REJECTED' ? '#fca5a5' : '#e2e8f0'}`,
                                                                    borderRadius: '6px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    padding: '0.4rem 0.6rem',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.4rem',
                                                                    color: cc.status === 'APPROVED' ? '#065f46' : cc.status === 'AWAITING_N2' ? '#854d0e' : cc.status === 'REJECTED' ? '#991b1b' : '#475569',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                            >
                                                                {(() => {
                                                                    const access = cc.currentUserAccessLevel;
                                                                    const isMaster = userRole === 'MASTER' || access === 'MASTER';
                                                                    if (cc.status === 'APPROVED') return '✅ Aprovado';
                                                                    if (cc.status === 'REJECTED') return '❌ Rejeitado';
                                                                    if (cc.status === 'AWAITING_N2') {
                                                                        const canApprove = isMaster || ['APROVADOR_N2', 'APROVADOR_N1_N2'].includes(access);
                                                                        return canApprove ? '⏳ Aprovar N2' : '⏳ Esperando N2';
                                                                    }
                                                                    // PENDING
                                                                    const canSubmit = isMaster || ['APROVADOR_N1', 'APROVADOR_N1_N2'].includes(access);
                                                                    return canSubmit ? '📤 Enviar N1' : '🔍 Ver Detalhes';
                                                                })()}
                                                            </button>
                                                        </div>
                                                    </td>

                                                </tr>

                                            ))}
                                        </React.Fragment>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '6rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '1rem' }}>

                                            Nenhum resultado encontrado.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ marginTop: '2.5rem', textAlign: 'center', color: '#cbd5e1', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em' }}>
                    SISTEMA DE GESTÃO ESTRATÉGICA • GESTÃO 4.0
                </div>

                {/* Audit Modal */}
                {selectedForAudit && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                        <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', width: '90%', maxWidth: '600px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auditoria & Aprovação</span>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0 0 0' }}>{selectedForAudit.costCenterName}</h2>
                                    <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0' }}>{selectedForAudit.tenantName}</p>
                                </div>
                                <button onClick={() => setSelectedForAudit(null)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Receita Planejada</div>
                                    <div style={{ fontSize: '1rem', color: '#059669', fontWeight: 800 }}>{formatCurrency(selectedForAudit.totalRevenue)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Despesa Planejada</div>
                                    <div style={{ fontSize: '1rem', color: '#be123c', fontWeight: 800 }}>{formatCurrency(selectedForAudit.totalExpense)}</div>
                                </div>
                                <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #cbd5e1', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Resultado Projetado</div>
                                        <div style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 900 }}>{formatCurrency(selectedForAudit.totalRevenue - selectedForAudit.totalExpense)}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Status Bloqueio</div>
                                        <div style={{ fontSize: '0.875rem', color: selectedForAudit.isLocked ? '#b91c1c' : '#166534', fontWeight: 800 }}>{selectedForAudit.isLocked ? '🔒 FECHADO (Somente Leitura)' : '🔓 ABERTO (Permite Edição N1)'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Autdit Trail */}
                            <div style={{ marginBottom: '2rem' }}>
                                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Histórico de Assinaturas</h3>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', opacity: selectedForAudit.n1ApprovedBy ? 1 : 0.5 }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: selectedForAudit.n1ApprovedBy ? '#dbeafe' : '#f1f5f9', color: selectedForAudit.n1ApprovedBy ? '#2563eb' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.875rem' }}>N1</div>
                                        <div>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>Gestor de Área</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {selectedForAudit.n1ApprovedBy ? `Assinado por ${selectedForAudit.n1ApprovedBy} em ${new Date(selectedForAudit.n1ApprovedAt!).toLocaleDateString('pt-BR')}` : 'Pendente de envio...'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ width: '2px', height: '16px', background: '#e2e8f0', marginLeft: '15px' }}></div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', opacity: selectedForAudit.n2ApprovedBy ? 1 : 0.5 }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: selectedForAudit.n2ApprovedBy ? '#dcfce3' : '#f1f5f9', color: selectedForAudit.n2ApprovedBy ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.875rem' }}>N2</div>
                                        <div>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>Aprovação Final (Master/CEO)</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {selectedForAudit.n2ApprovedBy ? `Assinado por ${selectedForAudit.n2ApprovedBy} em ${new Date(selectedForAudit.n2ApprovedAt!).toLocaleDateString('pt-BR')}` : 'Aguardando fluxo...'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Group */}
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
                                {(() => {
                                    const access = selectedForAudit.currentUserAccessLevel;
                                    const isMaster = userRole === 'MASTER';
                                    const isN1 = isMaster || ['APROVADOR_N1', 'APROVADOR_N1_N2'].includes(access);
                                    const isN2 = isMaster || ['APROVADOR_N2', 'APROVADOR_N1_N2'].includes(access);
                                    
                                    return (
                                        <>
                                            {(selectedForAudit.status === 'PENDING' || selectedForAudit.status === 'REJECTED') && isN1 && (
                                                <button 
                                                    onClick={() => handleApprovalAction('SUBMIT_N1')} 
                                                    disabled={auditActionLoading}
                                                    style={{ background: '#2563eb', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', opacity: auditActionLoading ? 0.7 : 1 }}
                                                >
                                                    📤 Enviar P/ Aprovação (N1)
                                                </button>
                                            )}

                                            {selectedForAudit.status === 'AWAITING_N2' && isN2 && (
                                                <>
                                                    <button 
                                                        onClick={() => handleApprovalAction('REJECT')} 
                                                        disabled={auditActionLoading}
                                                        style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', opacity: auditActionLoading ? 0.7 : 1 }}
                                                    >
                                                        ❌ Rejeitar N1
                                                    </button>
                                                    <button 
                                                        onClick={() => handleApprovalAction('APPROVE_N2')} 
                                                        disabled={auditActionLoading}
                                                        style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', opacity: auditActionLoading ? 0.7 : 1 }}
                                                    >
                                                        ✅ Aprovar Definitivo (N2)
                                                    </button>
                                                </>
                                            )}

                                            {selectedForAudit.status === 'APPROVED' && isN2 && (
                                                <button 
                                                    onClick={() => handleApprovalAction('REOPEN')} 
                                                    disabled={auditActionLoading}
                                                    style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', opacity: auditActionLoading ? 0.7 : 1 }}
                                                >
                                                    🔓 Reabrir P/ Ajustes
                                                </button>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

            </div>

            <style jsx>{`
                .cc-row:hover {
                    background-color: #f8fafc !important;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
