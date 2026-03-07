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
    hasRealizedData: boolean;
    isLocked: boolean;
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
            if (item.hasRealizedData) group.finishedCount++;
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

    const toggleLock = async (item: SummaryItem) => {
        if (userRole !== 'MASTER') return;
        
        const newLockState = !item.isLocked;
        setIsTogglingLock(item.costCenterId);
        
        try {
            const res = await fetch('/api/cost-centers/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: item.tenantId,
                    costCenterId: item.costCenterId,
                    year: selectedYear,
                    isLocked: newLockState
                })
            });
            
            const result = await res.json();
            if (result.success) {
                setData(prev => prev.map(i => 
                    (i.costCenterId === item.costCenterId && i.tenantId === item.tenantId) 
                    ? { ...i, isLocked: newLockState } 
                    : i
                ));
            } else {
                alert(result.error || 'Erro ao alterar bloqueio');
            }
        } catch (e) {
            console.error(e);
            alert('Erro de conexão ao alterar bloqueio');
        } finally {
            setIsTogglingLock(null);
        }
    };


    const stats = useMemo(() => {
        const totalCCs = data.length;
        const withBudget = data.filter(i => i.hasRealizedData).length;
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
            <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontFamily: 'Inter, sans-serif' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div className="spinner"></div>
                    <p style={{ color: '#64748b', fontWeight: 500 }}>Sincronizando resumo financeiro...</p>
                </div>
                <style jsx>{`
                    .spinner {
                        width: 40px;
                        height: 40px;
                        border: 3px solid #e2e8f0;
                        border-top-color: #2563eb;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    const styles = {
        th: {
            backgroundColor: '#f8fafc',
            padding: '0.75rem 1.5rem',
            borderBottom: '2px solid #e2e8f0',
            color: '#64748b',
            fontSize: '0.75rem',
            fontWeight: 800,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em'
        },
        td: {
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #f1f5f9',
            fontSize: '0.85rem',
            color: '#334155'
        },
        card: {
            backgroundColor: '#fff',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#1e293b', fontFamily: 'Inter, system-ui, sans-serif', padding: '2.5rem 2rem' }}>
            <div style={{ maxWidth: '1280px', margin: '0 auto' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>📊 Resumo por Empresa & CC</h1>
                        <p style={{ color: '#64748b', marginTop: '0.4rem', fontSize: '1rem' }}>Controle consolidado e indicadores de lucratividade.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <Link href="/radar" style={{
                            padding: '0.6rem 1.2rem',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            🎯 Gestão de Radar
                        </Link>
                        <SyncButton year={selectedYear} onSyncStart={() => setLoading(true)} onSyncComplete={fetchData} />
                        <Link href="/" style={{
                            padding: '0.6rem 1.2rem',
                            backgroundColor: '#fff',
                            color: '#1e293b',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            ⬅️ Voltar ao Dashboard
                        </Link>
                    </div>

                </div>

                {/* KPI Section - Row 1: Operations */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '1.25rem' }}>
                    <div style={styles.card}>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total de Unidades</p>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '1.75rem', fontWeight: 700 }}>{stats.totalCCs}</p>
                    </div>
                    <div style={{ ...styles.card, borderLeft: '4px solid #10b981' }}>
                        <p style={{ margin: 0, color: '#10b981', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Digitados</p>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '1.75rem', fontWeight: 700, color: '#10b981' }}>{stats.withBudget}</p>
                    </div>
                    <div style={{ ...styles.card, borderLeft: '4px solid #ef4444' }}>
                        <p style={{ margin: 0, color: '#ef4444', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendentes</p>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '1.75rem', fontWeight: 700, color: '#ef4444' }}>{stats.withoutBudget}</p>
                    </div>
                    <div style={{ ...styles.card, background: '#f1f5f9', borderStyle: 'dashed', position: 'relative' }}>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ano Referência</p>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            style={{
                                width: '100%',
                                marginTop: '0.4rem',
                                fontSize: '1.75rem',
                                fontWeight: 700,
                                background: 'transparent',
                                border: 'none',
                                color: '#1e293b',
                                outline: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                appearance: 'none',
                                fontFamily: 'inherit'
                            }}
                        >
                            {[2024, 2025, 2026, 2027, 2028].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                        <span style={{ position: 'absolute', right: '1.25rem', bottom: '1.5rem', fontSize: '0.8rem', color: '#64748b' }}>▼</span>
                    </div>
                </div>

                {/* KPI Section - Row 2: Financials */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2.5rem' }}>
                    <div style={{ ...styles.card, background: '#ecfdf5' }}>
                        <p style={{ margin: 0, color: '#047857', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Receita Orçada</p>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#047857' }}>{formatCurrency(stats.totalRevenueBudgeted)}</p>
                    </div>
                    <div style={{ ...styles.card, background: '#fff1f2' }}>
                        <p style={{ margin: 0, color: '#be123c', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. Despesa Orçada</p>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#be123c' }}>{formatCurrency(stats.totalExpenseBudgeted)}</p>
                    </div>
                    <div style={{ ...styles.card, background: '#f8fafc', borderLeft: '4px solid #1e293b' }}>
                        <p style={{ margin: 0, color: '#475569', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>3. Resultado</p>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>{formatCurrency(stats.resultValue)}</p>
                    </div>
                    <div style={{ ...styles.card, background: '#eff6ff' }}>
                        <p style={{ margin: 0, color: '#2563eb', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>4. % Margem</p>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '1.75rem', fontWeight: 900, color: '#2563eb' }}>{stats.resultPercent.toFixed(1)}%</p>
                    </div>
                </div>

                {/* Filter */}
                <div style={{
                    backgroundColor: '#fff',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '1.5rem'
                }}>
                    <span style={{ fontSize: '1.1rem', color: '#94a3b8' }}>🔍</span>
                    <input
                        type="text"
                        placeholder="Pesquisa rápida de orçamento..."
                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.95rem', color: '#1e293b' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Main Table */}
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={{ ...styles.th, textAlign: 'left', width: '400px' }}>Organização / Centro de Custo</th>
                                    <th style={{ ...styles.th, textAlign: 'right' }}>Receita Anual</th>
                                    <th style={{ ...styles.th, textAlign: 'right' }}>Despesa Anual</th>
                                    <th style={{ ...styles.th, textAlign: 'center' }}>Progresso</th>
                                    <th style={{ ...styles.th, textAlign: 'center', width: '80px' }}>🔒</th>
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
                                                    background: '#f1f5f9',
                                                    cursor: 'pointer',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = '#e2e8f0')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                                            >
                                                <td style={{ ...styles.td, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        color: '#64748b',
                                                        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                                                    }}>▶</span>
                                                    {group.tenantName}
                                                </td>
                                                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 800, color: group.totalRevenue > 0 ? '#059669' : '#1e293b' }}>
                                                    {formatCurrency(group.totalRevenue)}
                                                </td>
                                                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 800, color: group.totalExpense > 0 ? '#be123c' : '#1e293b' }}>
                                                    {formatCurrency(group.totalExpense)}
                                                </td>
                                                <td style={{ ...styles.td, textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '0.25rem 0.75rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 800,
                                                        backgroundColor: isComplete ? '#d1fae5' : '#fee2e2',
                                                        color: isComplete ? '#065f46' : '#b91c1c',
                                                        display: 'inline-block',
                                                        minWidth: '100px'
                                                    }}>
                                                        {isComplete ? 'OK' : `PENDENTE (${group.finishedCount}/${group.totalCount})`}
                                                    </span>
                                                </td>
                                                <td style={{ ...styles.td, textAlign: 'center' }}>
                                                    {/* Company headers usually don't have a single lock, they are CC based */}
                                                    <span style={{ color: '#cbd5e1' }}>-</span>
                                                </td>
                                            </tr>


                                            {isExpanded && group.costCenters.map((cc) => (
                                                <tr key={cc.costCenterId} className="cc-row" style={{ background: '#fff' }}>
                                                    <td style={{ ...styles.td, paddingLeft: '3rem', color: '#475569', fontWeight: 500 }}>
                                                        {cc.costCenterName}
                                                    </td>
                                                    <td style={{ ...styles.td, textAlign: 'right', color: cc.totalRevenue > 0 ? '#10b981' : '#94a3b8' }}>
                                                        {formatCurrency(cc.totalRevenue)}
                                                    </td>
                                                    <td style={{ ...styles.td, textAlign: 'right', color: cc.totalExpense > 0 ? '#ef4444' : '#94a3b8' }}>
                                                        {formatCurrency(cc.totalExpense)}
                                                    </td>
                                                    <td style={{ ...styles.td, textAlign: 'center' }}>
                                                        {cc.hasRealizedData ? (
                                                            <span style={{ fontSize: '0.8rem', color: '#10b981' }}>✓ OK</span>
                                                        ) : (
                                                            <span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 700 }}>EM ABERTO</span>
                                                        )}
                                                    </td>
                                                    <td style={{ ...styles.td, textAlign: 'center' }}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleLock(cc);
                                                            }}
                                                            disabled={userRole !== 'MASTER' || isTogglingLock === cc.costCenterId}
                                                            style={{
                                                                background: cc.isLocked ? '#fee2e2' : '#f0fdf4',
                                                                border: `1px solid ${cc.isLocked ? '#fecaca' : '#bbf7d0'}`,
                                                                borderRadius: '6px',
                                                                cursor: (userRole === 'MASTER' && isTogglingLock !== cc.costCenterId) ? 'pointer' : 'default',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 700,
                                                                padding: '0.4rem 0.6rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.4rem',
                                                                margin: '0 auto',
                                                                color: cc.isLocked ? '#991b1b' : '#166534',
                                                                opacity: userRole === 'MASTER' ? 1 : 0.6,
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseEnter={e => {
                                                                if (userRole === 'MASTER') {
                                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                                                                }
                                                            }}
                                                            onMouseLeave={e => {
                                                                if (userRole === 'MASTER') {
                                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                                    e.currentTarget.style.boxShadow = 'none';
                                                                }
                                                            }}
                                                            title={userRole === 'MASTER' ? (cc.isLocked ? 'Clique para Liberar Orçamento' : 'Clique para Trancar Orçamento') : 'Apenas administradores'}
                                                        >
                                                            {isTogglingLock === cc.costCenterId ? (
                                                                <span style={{ fontSize: '1rem' }}>⏳</span>
                                                            ) : (
                                                                <>
                                                                    <span style={{ fontSize: '1rem' }}>{cc.isLocked ? '🔒' : '🔓'}</span>
                                                                    <span>{cc.isLocked ? 'TRANCADO' : 'LIBERADO'}</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </td>

                                                </tr>

                                            ))}
                                        </React.Fragment>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '6rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '1rem' }}>

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

            </div>

            <style jsx>{`
                .cc-row:hover {
                    background-color: #f8fafc !important;
                }
            `}</style>
        </div>
    );
}
