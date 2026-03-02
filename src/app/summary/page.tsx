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
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/cost-centers/summary');
                const result = await res.json();
                if (result.success) {
                    setData(result.data);
                }
            } catch (e: any) {
                console.error(e);
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
                    <p style={{ color: '#64748b', fontWeight: 500 }}>Sincronizando dados...</p>
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
            padding: '1.5rem',
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
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>📊 Resumo Orçamentário por CC</h1>
                        <p style={{ color: '#64748b', marginTop: '0.4rem', fontSize: '1rem' }}>Acompanhamento anual consolidado de todas as unidades.</p>
                    </div>
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

                {/* KPI Section */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div style={styles.card}>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total de Unidades</p>
                        <p style={{ margin: '0.5rem 0 0', fontSize: '2.25rem', fontWeight: 700 }}>{stats.totalCCs}</p>
                    </div>
                    <div style={{ ...styles.card, borderLeft: '4px solid #10b981' }}>
                        <p style={{ margin: 0, color: '#10b981', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Com Orçamento</p>
                        <p style={{ margin: '0.5rem 0 0', fontSize: '2.25rem', fontWeight: 700, color: '#10b981' }}>{stats.withBudget}</p>
                    </div>
                    <div style={{ ...styles.card, borderLeft: '4px solid #ef4444' }}>
                        <p style={{ margin: 0, color: '#ef4444', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendentes</p>
                        <p style={{ margin: '0.5rem 0 0', fontSize: '2.25rem', fontWeight: 700, color: '#ef4444' }}>{stats.withoutBudget}</p>
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
                        placeholder="Filtrar por empresa ou centro de custo..."
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
                                    <th style={{ ...styles.th, textAlign: 'left' }}>Empresa</th>
                                    <th style={{ ...styles.th, textAlign: 'left' }}>Centro de Custo</th>
                                    <th style={{ ...styles.th, textAlign: 'right' }}>Receita Anual</th>
                                    <th style={{ ...styles.th, textAlign: 'right' }}>Despesa Anual</th>
                                    <th style={{ ...styles.th, textAlign: 'center' }}>Situação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.length > 0 ? filteredData.map((item) => (
                                    <tr key={`${item.tenantId}-${item.costCenterId}`} style={{ background: '#fff' }}>
                                        <td style={styles.td}>{item.tenantName}</td>
                                        <td style={{ ...styles.td, fontWeight: 700, color: '#1e293b' }}>{item.costCenterName}</td>
                                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 500, color: item.totalRevenue > 0 ? '#10b981' : '#94a3b8' }}>
                                            {item.totalRevenue > 0 ? formatCurrency(item.totalRevenue) : '-'}
                                        </td>
                                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 500, color: item.totalExpense > 0 ? '#ef4444' : '#94a3b8' }}>
                                            {item.totalExpense > 0 ? formatCurrency(item.totalExpense) : '-'}
                                        </td>
                                        <td style={{ ...styles.td, textAlign: 'center' }}>
                                            <span style={{
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '6px',
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                backgroundColor: item.hasBudget ? '#d1fae5' : '#fee2e2',
                                                color: item.hasBudget ? '#065f46' : '#991b1b',
                                                display: 'inline-block',
                                                minWidth: '100px'
                                            }}>
                                                {item.hasBudget ? 'LANÇADO' : 'PENDENTE'}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>Nenhum resultado encontrado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ marginTop: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em' }}>
                    DADOS SINCRONIZADOS EM {new Date().toLocaleDateString('pt-BR')} • GESTÃO 4.0
                </div>

            </div>
        </div>
    );
}
