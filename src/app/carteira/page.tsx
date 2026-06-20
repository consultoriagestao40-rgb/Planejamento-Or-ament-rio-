'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';

interface PortfolioItem {
    tenantId: string;
    tenantName: string;
    costCenterId: string;
    costCenterName: string;
    revenue: number;
    taxes: number;
    netRevenue: number;
    costs: number;
    grossMargin: number;
    grossMarginPercent: number;
}

export default function PortfolioAnalysisPage() {
    const [data, setData] = useState<PortfolioItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<string>('average'); // 'average', 'total', 1-12
    const [selectedSource, setSelectedSource] = useState<'realized' | 'budget'>('realized');
    const [selectedViewMode, setSelectedViewMode] = useState<'competencia' | 'caixa'>('competencia');
    const [expandedTenants, setExpandedTenants] = useState<Set<string>>(new Set());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `/api/portfolio-analysis?year=${selectedYear}&month=${selectedMonth}&source=${selectedSource}&viewMode=${selectedViewMode}`
            );
            const result = await res.json();
            if (result.success) {
                setData(result.data);
            } else {
                console.error(result.error);
            }
        } catch (e) {
            console.error('Erro de conexão ao buscar análise de carteira:', e);
        } finally {
            setLoading(false);
        }
    }, [selectedYear, selectedMonth, selectedSource, selectedViewMode]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredData = useMemo(() => {
        if (!searchTerm.trim()) return data;
        const term = searchTerm.toLowerCase();
        return data.filter(
            item =>
                item.tenantName.toLowerCase().includes(term) ||
                item.costCenterName.toLowerCase().includes(term)
        );
    }, [data, searchTerm]);

    // Agrupar dados por Tenant (Empresa) para colapso/expansão
    const groupedData = useMemo(() => {
        const groups: Record<string, {
            tenantId: string;
            tenantName: string;
            revenue: number;
            taxes: number;
            netRevenue: number;
            costs: number;
            grossMargin: number;
            grossMarginPercent: number;
            items: PortfolioItem[];
        }> = {};

        filteredData.forEach(item => {
            const tId = item.tenantId;
            if (!groups[tId]) {
                groups[tId] = {
                    tenantId: tId,
                    tenantName: item.tenantName,
                    revenue: 0,
                    taxes: 0,
                    netRevenue: 0,
                    costs: 0,
                    grossMargin: 0,
                    grossMarginPercent: 0,
                    items: []
                };
            }
            
            groups[tId].items.push(item);
            groups[tId].revenue += item.revenue;
            groups[tId].taxes += item.taxes;
            groups[tId].netRevenue += item.netRevenue;
            groups[tId].costs += item.costs;
            groups[tId].grossMargin += item.grossMargin;
        });

        // Calcular percentuais ponderados para cada grupo consolidado de empresa
        Object.values(groups).forEach(g => {
            g.grossMarginPercent = g.revenue > 0 ? (g.grossMargin / g.revenue) * 100 : 0;
            // Ordenar centros de custo
            g.items.sort((a, b) => a.costCenterName.localeCompare(b.costCenterName));
        });

        return Object.values(groups).sort((a, b) => a.tenantName.localeCompare(b.tenantName));
    }, [filteredData]);

    const toggleTenant = useCallback((tenantId: string) => {
        setExpandedTenants(prev => {
            const next = new Set(prev);
            if (next.has(tenantId)) {
                next.delete(tenantId);
            } else {
                next.add(tenantId);
            }
            return next;
        });
    }, []);

    const isAllExpanded = useMemo(() => {
        return groupedData.length > 0 && expandedTenants.size === groupedData.length;
    }, [groupedData, expandedTenants]);

    const toggleAllTenants = useCallback(() => {
        if (isAllExpanded) {
            setExpandedTenants(new Set());
        } else {
            setExpandedTenants(new Set(groupedData.map(g => g.tenantId)));
        }
    }, [isAllExpanded, groupedData]);

    const totals = useMemo(() => {
        let totalRevenue = 0;
        let totalTaxes = 0;
        let totalNetRevenue = 0;
        let totalCosts = 0;
        let totalGrossMargin = 0;

        filteredData.forEach(item => {
            totalRevenue += item.revenue;
            totalTaxes += item.taxes;
            totalNetRevenue += item.netRevenue;
            totalCosts += item.costs;
            totalGrossMargin += item.grossMargin;
        });

        const totalGrossMarginPercent = totalRevenue > 0 ? (totalGrossMargin / totalRevenue) * 100 : 0;

        return {
            revenue: totalRevenue,
            taxes: totalTaxes,
            netRevenue: totalNetRevenue,
            costs: totalCosts,
            grossMargin: totalGrossMargin,
            grossMarginPercent: totalGrossMarginPercent
        };
    }, [filteredData]);

    const formatCurrency = (val: number) => {
        if (val === 0) return 'R$ 0,00';
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2
        }).format(val);
    };

    const th: React.CSSProperties = {
        background: 'var(--bg-surface)',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--border-default)',
        color: 'var(--text-muted)',
        fontSize: '0.7rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        whiteSpace: 'nowrap',
        textAlign: 'right'
    };

    const thLeft: React.CSSProperties = {
        ...th,
        textAlign: 'left'
    };

    const td: React.CSSProperties = {
        padding: '1.1rem 1.5rem',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
        textAlign: 'right',
        whiteSpace: 'nowrap'
    };

    const tdLeft: React.CSSProperties = {
        ...td,
        textAlign: 'left',
        whiteSpace: 'normal'
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'Inter, system-ui, sans-serif', padding: '2.5rem 2rem' }}>
            <div className="container" style={{ maxWidth: '1400px', margin: '0 auto' }}>
                
                {/* Cabeçalho */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '1.5rem', gap: '2rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1 className="brand-text" style={{ fontSize: '2.25rem', marginBottom: '0.5rem', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            💼 Análise de Carteira
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Visão detalhada de rentabilidade e margens por centro de custo.</p>
                    </div>
                </div>

                {/* Filtros */}
                <div style={{ 
                    backgroundColor: 'var(--bg-surface)', 
                    padding: '1.25rem 1.75rem', 
                    borderRadius: 'var(--radius)', 
                    border: '1px solid var(--border-default)', 
                    boxShadow: 'var(--shadow-card)',
                    marginBottom: '2rem', 
                    display: 'flex', 
                    gap: '1.5rem', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    flexWrap: 'wrap'
                }}>
                    {/* Filtro de Busca */}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: '1 1 300px', background: 'var(--bg-elevated)', padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                        <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>🔍</span>
                        <input 
                            type="text" 
                            placeholder="Buscar empresa ou centro de custo..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem' }} 
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700 }}>✕</button>
                        )}
                    </div>

                    {/* Controles de Filtro */}
                    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        
                        {/* Seletor de Ano */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-elevated)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                            <button onClick={() => setSelectedYear(prev => prev - 1)} className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', border: 'none', background: 'transparent', height: '32px' }}>◀</button>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, minWidth: '50px', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{selectedYear}</span>
                            <button onClick={() => setSelectedYear(prev => prev + 1)} className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', border: 'none', background: 'transparent', height: '32px' }}>▶</button>
                        </div>

                        {/* Seletor de Mês */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <select 
                                value={selectedMonth} 
                                onChange={(e) => setSelectedMonth(e.target.value)} 
                                style={{ 
                                    padding: '0.55rem 1rem', 
                                    borderRadius: '8px', 
                                    border: '1px solid var(--border-default)', 
                                    background: 'var(--bg-elevated)', 
                                    color: 'var(--text-primary)', 
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    outline: 'none'
                                }}
                            >
                                <option value="average">📅 Média Mensal</option>
                                <option value="total">📅 Ano Completo</option>
                                <option value="1">Janeiro</option>
                                <option value="2">Fevereiro</option>
                                <option value="3">Março</option>
                                <option value="4">Abril</option>
                                <option value="5">Maio</option>
                                <option value="6">Junho</option>
                                <option value="7">Julho</option>
                                <option value="8">Agosto</option>
                                <option value="9">Setembro</option>
                                <option value="10">Outubro</option>
                                <option value="11">Novembro</option>
                                <option value="12">Dezembro</option>
                            </select>
                        </div>

                        {/* Origem (Realizado vs Orçado) */}
                        <div style={{ display: 'flex', background: 'var(--bg-elevated)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                            <button 
                                onClick={() => setSelectedSource('realized')} 
                                style={{ 
                                    padding: '0.45rem 1rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    fontSize: '0.85rem',
                                    background: selectedSource === 'realized' ? 'var(--gradient-brand)' : 'transparent', 
                                    color: selectedSource === 'realized' ? '#fff' : 'var(--text-secondary)', 
                                    fontWeight: 600, 
                                    cursor: 'pointer', 
                                    transition: 'all 0.2s' 
                                }}
                            >
                                Realizado
                            </button>
                            <button 
                                onClick={() => setSelectedSource('budget')} 
                                style={{ 
                                    padding: '0.45rem 1rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    fontSize: '0.85rem',
                                    background: selectedSource === 'budget' ? 'var(--gradient-brand)' : 'transparent', 
                                    color: selectedSource === 'budget' ? '#fff' : 'var(--text-secondary)', 
                                    fontWeight: 600, 
                                    cursor: 'pointer', 
                                    transition: 'all 0.2s' 
                                }}
                            >
                                Orçado
                            </button>
                        </div>

                        {/* Regime (Competência vs Caixa) */}
                        {selectedSource === 'realized' && (
                            <div style={{ display: 'flex', background: 'var(--bg-elevated)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                                <button 
                                    onClick={() => setSelectedViewMode('competencia')} 
                                    style={{ 
                                        padding: '0.45rem 1rem', 
                                        borderRadius: '6px', 
                                        border: 'none', 
                                        fontSize: '0.85rem',
                                        background: selectedViewMode === 'competencia' ? 'var(--accent-indigo)' : 'transparent', 
                                        color: selectedViewMode === 'competencia' ? '#fff' : 'var(--text-secondary)', 
                                        fontWeight: 600, 
                                        cursor: 'pointer', 
                                        transition: 'all 0.2s' 
                                    }}
                                >
                                    Competência
                                </button>
                                <button 
                                    onClick={() => setSelectedViewMode('caixa')} 
                                    style={{ 
                                        padding: '0.45rem 1rem', 
                                        borderRadius: '6px', 
                                        border: 'none', 
                                        fontSize: '0.85rem',
                                        background: selectedViewMode === 'caixa' ? 'var(--accent-indigo)' : 'transparent', 
                                        color: selectedViewMode === 'caixa' ? '#fff' : 'var(--text-secondary)', 
                                        fontWeight: 600, 
                                        cursor: 'pointer', 
                                        transition: 'all 0.2s' 
                                    }}
                                >
                                    Caixa
                                </button>
                            </div>
                        )}

                        {/* Botão de Expandir/Recolher Tudo */}
                        <button
                            onClick={toggleAllTenants}
                            style={{
                                padding: '0.55rem 1.1rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-elevated)',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                outline: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s'
                            }}
                        >
                            <span>{isAllExpanded ? '📂' : '📁'}</span>
                            {isAllExpanded ? 'Recolher Empresas' : 'Expandir Empresas'}
                        </button>

                    </div>
                </div>

                {/* Tabela */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border-default)' }}>
                        <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid var(--border-default)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>Carregando dados da carteira...</p>
                        <style jsx global>{`
                            @keyframes spin { to { transform: rotate(360deg); } }
                        `}</style>
                    </div>
                ) : filteredData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem 2rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Nenhum dado encontrado</h3>
                        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>Não há lançamentos de receita para os filtros selecionados ou nenhuma empresa corresponde à busca.</p>
                    </div>
                ) : (
                    <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                            <thead>
                                <tr>
                                    <th style={thLeft}>Empresa</th>
                                    <th style={thLeft}>Centro de Custo</th>
                                    <th style={th}>Receita Bruta</th>
                                    <th style={th}>Tributos</th>
                                    <th style={th}>Receita Líquida</th>
                                    <th style={th}>Custos Operacionais</th>
                                    <th style={th}>Margem Bruta (MB)</th>
                                    <th style={{ ...th, textAlign: 'center' }}>MB (%)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedData.map((group) => {
                                    const isExpanded = expandedTenants.has(group.tenantId);
                                    const isNegativeGroupMB = group.grossMargin < 0;

                                    return (
                                        <React.Fragment key={group.tenantId}>
                                            {/* Linha Pai (Empresa consolidada) */}
                                            <tr 
                                                style={{ 
                                                    background: 'var(--bg-elevated)', 
                                                    borderLeft: '4px solid var(--accent-blue)',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                                onClick={() => toggleTenant(group.tenantId)}
                                                className="company-row hover-row"
                                            >
                                                <td style={{ ...tdLeft, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ 
                                                        display: 'inline-block', 
                                                        transition: 'transform 0.2s', 
                                                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                        fontSize: '0.65rem',
                                                        color: 'var(--text-muted)'
                                                    }}>
                                                        ▶
                                                    </span>
                                                    {group.tenantName}
                                                </td>
                                                <td style={{ ...tdLeft, color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>
                                                    Consolidado ({group.items.length} CCs)
                                                </td>
                                                <td style={{ ...td, fontWeight: 700 }}>{formatCurrency(group.revenue)}</td>
                                                <td style={{ ...td, color: group.taxes > 0 ? 'var(--accent-red)' : 'var(--text-secondary)', fontWeight: 700 }}>
                                                    {group.taxes > 0 ? `(${formatCurrency(group.taxes)})` : formatCurrency(group.taxes)}
                                                </td>
                                                <td style={{ ...td, fontWeight: 700, color: 'var(--accent-blue)' }}>{formatCurrency(group.netRevenue)}</td>
                                                <td style={{ ...td, color: group.costs > 0 ? 'var(--accent-red)' : 'var(--text-secondary)', fontWeight: 700 }}>
                                                    {group.costs > 0 ? `(${formatCurrency(group.costs)})` : formatCurrency(group.costs)}
                                                </td>
                                                <td style={{ 
                                                    ...td, 
                                                    fontWeight: 700, 
                                                    color: isNegativeGroupMB ? 'var(--accent-red)' : 'var(--accent-green)',
                                                    background: isNegativeGroupMB ? 'rgba(220, 38, 38, 0.02)' : 'rgba(5, 150, 105, 0.02)'
                                                }}>
                                                    {formatCurrency(group.grossMargin)}
                                                </td>
                                                <td style={{ 
                                                    ...td, 
                                                    textAlign: 'center', 
                                                    fontWeight: 800,
                                                    color: isNegativeGroupMB ? 'var(--accent-red)' : 'var(--accent-green)',
                                                    background: isNegativeGroupMB ? 'rgba(220, 38, 38, 0.03)' : 'rgba(5, 150, 105, 0.03)'
                                                }}>
                                                    {group.grossMarginPercent.toFixed(1)}%
                                                </td>
                                            </tr>

                                            {/* Linhas filhas (Centros de Custo) */}
                                            {isExpanded && group.items.map((item, idx) => {
                                                const isNegativeMB = item.grossMargin < 0;
                                                const isGeral = item.costCenterName === 'GERAL (Sem Centro de Custo)';

                                                return (
                                                    <tr 
                                                        key={`${item.tenantId}-${item.costCenterId}-${idx}`}
                                                        style={{ 
                                                            background: isGeral ? 'rgba(15, 23, 42, 0.005)' : 'transparent',
                                                            transition: 'background 0.2s'
                                                        }}
                                                        className="hover-row"
                                                    >
                                                        <td style={{ ...tdLeft, paddingLeft: '2.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                            └─ {item.tenantName}
                                                        </td>
                                                        <td style={{ ...tdLeft, color: isGeral ? 'var(--text-muted)' : 'var(--text-secondary)', fontStyle: isGeral ? 'italic' : 'normal', fontWeight: isGeral ? 500 : 600 }}>
                                                            {item.costCenterName}
                                                        </td>
                                                        <td style={{ ...td }}>{formatCurrency(item.revenue)}</td>
                                                        <td style={{ ...td, color: item.taxes > 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                                                            {item.taxes > 0 ? `(${formatCurrency(item.taxes)})` : formatCurrency(item.taxes)}
                                                        </td>
                                                        <td style={{ ...td, color: 'var(--accent-blue)' }}>{formatCurrency(item.netRevenue)}</td>
                                                        <td style={{ ...td }}>
                                                            {item.costs > 0 ? `(${formatCurrency(item.costs)})` : formatCurrency(item.costs)}
                                                        </td>
                                                        <td style={{ 
                                                            ...td, 
                                                            fontWeight: 600, 
                                                            color: isNegativeMB ? 'var(--accent-red)' : 'var(--accent-green)'
                                                        }}>
                                                            {formatCurrency(item.grossMargin)}
                                                        </td>
                                                        <td style={{ 
                                                            ...td, 
                                                            textAlign: 'center', 
                                                            fontWeight: 700,
                                                            color: isNegativeMB ? 'var(--accent-red)' : 'var(--accent-green)'
                                                        }}>
                                                            {item.grossMarginPercent.toFixed(1)}%
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                            
                            {/* Linha de Totais */}
                            <tfoot>
                                <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                                    <td colSpan={2} style={{ ...tdLeft, fontWeight: 900, color: 'var(--text-primary)', fontSize: '0.9rem' }}>TOTAL CONSOLIDADO</td>
                                    <td style={{ ...td, fontWeight: 900, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{formatCurrency(totals.revenue)}</td>
                                    <td style={{ ...td, fontWeight: 900, color: totals.taxes > 0 ? 'var(--accent-red)' : 'var(--text-primary)', fontSize: '0.9rem' }}>
                                        {totals.taxes > 0 ? `(${formatCurrency(totals.taxes)})` : formatCurrency(totals.taxes)}
                                    </td>
                                    <td style={{ ...td, fontWeight: 900, color: 'var(--accent-blue)', fontSize: '0.9rem' }}>{formatCurrency(totals.netRevenue)}</td>
                                    <td style={{ ...td, fontWeight: 900, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                                        {totals.costs > 0 ? `(${formatCurrency(totals.costs)})` : formatCurrency(totals.costs)}
                                    </td>
                                    <td style={{ 
                                        ...td, 
                                        fontWeight: 900, 
                                        color: totals.grossMargin < 0 ? 'var(--accent-red)' : 'var(--accent-green)',
                                        fontSize: '0.9rem',
                                        background: totals.grossMargin < 0 ? 'rgba(220, 38, 38, 0.05)' : 'rgba(5, 150, 105, 0.05)'
                                    }}>
                                        {formatCurrency(totals.grossMargin)}
                                    </td>
                                    <td style={{ 
                                        ...td, 
                                        textAlign: 'center', 
                                        fontWeight: 900,
                                        color: totals.grossMargin < 0 ? 'var(--accent-red)' : 'var(--accent-green)',
                                        fontSize: '0.9rem',
                                        background: totals.grossMargin < 0 ? 'rgba(220, 38, 38, 0.06)' : 'rgba(5, 150, 105, 0.06)'
                                    }}>
                                        {totals.grossMarginPercent.toFixed(1)}%
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                        <style jsx global>{`
                            .hover-row:hover {
                                background-color: rgba(37, 99, 235, 0.02) !important;
                            }
                        `}</style>
                    </div>
                )}
            </div>
        </div>
    );
}
