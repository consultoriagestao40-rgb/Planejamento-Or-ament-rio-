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
        if (value === 0) return '-';
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2
        }).format(value);
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'Inter, sans-serif' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                    <div className="loader"></div>
                    <p style={{ color: '#64748b', fontWeight: 500, letterSpacing: '0.05em', animation: 'pulse 2s infinite' }}>Sincronizando estratégia anual...</p>
                </div>
                <style jsx>{`
                    .loader {
                        width: 5FBG8px;
                        height: 5FBG8px;
                        border: 3px solid rgba(59, 130, 246, 0.1);
                        border-top: 3px solid #3b82f6;
                        border-radius: 50%;
                        animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                `}</style>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#020617',
            backgroundImage: 'radial-gradient(circle at 50% -20%, #1e293b 0%, #020617 80%)',
            color: '#f8fafc',
            fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
            padding: '2rem 1.5rem 4rem'
        }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

                {/* Header Section */}
                <header style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    marginBottom: '3.5rem',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    paddingBottom: '2.5rem'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                            <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)' }}>
                                📊
                            </div>
                            <h1 style={{ fontSize: '2.25rem', fontWeight: 900, letterSpacing: '-0.025em', margin: 0, color: 'white' }}>
                                Resumo de Orçamentos
                            </h1>
                        </div>
                        <p style={{ color: '#94a3b8', fontSize: '1.1rem', margin: 0, fontWeight: 400 }}>Controle consolidado de Centros de Custo e unidades ativas.</p>
                    </div>
                    <Link href="/" className="nav-btn">
                        <span>⬅️</span> Retornar ao Painel
                    </Link>
                </header>

                {/* KPI Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '1.5rem',
                    marginBottom: '3rem'
                }}>
                    <div className="glass-card">
                        <span className="card-label">Total Centros de Custo</span>
                        <h2 className="card-value">{stats.totalCCs}</h2>
                    </div>
                    <div className="glass-card" style={{ borderColor: 'rgba(52, 211, 153, 0.2)', background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.1), rgba(2, 6, 23, 0.4))' }}>
                        <span className="card-label" style={{ color: '#34d399' }}>Sinal verde (Lançado)</span>
                        <h2 className="card-value" style={{ color: '#34d399' }}>{stats.withBudget}</h2>
                    </div>
                    <div className="glass-card" style={{ borderColor: 'rgba(244, 63, 94, 0.2)', background: 'linear-gradient(135deg, rgba(76, 5, 25, 0.1), rgba(2, 6, 23, 0.4))' }}>
                        <span className="card-label" style={{ color: '#fb7185' }}>Atenção (Pendente)</span>
                        <h2 className="card-value" style={{ color: '#fb7185' }}>{stats.withoutBudget}</h2>
                    </div>
                </div>

                {/* Search & Main Action */}
                <div style={{
                    position: 'relative',
                    marginBottom: '2rem'
                }}>
                    <div style={{
                        position: 'absolute',
                        left: '1.5rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#64748b',
                        fontSize: '18px'
                    }}>🔍</div>
                    <input
                        type="text"
                        placeholder="Pesquisar por empresa ou unidade..."
                        style={{
                            width: '100%',
                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '16px',
                            padding: '1.25rem 1.25rem 1.25rem 3.5rem',
                            color: 'white',
                            fontSize: '1.1rem',
                            outline: 'none',
                            transition: 'all 0.3s ease',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                        }}
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Main Table */}
                <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', position: 'sticky', top: 0, zIndex: 10 }}>
                            <tr>
                                <th className="table-th text-left">Empresa</th>
                                <th className="table-th text-left">Centro de Custo</th>
                                <th className="table-th text-right">Receitas (Ano)</th>
                                <th className="table-th text-right">Despesas (Ano)</th>
                                <th className="table-th text-center">Situação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.length > 0 ? filteredData.map((item) => (
                                <tr key={`${item.tenantId}-${item.costCenterId}`} className="table-row">
                                    <td className="table-td text-slate-400">{item.tenantName}</td>
                                    <td className="table-td font-bold text-white">{item.costCenterName}</td>
                                    <td className="table-td text-right font-mono text-emerald-400" style={{ fontSize: '1.05rem' }}>{formatCurrency(item.totalRevenue)}</td>
                                    <td className="table-td text-right font-mono text-rose-400" style={{ fontSize: '1.05rem' }}>{formatCurrency(item.totalExpense)}</td>
                                    <td className="table-td text-center">
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            padding: '0.4rem 1rem',
                                            borderRadius: '10px',
                                            fontSize: '0.75rem',
                                            fontWeight: 800,
                                            letterSpacing: '0.05em',
                                            backgroundColor: item.hasBudget ? 'rgba(52, 211, 153, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                                            color: item.hasBudget ? '#34d399' : '#fb7185',
                                            border: `1px solid ${item.hasBudget ? 'rgba(52, 211, 153, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`
                                        }}>
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'currentColor' }}></span>
                                            {item.hasBudget ? 'CONCLUÍDO' : 'PENDENTE'}
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} style={{ padding: '6rem', textAlign: 'center', color: '#475569', fontSize: '1.2rem', fontStyle: 'italic' }}>
                                        Nenhum registro encontrado para essa busca.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <footer style={{ marginTop: '4rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2rem' }}>
                    <p style={{ color: '#334155', fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.1em' }}>
                        VISTO EM {new Date().toLocaleDateString('pt-BR')} • SINCRONISMO CONTA AZUL • GESTÃO 4.0
                    </p>
                </footer>
            </div>

            <style jsx>{`
                .nav-btn {
                    padding: 0.8rem 1.75rem;
                    background-color: rgba(30, 41, 59, 0.6);
                    color: white;
                    border-radius: 12px;
                    text-decoration: none;
                    font-weight: 600;
                    font-size: 0.95rem;
                    border: 1px solid rgba(255,255,255,0.08);
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    backdrop-filter: blur(8px);
                }
                .nav-btn:hover {
                    background-color: #1e293b;
                    border-color: #3b82f6;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                }
                .glass-card {
                    background: rgba(30, 41, 59, 0.4);
                    padding: 2rem;
                    border-radius: 24px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(12px);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    transition: transform 0.3s ease;
                }
                .glass-card:hover {
                    transform: translateY(-4px);
                    border-color: rgba(255, 255, 255, 0.1);
                }
                .card-label {
                    color: #64748b;
                    font-size: 0.8rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.075em;
                }
                .card-value {
                    font-size: 3rem;
                    font-weight: 900;
                    margin: 0.75rem 0 0;
                    letter-spacing: -0.05em;
                }
                .table-container {
                    background: rgba(15, 23, 42, 0.4);
                    border-radius: 24px;
                    border: 1px solid rgba(255,255,255,0.05);
                    overflow: hidden;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                    backdrop-filter: blur(12px);
                }
                .table-th {
                    padding: 1.5rem 2rem;
                    color: #475569;
                    font-size: 0.75rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    border-bottom: 2px solid rgba(255,255,255,0.03);
                }
                .table-td {
                    padding: 1.25rem 2rem;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                    font-size: 0.95rem;
                }
                .table-row {
                    transition: background-color 0.2s ease;
                }
                .table-row:hover {
                    background-color: rgba(255,255,255,0.02);
                }
                .text-left { text-align: left; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .search-input:focus {
                    border-color: rgba(59, 130, 246, 0.5);
                    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
                }
            `}</style>
        </div>
    );
}
