'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface SummaryItem {
    tenantId: string;
    tenantName: string;
    costCenterId: string;
    costCenterName: string;
    totalRevenue: number;
    totalExpense: number;
    hasBudget: boolean;
}

export default function BudgetSummaryPage() {
    const [data, setData] = useState<SummaryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/cost-centers/summary');
                const result = await res.json();
                if (result.success) {
                    setData(result.data);
                } else {
                    setError(result.error);
                }
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const lowTerm = searchTerm.toLowerCase();
        return data.filter(item =>
            item.tenantName.toLowerCase().includes(lowTerm) ||
            item.costCenterName.toLowerCase().includes(lowTerm)
        );
    }, [data, searchTerm]);

    const stats = useMemo(() => {
        const totalCCs = data.length;
        const withBudget = data.filter(i => i.hasBudget).length;
        const withoutBudget = totalCCs - withBudget;
        return { totalCCs, withBudget, withoutBudget };
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
            <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div className="spinner"></div>
                    <p style={{ color: '#94a3b8', fontWeight: 500 }}>Carregando dados estratégicos...</p>
                </div>
                <style jsx>{`
                    .spinner {
                        width: 48px;
                        height: 48px;
                        border: 4px solid #3b82f6;
                        border-top-color: transparent;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    const styles = {
        container: { maxWidth: '1280px', margin: '0 auto', padding: '2.5rem 1.5rem', spaceY: '2rem' },
        header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '2rem', marginBottom: '2rem' },
        card: { backgroundColor: '#1e293b80', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #334155', boxShadow: '0 4px 6px -1px #0000001a' },
        table: { width: '100%', borderCollapse: 'collapse' as const, textAlign: 'left' as const },
        th: { padding: '1.25rem 2rem', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', borderBottom: '1px solid #334155', backgroundColor: '#1e293b' },
        td: { padding: '1.25rem 2rem', borderBottom: '1px solid #1e293b40', color: '#cbd5e1' },
        badge: (success: boolean) => ({
            padding: '0.4rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            backgroundColor: success ? '#10b98120' : '#f43f5e20',
            color: success ? '#34d399' : '#fb7185',
            border: `1px solid ${success ? '#10b98130' : '#f43f5e30'}`
        })
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <div style={styles.container}>

                {/* Header */}
                <div style={styles.header}>
                    <div>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '2.5rem' }}>📊</span> Resumo de Orçamentos por CC
                        </h1>
                        <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Acompanhamento consolidado de todas as unidades ativas.</p>
                    </div>
                    <Link href="/" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#1e293b', color: 'white', borderRadius: '0.75rem', textDecoration: 'none', fontWeight: 600, border: '1px solid #334155', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        ⬅️ Voltar ao Painel
                    </Link>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    <div style={styles.card}>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase' }}>Total de C. Custos</p>
                        <p style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', marginTop: '0.5rem' }}>{stats.totalCCs}</p>
                    </div>
                    <div style={{ ...styles.card, borderColor: '#10b98150', backgroundColor: '#064e3b20' }}>
                        <p style={{ color: '#34d399', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase' }}>Com Orçamento</p>
                        <p style={{ fontSize: '2.25rem', fontWeight: 800, color: '#34d399', marginTop: '0.5rem' }}>{stats.withBudget}</p>
                    </div>
                    <div style={{ ...styles.card, borderColor: '#f43f5e50', backgroundColor: '#4c051920' }}>
                        <p style={{ color: '#fb7185', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase' }}>Pendente</p>
                        <p style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fb7185', marginTop: '0.5rem' }}>{stats.withoutBudget}</p>
                    </div>
                </div>

                {/* Filter Box */}
                <div style={{ ...styles.card, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>🔍</span>
                    <input
                        type="text"
                        placeholder="Pesquisar por empresa ou centro de custo..."
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: 'white', width: '100%', fontSize: '1rem' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Table Wrapper */}
                <div style={{ backgroundColor: '#1e293b40', borderRadius: '1.5rem', border: '1px solid #334155', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Empresa</th>
                                    <th style={styles.th}>Centro de Custo</th>
                                    <th style={{ ...styles.th, textAlign: 'right' }}>Receita Anual</th>
                                    <th style={{ ...styles.th, textAlign: 'right' }}>Despesa Anual</th>
                                    <th style={{ ...styles.th, textAlign: 'center' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.length > 0 ? filteredData.map((item, idx) => (
                                    <tr key={`${item.tenantId}-${item.costCenterId}`} style={{ borderBottom: '1px solid #1e293b80', backgroundColor: !item.hasBudget ? '#f43f5e05' : 'transparent' }}>
                                        <td style={styles.td}>{item.tenantName}</td>
                                        <td style={{ ...styles.td, fontWeight: 700, color: 'white' }}>{item.costCenterName}</td>
                                        <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace', color: '#34d399', fontSize: '1.1rem' }}>{formatCurrency(item.totalRevenue)}</td>
                                        <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace', color: '#fb7185', fontSize: '1.1rem' }}>{formatCurrency(item.totalExpense)}</td>
                                        <td style={{ ...styles.td, textAlign: 'center' }}>
                                            <span style={styles.badge(item.hasBudget)}>
                                                {item.hasBudget ? 'LANÇADO' : 'PENDENTE'}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '5rem', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                                            Nenhum centro de custo encontrado...
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#475569', fontSize: '0.875rem', letterSpacing: '0.05em' }}>
                    Sincronizado com Conta Azul em {new Date().toLocaleDateString('pt-BR')}
                </div>
            </div>
        </div>
    );
}
