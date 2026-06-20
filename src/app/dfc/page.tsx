'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface BankAccount {
    id: string;
    name: string;
    balance: number;
}

interface MonthlyDFC {
    month: number;
    name: string;
    startingBalance: number;
    inflows: number;
    outflows: number;
    netFlow: number;
    endingBalance: number;
    categories: Record<string, { id: string; name: string; isRevenue: boolean; amount: number }>;
    details: any[];
}

interface DailyProjection {
    date: string;
    formattedDate: string;
    netFlow: number;
    balance: number;
}

interface DFCResponse {
    success: boolean;
    currentBankBalance: number;
    startingBalanceJan1: number;
    monthlyData: MonthlyDFC[];
    dailyProjection: DailyProjection[];
    bankAccounts: BankAccount[];
}

export default function DFCPage() {
    // State de filtros e parâmetros
    const [tenants, setTenants] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<string>('');
    const [selectedCostCenter, setSelectedCostCenter] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    
    // Controles de projeção
    const [defaultRate, setDefaultRate] = useState<number>(0); // Inadimplência
    const [overdueAction, setOverdueAction] = useState<string>('today'); // 'today', 'ignore', 'original'
    
    // Dados da API
    const [data, setData] = useState<DFCResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [syncing, setSyncing] = useState<boolean>(false);
    const [syncLog, setSyncLog] = useState<string>('');
    
    // UI active tab
    const [activeTab, setActiveTab] = useState<'projection' | 'table' | 'audit'>('projection');
    const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    // 1. Carregar estrutura inicial (Setup)
    useEffect(() => {
        const loadSetup = async () => {
            try {
                const res = await fetch('/api/setup');
                const setup = await res.json();
                if (setup.success) {
                    setTenants(setup.tenants || []);
                    setCostCenters(setup.fullCostCenters || []);
                    if (setup.tenants && setup.tenants.length > 0) {
                        // Tentar pegar do localStorage ou default
                        const cached = localStorage.getItem('selectedTenantId');
                        if (cached && setup.tenants.some((t: any) => t.id === cached)) {
                            setSelectedTenant(cached);
                        } else {
                            setSelectedTenant(setup.tenants[0].id);
                        }
                    }
                }
            } catch (err) {
                console.error('Erro ao carregar setup:', err);
            }
        };
        loadSetup();
    }, []);

    // Atualizar cache de localStorage do Tenant
    useEffect(() => {
        if (selectedTenant) {
            localStorage.setItem('selectedTenantId', selectedTenant);
        }
    }, [selectedTenant]);

    // Filtrar centros de custo da empresa selecionada
    const filteredCCs = costCenters.filter((cc) => cc.tenantId === selectedTenant);

    // 2. Carregar dados do DFC
    const fetchDFC = useCallback(async () => {
        if (!selectedTenant) return;
        setLoading(true);
        try {
            const res = await fetch(
                `/api/dfc?tenantId=${selectedTenant}&year=${selectedYear}&costCenterId=${selectedCostCenter}&defaultRate=${defaultRate}&overdueAction=${overdueAction}`
            );
            const resJson = await res.json();
            if (resJson.success) {
                setData(resJson);
            } else {
                console.error('Erro retornado:', resJson.error);
            }
        } catch (err) {
            console.error('Erro ao buscar DFC:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedTenant, selectedYear, selectedCostCenter, defaultRate, overdueAction]);

    useEffect(() => {
        fetchDFC();
    }, [fetchDFC]);

    // 3. Sincronizar dados do Conta Azul
    const handleSync = async () => {
        if (!selectedTenant) return;
        setSyncing(true);
        setSyncLog('Iniciando sincronização com Conta Azul...');
        try {
            const res = await fetch(
                `/api/cron/sync?tenantId=${selectedTenant}&year=${selectedYear}&startMonth=1&endMonth=12`
            );
            const result = await res.json();
            if (result.success) {
                setSyncLog('✅ Sincronização concluída com sucesso!');
                setTimeout(() => setSyncLog(''), 4000);
                fetchDFC(); // Recarregar dados
            } else {
                setSyncLog(`❌ Erro: ${result.error || 'Falha na sincronização'}`);
            }
        } catch (err: any) {
            setSyncLog(`❌ Erro de conexão: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    // Calcular valores agregados para os cards
    const cardTotals = React.useMemo(() => {
        if (!data) return { current: 0, inflows: 0, outflows: 0, projected: 0 };
        
        let inflows = 0;
        let outflows = 0;
        
        // Sum expected values (not realized yet) across all months
        data.monthlyData.forEach(m => {
            m.details.forEach(d => {
                if (!d.isRealized) {
                    if (d.isRevenue) inflows += d.amount;
                    else outflows += d.amount;
                }
            });
        });

        return {
            current: data.currentBankBalance,
            inflows,
            outflows,
            projected: data.currentBankBalance + inflows - outflows
        };
    }, [data]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    // Alternar colapso de categorias na tabela DFC
    const toggleCategory = (catId: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(catId)) next.delete(catId);
            else next.add(catId);
            return next;
        });
    };

    // Renderização do gráfico SVG de projeção diária
    const renderChart = () => {
        if (!data || !data.dailyProjection || data.dailyProjection.length === 0) return null;

        const points = data.dailyProjection;
        const width = 1000;
        const height = 300;
        const padding = 40;

        const balances = points.map(p => p.balance);
        const maxVal = Math.max(...balances, 1000) * 1.1;
        const minVal = Math.min(...balances, 0) * 1.1;
        const range = maxVal - minVal;

        const getX = (index: number) => {
            return padding + (index / (points.length - 1)) * (width - 2 * padding);
        };

        const getY = (val: number) => {
            return height - padding - ((val - minVal) / range) * (height - 2 * padding);
        };

        // Gerar string do path da linha
        let pathD = '';
        points.forEach((p, idx) => {
            const x = getX(idx);
            const y = getY(p.balance);
            if (idx === 0) pathD += `M ${x} ${y}`;
            else pathD += ` L ${x} ${y}`;
        });

        // Gerar string do path da área (para gradiente)
        const firstX = getX(0);
        const lastX = getX(points.length - 1);
        const baselineY = getY(Math.max(minVal, 0)); // Linha base (zero)
        const areaD = `${pathD} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

        // Linha do saldo zero (limite crítico)
        const zeroY = getY(0);

        return (
            <div style={{ position: 'relative', width: '100%', overflowX: 'auto', backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>Projeção de Saldo Acumulado (180 dias)</h3>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#64748b' }}>
                            <span style={{ display: 'inline-block', width: '12px', height: '4px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></span> Saldo Projetado
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#64748b' }}>
                            <span style={{ display: 'inline-block', width: '12px', height: '1px', backgroundColor: '#ef4444', borderTop: '1px dashed #ef4444' }}></span> Limite Crítico (R$ 0)
                        </span>
                    </div>
                </div>

                <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: 'visible' }}>
                    <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                        </linearGradient>
                    </defs>

                    {/* Gridlines horizontais */}
                    {Array.from({ length: 5 }).map((_, idx) => {
                        const val = minVal + (idx / 4) * range;
                        const y = getY(val);
                        return (
                            <g key={idx}>
                                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                                <text x={padding - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="500">
                                    {new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(val)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Linha de Limite Zero */}
                    {zeroY >= padding && zeroY <= height - padding && (
                        <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 4" />
                    )}

                    {/* Área preenchida com gradiente */}
                    <path d={areaD} fill="url(#chartGrad)" />

                    {/* Linha de saldo */}
                    <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Pontos interativos ao passar o mouse */}
                    {points.map((p, idx) => {
                        const x = getX(idx);
                        const y = getY(p.balance);

                        return (
                            <circle
                                key={idx}
                                cx={x}
                                cy={y}
                                r={hoveredPoint && hoveredPoint.idx === idx ? 6 : 2}
                                fill={hoveredPoint && hoveredPoint.idx === idx ? '#2563eb' : '#3b82f6'}
                                stroke="#ffffff"
                                strokeWidth={2}
                                opacity={hoveredPoint && hoveredPoint.idx === idx ? 1 : 0.4}
                                onMouseEnter={() => setHoveredPoint({ idx, ...p })}
                                onMouseLeave={() => setHoveredPoint(null)}
                                style={{ cursor: 'pointer', transition: 'r 0.1s, fill 0.1s' }}
                            />
                        );
                    })}
                </svg>

                {/* Tooltip do gráfico */}
                {hoveredPoint && (
                    <div style={{
                        position: 'absolute',
                        top: '80px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: '#1e293b',
                        color: '#ffffff',
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                        border: '1px solid #334155',
                        zIndex: 10,
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontWeight: 600, borderBottom: '1px solid #334155', paddingBottom: '0.25rem', marginBottom: '0.25rem', color: '#93c5fd' }}>
                            {new Date(hoveredPoint.date).toLocaleDateString('pt-BR', { dateStyle: 'long' })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
                            <span>Movimento do Dia:</span>
                            <span style={{ fontWeight: 600, color: hoveredPoint.netFlow >= 0 ? '#4ade80' : '#f87171' }}>
                                {hoveredPoint.netFlow >= 0 ? '+' : ''}{formatCurrency(hoveredPoint.netFlow)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
                            <span>Saldo Projetado:</span>
                            <span style={{ fontWeight: 700, color: hoveredPoint.balance >= 0 ? '#60a5fa' : '#f87171' }}>
                                {formatCurrency(hoveredPoint.balance)}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif', color: '#334155', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
            
            {/* Header Area */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>
                        Fluxo de Caixa Projetado (DFC)
                    </h1>
                    <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
                        Projeção e Demonstração do Fluxo de Caixa consolidada a partir dos saldos e títulos da API do Conta Azul.
                    </p>
                </div>

                {/* Sincronização */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <button
                        onClick={handleSync}
                        disabled={syncing || !selectedTenant}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.625rem 1.25rem',
                            backgroundColor: syncing ? '#94a3b8' : '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: syncing ? 'not-allowed' : 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        {syncing ? 'Sincronizando...' : 'Sincronizar Conta Azul'}
                    </button>
                    {syncLog && <span style={{ fontSize: '0.75rem', fontWeight: 500, color: syncLog.includes('❌') ? '#ef4444' : '#10b981' }}>{syncLog}</span>}
                </div>
            </div>

            {/* Filtros e Controles */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
                    {/* Empresa Select */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Empresa</label>
                        <select
                            value={selectedTenant}
                            onChange={(e) => setSelectedTenant(e.target.value)}
                            style={{ width: '100%', padding: '0.625rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}
                        >
                            {tenants.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Centro de Custo Select */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Centro de Custo</label>
                        <select
                            value={selectedCostCenter}
                            onChange={(e) => setSelectedCostCenter(e.target.value)}
                            style={{ width: '100%', padding: '0.625rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}
                        >
                            <option value="">Todos os Centros de Custo</option>
                            {filteredCCs.map((cc) => (
                                <option key={cc.id} value={cc.id}>{cc.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Ano Select */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Ano base</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                            style={{ width: '100%', padding: '0.625rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}
                        >
                            {[2025, 2026, 2027].map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tratamento de Atrasados Select */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Títulos Atrasados</label>
                        <select
                            value={overdueAction}
                            onChange={(e) => setOverdueAction(e.target.value)}
                            style={{ width: '100%', padding: '0.625rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}
                        >
                            <option value="today">Vencer hoje na projeção (padrão)</option>
                            <option value="original">Manter vencimento original</option>
                            <option value="ignore">Desconsiderar atrasados</option>
                        </select>
                    </div>

                    {/* Slider Inadimplência */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Inadimplência Projetada</label>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2563eb' }}>{defaultRate}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="50"
                            value={defaultRate}
                            onChange={(e) => setDefaultRate(parseInt(e.target.value, 10))}
                            style={{ width: '100%', cursor: 'pointer', accentColor: '#2563eb' }}
                        />
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* Saldo Inicial */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Saldo Bancário Atual</span>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.1rem 0 0' }}>{formatCurrency(cardTotals.current)}</h2>
                    </div>
                </div>

                {/* Recebíveis Previstos */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Recebimentos em Aberto</span>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a', margin: '0.1rem 0 0' }}>{formatCurrency(cardTotals.inflows)}</h2>
                    </div>
                </div>

                {/* Pagamentos Previstos */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Pagamentos em Aberto</span>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#dc2626', margin: '0.1rem 0 0' }}>{formatCurrency(cardTotals.outflows)}</h2>
                    </div>
                </div>

                {/* Saldo Final Projetado */}
                <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.5rem', border: '1px solid #334155', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Saldo Final Projetado</span>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8', margin: '0.1rem 0 0' }}>{formatCurrency(cardTotals.projected)}</h2>
                    </div>
                </div>
            </div>

            {/* Navegação de Abas */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                <button
                    onClick={() => setActiveTab('projection')}
                    style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activeTab === 'projection' ? '#cbd5e1' : 'transparent',
                        color: activeTab === 'projection' ? '#0f172a' : '#64748b',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s, color 0.2s'
                    }}
                >
                    Gráfico de Projeção
                </button>
                <button
                    onClick={() => setActiveTab('table')}
                    style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activeTab === 'table' ? '#cbd5e1' : 'transparent',
                        color: activeTab === 'table' ? '#0f172a' : '#64748b',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s, color 0.2s'
                    }}
                >
                    Demonstrativo Mensal DFC
                </button>
                <button
                    onClick={() => setActiveTab('audit')}
                    style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activeTab === 'audit' ? '#cbd5e1' : 'transparent',
                        color: activeTab === 'audit' ? '#0f172a' : '#64748b',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s, color 0.2s'
                    }}
                >
                    Auditoria e Conciliação
                </button>
            </div>

            {/* Conteúdo das Abas */}
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 0', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                    <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Carregando fluxo de caixa...</span>
                </div>
            ) : (
                <>
                    {/* ABA: GRÁFICO DE PROJEÇÃO */}
                    {activeTab === 'projection' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {renderChart()}

                            {/* Tabela de Próximos Eventos */}
                            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem' }}>Contas a Receber e Pagar Previstas</h3>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#475569' }}>
                                                <th style={{ padding: '0.75rem 1rem' }}>Data</th>
                                                <th style={{ padding: '0.75rem 1rem' }}>Tipo</th>
                                                <th style={{ padding: '0.75rem 1rem' }}>Descrição</th>
                                                <th style={{ padding: '0.75rem 1rem' }}>Cliente/Fornecedor</th>
                                                <th style={{ padding: '0.75rem 1rem' }}>Categoria</th>
                                                <th style={{ padding: '0.75rem 1rem', textAnchor: 'end' }}>Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data && data.monthlyData.flatMap(m => m.details).filter(d => !d.isRealized).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 30).map((item, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                                                        {new Date(item.date).toLocaleDateString('pt-BR')}
                                                        {item.isOverdue && <span style={{ display: 'inline-block', marginLeft: '0.5rem', padding: '0.1rem 0.4rem', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600 }}>ATRASADO</span>}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>
                                                        <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: item.isRevenue ? '#f0fdf4' : '#fef2f2', color: item.isRevenue ? '#16a34a' : '#dc2626' }}>
                                                            {item.isRevenue ? 'ENTRADA' : 'SAÍDA'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#1e293b' }}>{item.description || 'Lançamento previsto'}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{item.customer || '-'}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{item.category}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: item.isRevenue ? '#16a34a' : '#dc2626', textAlign: 'right' }}>
                                                        {formatCurrency(item.amount)}
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!data || data.monthlyData.flatMap(m => m.details).filter(d => !d.isRealized).length === 0) && (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Não há lançamentos previstos no ano selecionado.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ABA: TABELA DFC MENSAL */}
                    {activeTab === 'table' && data && (
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>
                                        <th style={{ padding: '0.75rem 1rem', textAnchor: 'start', minWidth: '220px', textAlign: 'left' }}>Estrutura de Fluxo de Caixa</th>
                                        {data.monthlyData.map((m) => (
                                            <th key={m.month} style={{ padding: '0.75rem 0.5rem', minWidth: '95px', textAlign: 'right' }}>{m.name}</th>
                                        ))}
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', minWidth: '110px' }}>TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Saldo Inicial */}
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontWeight: 600 }}>
                                        <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>Saldo Inicial de Caixa</td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#475569' }}>
                                                {formatCurrency(m.startingBalance)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#475569' }}>
                                            {formatCurrency(data.startingBalanceJan1)}
                                        </td>
                                    </tr>

                                    {/* Entradas */}
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#16a34a' }}>
                                        <td style={{ padding: '0.75rem 1rem' }}>(+) Ingressos de Caixa (Recebimentos)</td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                                                {formatCurrency(m.inflows)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.inflows, 0))}
                                        </td>
                                    </tr>

                                    {/* Subcategorias Entradas */}
                                    {Object.values(
                                        data.monthlyData.reduce((acc, m) => {
                                            Object.values(m.categories).forEach(c => {
                                                if (c.isRevenue) {
                                                    acc[c.id] = { id: c.id, name: c.name };
                                                }
                                            });
                                            return acc;
                                        }, {} as Record<string, { id: string, name: string }>)
                                    ).map(cat => (
                                        <tr key={cat.id} style={{ borderBottom: '1px dotted #e2e8f0', color: '#64748b', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.5rem 2rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{cat.name}</td>
                                            {data.monthlyData.map((m) => (
                                                <td key={m.month} style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                                    {formatCurrency(m.categories[cat.id]?.amount || 0)}
                                                </td>
                                            ))}
                                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                                                {formatCurrency(data.monthlyData.reduce((sum, m) => sum + (m.categories[cat.id]?.amount || 0), 0))}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Saídas */}
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#dc2626' }}>
                                        <td style={{ padding: '0.75rem 1rem' }}>(-) Desembolsos de Caixa (Pagamentos)</td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                                                {formatCurrency(m.outflows)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.outflows, 0))}
                                        </td>
                                    </tr>

                                    {/* Subcategorias Saídas */}
                                    {Object.values(
                                        data.monthlyData.reduce((acc, m) => {
                                            Object.values(m.categories).forEach(c => {
                                                if (!c.isRevenue) {
                                                    acc[c.id] = { id: c.id, name: c.name };
                                                }
                                            });
                                            return acc;
                                        }, {} as Record<string, { id: string, name: string }>)
                                    ).map(cat => (
                                        <tr key={cat.id} style={{ borderBottom: '1px dotted #e2e8f0', color: '#64748b', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.5rem 2rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{cat.name}</td>
                                            {data.monthlyData.map((m) => (
                                                <td key={m.month} style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                                    {formatCurrency(m.categories[cat.id]?.amount || 0)}
                                                </td>
                                            ))}
                                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                                                {formatCurrency(data.monthlyData.reduce((sum, m) => sum + (m.categories[cat.id]?.amount || 0), 0))}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Saldo Líquido do Período */}
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontWeight: 700 }}>
                                        <td style={{ padding: '0.75rem 1rem', color: '#1e293b' }}>Saldo Líquido no Mês</td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: m.netFlow >= 0 ? '#16a34a' : '#dc2626' }}>
                                                {m.netFlow >= 0 ? '+' : ''}{formatCurrency(m.netFlow)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: data.monthlyData.reduce((sum, m) => sum + m.netFlow, 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.netFlow, 0))}
                                        </td>
                                    </tr>

                                    {/* Saldo Final */}
                                    <tr style={{ borderBottom: '2px solid #1e293b', backgroundColor: '#e2e8f0', fontWeight: 800, fontSize: '0.9rem' }}>
                                        <td style={{ padding: '0.75rem 1rem', color: '#0f172a' }}>(=) Saldo Final de Caixa</td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: m.endingBalance >= 0 ? '#1d4ed8' : '#b91c1c' }}>
                                                {formatCurrency(m.endingBalance)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: data.monthlyData[11]?.endingBalance >= 0 ? '#1d4ed8' : '#b91c1c' }}>
                                            {formatCurrency(data.monthlyData[11]?.endingBalance || 0)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ABA: AUDITORIA E CONCILIAÇÃO */}
                    {activeTab === 'audit' && data && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                            {/* Listagem de Contas e Saldos */}
                            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem' }}>Auditoria de Contas Financeiras</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                    {data.bankAccounts.map((acc) => (
                                        <div key={acc.id} style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>{acc.name}</h4>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sincronizado da API</span>
                                            </div>
                                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: acc.balance >= 0 ? '#1e293b' : '#ef4444' }}>
                                                {formatCurrency(acc.balance)}
                                            </span>
                                        </div>
                                    ))}
                                    {data.bankAccounts.length === 0 && (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Nenhuma conta financeira vinculada encontrada. Clique em Sincronizar.</div>
                                    )}
                                </div>
                            </div>

                            {/* Listagem de Inadimplência e Títulos em Aberto */}
                            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1rem' }}>Auditoria de Conciliação e Pendências</h3>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#475569' }}>
                                                <th style={{ padding: '0.75rem 1rem' }}>Data Vencimento</th>
                                                <th style={{ padding: '0.75rem 1rem' }}>Cliente/Fornecedor</th>
                                                <th style={{ padding: '0.75rem 1rem' }}>Descrição</th>
                                                <th style={{ padding: '0.75rem 1rem' }}>Categoria</th>
                                                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                                                <th style={{ padding: '0.75rem 1rem', textAnchor: 'end', textAlign: 'right' }}>Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.monthlyData.flatMap(m => m.details).filter(d => !d.isRealized).sort((a, b) => a.date.localeCompare(b.date)).map((item, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '0.75rem 1rem' }}>{new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#1e293b', fontWeight: 500 }}>{item.customer || '-'}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>{item.description}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{item.category}</td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>
                                                        {item.isOverdue ? (
                                                            <span style={{ padding: '0.2rem 0.5rem', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Atrasado (Inadimplente)</span>
                                                        ) : (
                                                            <span style={{ padding: '0.2rem 0.5rem', backgroundColor: '#f0fdf4', color: '#16a34a', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>No Prazo</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: item.isRevenue ? '#16a34a' : '#dc2626' }}>
                                                        {formatCurrency(item.amount)}
                                                    </td>
                                                </tr>
                                            ))}
                                            {data.monthlyData.flatMap(m => m.details).filter(d => !d.isRealized).length === 0 && (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Não há pendências de conciliação encontradas.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Injetar estilos de spin para o loader */}
            <style jsx global>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
