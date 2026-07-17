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
    const [selectedTenant, setSelectedTenant] = useState<string>('all');
    const [selectedCostCenter, setSelectedCostCenter] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<number>(2026);
    
    // Controles de projeção
    const [defaultRate, setDefaultRate] = useState<number>(0); // Inadimplência
    const [overdueAction, setOverdueAction] = useState<string>('today'); // 'today', 'ignore', 'original'
    
    // Dados da API
    const [data, setData] = useState<DFCResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [syncing, setSyncing] = useState<boolean>(false);
    const [syncLog, setSyncLog] = useState<string>('');
    
    // UI active tab
    const [activeTab, setActiveTab] = useState<'projection' | 'table' | 'audit' | 'car' | 'cap'>('projection');
    const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
    const [chartView, setChartView] = useState<'day' | 'week' | 'quinzena' | 'month'>('week');
    const [sidebarTab, setSidebarTab] = useState<'faturamento' | 'deducoes'>('faturamento');

    // Filtros e estados das novas abas CAR e CAP
    const [carSearch, setCarSearch] = useState<string>('');
    const [carStatusFilter, setCarStatusFilter] = useState<'all' | 'overdue' | 'ontime'>('all');
    const [carPage, setCarPage] = useState<number>(1);

    const [capSearch, setCapSearch] = useState<string>('');
    const [capStatusFilter, setCapStatusFilter] = useState<'all' | 'overdue' | 'ontime'>('all');
    const [capPage, setCapPage] = useState<number>(1);

    // Estados do modal de detalhamento de KPIs
    const [modalOpen, setModalOpen] = useState<boolean>(false);
    const [modalTitle, setModalTitle] = useState<string>('');
    const [modalType, setModalType] = useState<'balance' | 'inflows' | 'outflows' | 'projected' | null>(null);
    
    // Controle de seções expandidas do DFC
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        operational_in: false,
        operational_out: false,
        capex: false,
        financing: false
    });
    const [expandedTenants, setExpandedTenants] = useState<Record<string, boolean>>({});

    const toggleTenant = (tenantName: string) => {
        setExpandedTenants(prev => ({ ...prev, [tenantName]: !prev[tenantName] }));
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // 1. Carregar estrutura inicial (Setup)
    useEffect(() => {
        const loadSetup = async () => {
            try {
                const res = await fetch('/api/setup');
                const setup = await res.json();
                if (setup.success) {
                    setTenants(setup.tenants || []);
                    setCostCenters(setup.fullCostCenters || []);
                    
                    const cached = localStorage.getItem('selectedTenantId');
                    if (cached && (cached === 'all' || (setup.tenants && setup.tenants.some((t: any) => t.id === cached)))) {
                        setSelectedTenant(cached);
                    } else if (setup.tenants && setup.tenants.length > 0) {
                        setSelectedTenant(setup.tenants[0].id);
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

    // Filtrar centros de custo da empresa selecionada (ou todos se consolidado)
    const filteredCCs = selectedTenant === 'all' 
        ? costCenters 
        : costCenters.filter((cc) => cc.tenantId === selectedTenant);

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

    // Resetar páginas de paginação ao trocar os filtros globais
    useEffect(() => {
        setCarPage(1);
        setCapPage(1);
    }, [selectedTenant, selectedYear, selectedCostCenter, defaultRate, overdueAction]);

    // 3. Sincronizar dados do Conta Azul
    const handleSync = async () => {
        if (!selectedTenant) return;
        setSyncing(true);
        setSyncLog('Iniciando sincronização com Conta Azul...');
        try {
            const today = new Date();
            const curMonth = today.getMonth() + 1;
            // Se for consolidado (all), sincroniza apenas os últimos 2 meses para evitar timeout na Vercel.
            // Se for empresa única, sincroniza de Janeiro até o mês atual.
            const startMonth = selectedTenant === 'all' ? Math.max(1, curMonth - 1) : 1;
            const endMonth = curMonth;

            const res = await fetch(
                `/api/cron/sync?tenantId=${selectedTenant}&year=${selectedYear}&startMonth=${startMonth}&endMonth=${endMonth}`
            );
            
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await res.text();
                console.error("Non-JSON response from sync API:", text);
                throw new Error("O servidor demorou muito para responder (Timeout) ou ocorreu um erro interno. Tente sincronizar uma empresa de cada vez.");
            }

            const result = await res.json();
            if (result.success) {
                // Verificar se alguma empresa reportou erro de rate limit ou expiração
                const errors = result.report?.filter((r: any) => r.error) || [];
                if (errors.length > 0) {
                    const firstErr = errors[0];
                    setSyncLog(`⚠️ Sincronizado com avisos. ${firstErr.tenant}: ${firstErr.error.includes('429') ? 'Limite de requisições excedido no Conta Azul. Tente novamente em instantes.' : firstErr.error}`);
                } else {
                    setSyncLog('✅ Sincronização concluída com sucesso!');
                    setTimeout(() => setSyncLog(''), 4000);
                }
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

    // Agrupamento dinâmico da projeção diária do gráfico
    const groupedProjection = React.useMemo(() => {
        if (!data || !data.dailyProjection) return [];
        const rawPoints = data.dailyProjection;
        
        if (chartView === 'day') {
            return rawPoints;
        }
        
        const result: any[] = [];
        let currentGroup: any = null;
        let daysInGroup = 0;

        rawPoints.forEach((p, idx) => {
            const date = new Date(p.date);
            let belongsToNewGroup = false;

            if (!currentGroup) {
                belongsToNewGroup = true;
            } else {
                if (chartView === 'week') {
                    belongsToNewGroup = daysInGroup >= 7;
                } else if (chartView === 'quinzena') {
                    belongsToNewGroup = daysInGroup >= 15;
                } else if (chartView === 'month') {
                    const prevDate = new Date(currentGroup.rawDate);
                    belongsToNewGroup = date.getMonth() !== prevDate.getMonth();
                }
            }

            if (belongsToNewGroup) {
                if (currentGroup) {
                    result.push(currentGroup);
                }
                currentGroup = {
                    date: p.date,
                    rawDate: p.date,
                    formattedDate: chartView === 'month' 
                        ? date.toLocaleString('pt-BR', { month: 'short' }).toUpperCase()
                        : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                    inflows: p.inflows || 0,
                    outflows: p.outflows || 0,
                    netFlow: p.netFlow || 0,
                    balance: p.balance
                };
                daysInGroup = 1;
            } else {
                currentGroup.inflows += (p.inflows || 0);
                currentGroup.outflows += (p.outflows || 0);
                currentGroup.netFlow += (p.netFlow || 0);
                currentGroup.balance = p.balance;
                daysInGroup++;
            }
        });

        if (currentGroup) {
            result.push(currentGroup);
        }

        return result;
    }, [data, chartView]);

    // Calcular valores agregados para os cards
    const cardTotals = React.useMemo(() => {
        if (!data) return { current: 0, inflows: 0, outflows: 0, projected: 0 };
        
        let inflows = 0;
        let outflows = 0;
        let allFutureInflows = 0;
        let allFutureOutflows = 0;
        
        const today = new Date();
        const curYear = today.getFullYear();
        const curMonthIdx = today.getMonth(); // 0 to 11
        
        // Sum expected values (not realized yet) across all months up to the current month of the selected year
        data.monthlyData.forEach(m => {
            const isPastOrCurrentMonth = 
                selectedYear < curYear || 
                (selectedYear === curYear && (m.month - 1) <= curMonthIdx);
                
            m.details.forEach(d => {
                if (!d.isRealized) {
                    if (d.isRevenue) {
                        allFutureInflows += d.amount;
                        if (isPastOrCurrentMonth) inflows += d.amount;
                    } else {
                        allFutureOutflows += d.amount;
                        if (isPastOrCurrentMonth) outflows += d.amount;
                    }
                }
            });
        });

        // Use the last element of the daily projection as the projected final balance
        const projectedBalance = data.dailyProjection && data.dailyProjection.length > 0
            ? data.dailyProjection[data.dailyProjection.length - 1].balance
            : (data.currentBankBalance + allFutureInflows - allFutureOutflows);

        return {
            current: data.currentBankBalance,
            inflows,
            outflows,
            projected: projectedBalance
        };
    }, [data, selectedYear]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const getCategoriesByClass = (dfcClass: string) => {
        if (!data) return [];
        return Object.values(
            data.monthlyData.reduce((acc, m) => {
                Object.values(m.categories).forEach(c => {
                    if (c.dfcClass === dfcClass) {
                        acc[c.name] = { name: c.name };
                    }
                });
                return acc;
            }, {} as Record<string, { name: string }>)
        ).sort((a, b) => a.name.localeCompare(b.name));
    };



    // Renderização do gráfico SVG de projeção diária/semanal/mensal
    const renderChart = () => {
        if (!data || !data.dailyProjection || data.dailyProjection.length === 0) return null;

        // --- CALCULATE DASHBOARD TOTALS & AGGREGATIONS ---
        const totalFaturamento = data.monthlyData.reduce((sum, m) => sum + m.recebimentosOperacionais, 0);
        const totalDespesas = data.monthlyData.reduce((sum, m) => sum + m.pagamentosOperacionais, 0);
        const totalLucro = totalFaturamento - totalDespesas;

        // Deduções (Tributos / Grupo 02 ou 2.)
        const totalDeducoes = data.monthlyData.reduce((sum, m) => {
            return sum + Object.values(m.categories).reduce((acc, c) => {
                const nameUpper = c.name.toUpperCase();
                const isTax = nameUpper.startsWith('02') || nameUpper.startsWith('2.') || 
                              nameUpper.includes('SIMPLES NACIONAL') || nameUpper.includes('DAS') ||
                              nameUpper.includes('TRIBUTO') || nameUpper.includes('IMPOSTO');
                return acc + (isTax ? c.amount : 0);
            }, 0);
        }, 0);

        // Aggregate Revenues
        const revenueMap: Record<string, number> = {};
        data.monthlyData.forEach(m => {
            Object.values(m.categories).forEach(c => {
                if (c.dfcClass === 'OPERATIONAL_IN') {
                    revenueMap[c.name] = (revenueMap[c.name] || 0) + c.amount;
                }
            });
        });
        const revenueCats = Object.entries(revenueMap)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);

        // Aggregate Deduções (Taxes)
        const taxMap: Record<string, number> = {};
        data.monthlyData.forEach(m => {
            Object.values(m.categories).forEach(c => {
                const nameUpper = c.name.toUpperCase();
                const isTax = nameUpper.startsWith('02') || nameUpper.startsWith('2.') || 
                              nameUpper.includes('SIMPLES NACIONAL') || nameUpper.includes('DAS') ||
                              nameUpper.includes('TRIBUTO') || nameUpper.includes('IMPOSTO');
                if (isTax) {
                    taxMap[c.name] = (taxMap[c.name] || 0) + c.amount;
                }
            });
        });
        const taxCats = Object.entries(taxMap)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);

        // Aggregate Expenses (Operational Outflows without Taxes)
        const expenseMap: Record<string, number> = {};
        data.monthlyData.forEach(m => {
            Object.values(m.categories).forEach(c => {
                const nameUpper = c.name.toUpperCase();
                const isTax = nameUpper.startsWith('02') || nameUpper.startsWith('2.') || 
                              nameUpper.includes('SIMPLES NACIONAL') || nameUpper.includes('DAS') ||
                              nameUpper.includes('TRIBUTO') || nameUpper.includes('IMPOSTO');
                if (c.dfcClass === 'OPERATIONAL_OUT' && !isTax) {
                    expenseMap[c.name] = (expenseMap[c.name] || 0) + c.amount;
                }
            });
        });
        const expenseCats = Object.entries(expenseMap)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', boxSizing: 'border-box' }}>
                {/* 1. TOP STATS BAR (Faturamento, Despesas, Lucro, Donut Chart) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', width: '100%' }}>
                    {/* Left block: 3 KPI Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* KPI Faturamento */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#e6f4ea', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#137333', fontSize: '1.2rem' }}>
                                💰
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Faturamento</span>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#137333', margin: 0 }}>{formatCurrency(totalFaturamento)}</h2>
                            </div>
                        </div>
                        {/* KPI Despesas */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#fce8e6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c5221f', fontSize: '1.2rem' }}>
                                📉
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Despesas</span>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#c5221f', margin: 0 }}>{formatCurrency(totalDespesas)}</h2>
                            </div>
                        </div>
                        {/* KPI Lucro */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a73e8', fontSize: '1.2rem' }}>
                                📈
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Fluxo Operacional (Lucro)</span>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: totalLucro >= 0 ? '#1a73e8' : '#c5221f', margin: 0 }}>{formatCurrency(totalLucro)}</h2>
                            </div>
                        </div>
                    </div>

                    {/* Donut Chart block for expense breakout */}
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Distribuição de Despesas Operacionais</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', height: '100%' }}>
                            {/* SVG Donut */}
                            <div style={{ position: 'relative', width: '100px', height: '100px', flexShrink: 0 }}>
                                <svg width="100" height="100" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="4" />
                                    {(() => {
                                        let accumulatedPercent = 0;
                                        const colors = ['#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#6366f1'];
                                        const totalOpExpenses = expenseCats.reduce((sum, c) => sum + c.amount, 0) || 1;
                                        return expenseCats.slice(0, 4).map((c, idx) => {
                                            const pct = (c.amount / totalOpExpenses) * 100;
                                            const dashArray = `${pct} ${100 - pct}`;
                                            const dashOffset = 100 - accumulatedPercent + 25; // 25 to start at top
                                            accumulatedPercent += pct;
                                            return (
                                                <circle
                                                    key={idx}
                                                    cx="18"
                                                    cy="18"
                                                    r="15.915"
                                                    fill="none"
                                                    stroke={colors[idx % colors.length]}
                                                    strokeWidth="4"
                                                    strokeDasharray={dashArray}
                                                    strokeDashoffset={dashOffset}
                                                />
                                            );
                                        });
                                    })()}
                                </svg>
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>DFC</div>
                            </div>
                            {/* Legends and Shares */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
                                {(() => {
                                    const colors = ['#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#6366f1'];
                                    const totalOpExpenses = expenseCats.reduce((sum, c) => sum + c.amount, 0) || 1;
                                    return expenseCats.slice(0, 4).map((c, idx) => {
                                        const pct = (c.amount / totalOpExpenses) * 100;
                                        return (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475569', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: colors[idx % colors.length], borderRadius: '50%', flexShrink: 0 }}></span>
                                                    {c.name.replace(/^\d+(\.\d+)*\s*-?\s*/, '')}
                                                </span>
                                                <span style={{ fontWeight: 700, color: '#0f172a' }}>{pct.toFixed(1)}%</span>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Right block: Deduções KPI & Sidebar tab toggles */}
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>% Deduções (Tributos)</span>
                            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#d97706', margin: '0.2rem 0 0' }}>{formatCurrency(totalDeducoes)}</h2>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: '#64748b' }}>
                                {totalFaturamento > 0 ? `${((totalDeducoes / totalFaturamento) * 100).toFixed(1)}% do faturamento total` : '0%'}
                            </p>
                        </div>
                        {/* Sidebar Toggles */}
                        <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '2px', borderRadius: '8px', gap: '2px', marginTop: '1rem' }}>
                            <button 
                                onClick={() => setSidebarTab('faturamento')}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: sidebarTab === 'faturamento' ? '#ffffff' : 'transparent',
                                    color: sidebarTab === 'faturamento' ? '#0f172a' : '#64748b',
                                    fontWeight: 700,
                                    fontSize: '0.72rem',
                                    padding: '0.35rem 0',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    boxShadow: sidebarTab === 'faturamento' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            >
                                Faturamento
                            </button>
                            <button 
                                onClick={() => setSidebarTab('deducoes')}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: sidebarTab === 'deducoes' ? '#ffffff' : 'transparent',
                                    color: sidebarTab === 'deducoes' ? '#0f172a' : '#64748b',
                                    fontWeight: 700,
                                    fontSize: '0.72rem',
                                    padding: '0.35rem 0',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    boxShadow: sidebarTab === 'deducoes' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            >
                                Deduções
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. BOTTOM MAIN GRID (Charts + Sidebar Lists) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '1.5rem', width: '100%', alignItems: 'stretch' }}>
                    {/* Left Column: Visual Charts (Bar Chart and Line Chart) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
                        {/* Chart 1: Faturamento e Despesas (Bar Chart) */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Faturamento vs Despesas (Mensal)</h3>
                            <div style={{ overflowX: 'auto', width: '100%' }}>
                                <svg width="100%" height="160" viewBox="0 0 600 160" style={{ overflow: 'visible', minWidth: '450px' }}>
                                    {/* Monthly comparison bars */}
                                    {(() => {
                                        const months = data.monthlyData;
                                        const maxVal = Math.max(...months.map(m => Math.max(m.recebimentosOperacionais, m.pagamentosOperacionais)), 1000) * 1.1;
                                        const heightScale = 110 / maxVal;
                                        const colWidth = 600 / months.length;
                                        const barW = Math.max(4, colWidth * 0.25);
                                        return months.map((m, idx) => {
                                            const x = idx * colWidth + colWidth / 2;
                                            const inH = m.recebimentosOperacionais * heightScale;
                                            const outH = m.pagamentosOperacionais * heightScale;
                                            const inY = 120 - inH;
                                            const outY = 120 - outH;
                                            return (
                                                <g key={m.month}>
                                                    {/* Faturamento Bar (Green) */}
                                                    <rect x={x - barW - 1} y={inY} width={barW} height={inH} fill="#10b981" rx="2" />
                                                    {/* Despesas Bar (Red) */}
                                                    <rect x={x + 1} y={outY} width={barW} height={outH} fill="#ef4444" rx="2" />
                                                    {/* Month label */}
                                                    <text x={x} y="138" textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="600">{m.name}</text>
                                                </g>
                                            );
                                        });
                                    })()}
                                    <line x1="0" y1="120" x2="600" y2="120" stroke="#e2e8f0" strokeWidth="1.5" />
                                </svg>
                            </div>
                        </div>

                        {/* Chart 2: Saldo por dia (Line Chart) */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saldo Bancário Diário (Projeção)</h3>
                                {/* Controls */}
                                <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                                    {(['day', 'week', 'quinzena', 'month'] as const).map((view) => {
                                        const labelMap = { day: 'Dia', week: 'Sem', quinzena: 'Quin', month: 'Mês' };
                                        const isActive = chartView === view;
                                        return (
                                            <button
                                                key={view}
                                                onClick={() => setChartView(view)}
                                                style={{
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '4px',
                                                    border: 'none',
                                                    backgroundColor: isActive ? '#ffffff' : 'transparent',
                                                    color: isActive ? '#0f172a' : '#64748b',
                                                    fontWeight: 600,
                                                    fontSize: '0.65rem',
                                                    cursor: 'pointer',
                                                    boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                {labelMap[view]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={{ overflowX: 'auto', width: '100%' }}>
                                <svg width="100%" height="150" viewBox="0 0 600 150" style={{ overflow: 'visible', minWidth: '450px' }}>
                                    {/* Daily Projection Line & Area */}
                                    {(() => {
                                        const chartPoints = chartView === 'day' ? groupedProjection.slice(0, 45) : groupedProjection;
                                        if (chartPoints.length === 0) return null;
                                        const balances = chartPoints.map(p => p.balance);
                                        const maxBal = Math.max(...balances, 1000);
                                        const minBal = Math.min(...balances, -1000);
                                        const range = maxBal - minBal || 1;
                                        const getX = (idx: number) => (idx / (chartPoints.length - 1)) * 600;
                                        const getY = (val: number) => 120 - ((val - minBal) / range) * 100;

                                        let dPath = '';
                                        let areaPath = `M 0 120`;
                                        chartPoints.forEach((p, idx) => {
                                            const x = getX(idx);
                                            const y = getY(p.balance);
                                            if (idx === 0) {
                                                dPath += `M ${x} ${y}`;
                                                areaPath += ` L ${x} ${y}`;
                                            } else {
                                                dPath += ` L ${x} ${y}`;
                                                areaPath += ` L ${x} ${y}`;
                                            }
                                        });
                                        areaPath += ` L ${getX(chartPoints.length - 1)} 120 Z`;

                                        return (
                                            <g>
                                                {/* Gradient fill */}
                                                <path d={areaPath} fill="rgba(37, 99, 235, 0.08)" />
                                                {/* Baseline zero */}
                                                <line x1="0" y1={getY(0)} x2="600" y2={getY(0)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3,3" />
                                                {/* Main Balance Line */}
                                                <path d={dPath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
                                                {/* Start/End labels */}
                                                <text x="5" y={getY(balances[0]) - 8} fontSize="8" fontWeight="700" fill="#2563eb">{formatCurrency(balances[0])}</text>
                                                <text x="595" y={getY(balances[balances.length - 1]) - 8} textAnchor="end" fontSize="8" fontWeight="700" fill="#2563eb">{formatCurrency(balances[balances.length - 1])}</text>
                                            </g>
                                        );
                                    })()}
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Progress Bars list for Faturamento or Deduções */}
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '1rem', boxSizing: 'border-box' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {sidebarTab === 'faturamento' ? 'Faturamento por Categoria' : 'Deduções por Categoria'}
                        </span>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', maxHeight: '350px', paddingRight: '4px' }}>
                            {(() => {
                                const list = sidebarTab === 'faturamento' ? revenueCats : taxCats;
                                const maxAmount = list.length > 0 ? list[0].amount : 1;
                                return list.slice(0, 10).map((cat, idx) => {
                                    const pctWidth = (cat.amount / maxAmount) * 100;
                                    const barColor = sidebarTab === 'faturamento' ? '#10b981' : '#f59e0b';
                                    return (
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600 }}>
                                                <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }} title={cat.name}>
                                                    {cat.name.replace(/^\d+(\.\d+)*\s*-?\s*/, '')}
                                                </span>
                                                <span style={{ color: '#0f172a' }}>{formatCurrency(cat.amount)}</span>
                                            </div>
                                            <div style={{ height: '7px', width: '100%', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${Math.max(1, pctWidth)}%`, background: barColor, borderRadius: '4px' }} />
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                            {((sidebarTab === 'faturamento' && revenueCats.length === 0) || (sidebarTab === 'deducoes' && taxCats.length === 0)) && (
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>
                                    Sem dados para este período.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1600px', width: '100%', boxSizing: 'border-box', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif', color: '#334155', backgroundColor: '#f8fafc', minHeight: '100vh', overflowX: 'hidden' }}>
            
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
                            <option value="all">CONSOLIDADO (TODAS AS EMPRESAS)</option>
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
                            {[2026].map((y) => (
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem', width: '100%', boxSizing: 'border-box' }}>
                {/* Saldo Inicial */}
                <div 
                    onClick={() => {
                        setModalTitle('Detalhamento de Saldo Bancário Atual');
                        setModalType('balance');
                        setModalOpen(true);
                    }}
                    style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Saldo Bancário Atual</span>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.1rem 0 0' }}>{formatCurrency(cardTotals.current)}</h2>
                    </div>
                </div>

                {/* Recebíveis Previstos */}
                <div 
                    onClick={() => {
                        setModalTitle('Recebimentos em Aberto (CAR)');
                        setModalType('inflows');
                        setModalOpen(true);
                    }}
                    style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Recebimentos em Aberto</span>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a', margin: '0.1rem 0 0' }}>{formatCurrency(cardTotals.inflows)}</h2>
                    </div>
                </div>

                {/* Pagamentos Previstos */}
                <div 
                    onClick={() => {
                        setModalTitle('Pagamentos em Aberto (CAP)');
                        setModalType('outflows');
                        setModalOpen(true);
                    }}
                    style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>
                    </div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Pagamentos em Aberto</span>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#dc2626', margin: '0.1rem 0 0' }}>{formatCurrency(cardTotals.outflows)}</h2>
                    </div>
                </div>

                {/* Saldo Final Projetado */}
                <div 
                    onClick={() => {
                        setModalTitle('Fórmula de Projeção do Saldo Final');
                        setModalType('projected');
                        setModalOpen(true);
                    }}
                    style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1.5rem', border: '1px solid #334155', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}
                >
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
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
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
                    onClick={() => setActiveTab('car')}
                    style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activeTab === 'car' ? '#cbd5e1' : 'transparent',
                        color: activeTab === 'car' ? '#0f172a' : '#64748b',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s, color 0.2s'
                    }}
                >
                    Contas a Receber (CAR)
                </button>
                <button
                    onClick={() => setActiveTab('cap')}
                    style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activeTab === 'cap' ? '#cbd5e1' : 'transparent',
                        color: activeTab === 'cap' ? '#0f172a' : '#64748b',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s, color 0.2s'
                    }}
                >
                    Contas a Pagar (CAP)
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
                            {(() => {
                                const today = new Date();
                                const curYear = today.getFullYear();
                                const curMonthIdx = today.getMonth();

                                const pendingItems = data
                                    ? data.monthlyData
                                        .filter(m => selectedYear < curYear || (selectedYear === curYear && (m.month - 1) <= curMonthIdx))
                                        .flatMap(m => m.details)
                                        .filter(d => !d.isRealized)
                                    : [];

                                // Agrupar por empresa
                                const grouped = pendingItems.reduce((acc, item) => {
                                    const tName = item.tenantName || 'Empresa Desconhecida';
                                    if (!acc[tName]) {
                                        acc[tName] = {
                                            name: tName,
                                            items: [],
                                            totalInflow: 0,
                                            totalOutflow: 0
                                        };
                                    }
                                    acc[tName].items.push(item);
                                    if (item.isRevenue) {
                                        acc[tName].totalInflow += item.amount;
                                    } else {
                                        acc[tName].totalOutflow += item.amount;
                                    }
                                    return acc;
                                }, {} as Record<string, { name: string; items: any[]; totalInflow: number; totalOutflow: number }>);

                                const tenantGroups = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));

                                return (
                                    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', width: '100%', boxSizing: 'border-box' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1.25rem' }}>Contas a Receber e Pagar Previstas</h3>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {tenantGroups.map((group) => {
                                                const isExpanded = !!expandedTenants[`projection-${group.name}`];
                                                return (
                                                    <div key={group.name} style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                                                        {/* Header do Accordion */}
                                                        <div 
                                                            onClick={() => toggleTenant(`projection-${group.name}`)}
                                                            style={{ 
                                                                padding: '1.25rem 1.5rem', 
                                                                display: 'flex', 
                                                                justifyContent: 'space-between', 
                                                                alignItems: 'center', 
                                                                cursor: 'pointer', 
                                                                backgroundColor: '#f8fafc',
                                                                borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                                                                userSelect: 'none',
                                                                transition: 'background-color 0.2s',
                                                                flexWrap: 'wrap',
                                                                gap: '1rem'
                                                            }}
                                                        >
                                                            {/* Lado Esquerdo */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                <svg 
                                                                    width="16" 
                                                                    height="16" 
                                                                    viewBox="0 0 24 24" 
                                                                    fill="none" 
                                                                    stroke="#475569" 
                                                                    strokeWidth="2.5" 
                                                                    style={{ 
                                                                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                                                                        transition: 'transform 0.2s' 
                                                                    }}
                                                                >
                                                                    <polyline points="9 18 15 12 9 6" />
                                                                </svg>
                                                                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{group.name}</span>
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#e2e8f0', color: '#475569', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                                                                    {group.items.length} {group.items.length === 1 ? 'título' : 'títulos'}
                                                                </span>
                                                            </div>

                                                            {/* Lado Direito */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Entradas</span>
                                                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#16a34a' }}>{formatCurrency(group.totalInflow)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Saídas</span>
                                                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(group.totalOutflow)}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Detalhamento */}
                                                        {isExpanded && (
                                                            <div style={{ overflowX: 'auto', width: '100%' }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                                                                    <thead>
                                                                        <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#475569', backgroundColor: '#ffffff' }}>
                                                                            <th style={{ padding: '0.75rem 1.5rem' }}>Data</th>
                                                                            <th style={{ padding: '0.75rem 1.5rem' }}>Tipo</th>
                                                                            <th style={{ padding: '0.75rem 1.5rem' }}>Descrição</th>
                                                                            <th style={{ padding: '0.75rem 1.5rem' }}>Cliente/Fornecedor</th>
                                                                            <th style={{ padding: '0.75rem 1.5rem' }}>Categoria</th>
                                                                            <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>Valor</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {group.items.sort((a, b) => a.date.localeCompare(b.date)).map((item, idx) => (
                                                                            <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                                                                                <td style={{ padding: '0.75rem 1.5rem', fontWeight: 500 }}>
                                                                                    {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                                    {item.isOverdue && <span style={{ display: 'inline-block', marginLeft: '0.5rem', padding: '0.1rem 0.4rem', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600 }}>ATRASADO</span>}
                                                                                </td>
                                                                                <td style={{ padding: '0.75rem 1.5rem' }}>
                                                                                    <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: item.isRevenue ? '#f0fdf4' : '#fef2f2', color: item.isRevenue ? '#16a34a' : '#dc2626' }}>
                                                                                        {item.isRevenue ? 'ENTRADA' : 'SAÍDA'}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ padding: '0.75rem 1.5rem', color: '#1e293b' }}>{item.description || 'Lançamento previsto'}</td>
                                                                                <td style={{ padding: '0.75rem 1.5rem', color: '#64748b' }}>{item.customer || '-'}</td>
                                                                                <td style={{ padding: '0.75rem 1.5rem', color: '#64748b' }}>{item.category}</td>
                                                                                <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, color: item.isRevenue ? '#16a34a' : '#dc2626', textAlign: 'right' }}>
                                                                                    {formatCurrency(item.amount)}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {tenantGroups.length === 0 && (
                                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '3rem', border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8' }}>
                                                    Não há lançamentos previstos no ano selecionado.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* ABA: TABELA DFC MENSAL */}
                    {activeTab === 'table' && data && (
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflowX: 'auto', width: '100%', boxSizing: 'border-box' }}>
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
                                                {/* 1. Saldo Inicial */}
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

                                    {/* 2. (+) Recebimentos Operacionais */}
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#16a34a', cursor: 'pointer', backgroundColor: '#f0fdf4' }} onClick={() => toggleSection('operational_in')}>
                                        <td style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.65rem', display: 'inline-block', transition: 'transform 0.15s', transform: expandedSections.operational_in ? 'rotate(90deg)' : 'none' }}>▶</span>
                                            (+) Recebimentos Operacionais
                                        </td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                                                {formatCurrency(m.recebimentosOperacionais)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.recebimentosOperacionais, 0))}
                                        </td>
                                    </tr>

                                    {/* Subcategorias Recebimentos Operacionais */}
                                    {expandedSections.operational_in && getCategoriesByClass('OPERATIONAL_IN').map(cat => (
                                        <tr key={cat.name} style={{ borderBottom: '1px dotted #e2e8f0', color: '#64748b', fontSize: '0.8rem', backgroundColor: '#fafafa' }}>
                                            <td style={{ padding: '0.5rem 2rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{cat.name}</td>
                                            {data.monthlyData.map((m) => (
                                                <td key={m.month} style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                                    {formatCurrency(m.categories[cat.name]?.amount || 0)}
                                                </td>
                                            ))}
                                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                                                {formatCurrency(data.monthlyData.reduce((sum, m) => sum + (m.categories[cat.name]?.amount || 0), 0))}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* 3. (-) Pagamentos Operacionais */}
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#dc2626', cursor: 'pointer', backgroundColor: '#fef2f2' }} onClick={() => toggleSection('operational_out')}>
                                        <td style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.65rem', display: 'inline-block', transition: 'transform 0.15s', transform: expandedSections.operational_out ? 'rotate(90deg)' : 'none' }}>▶</span>
                                            (-) Pagamentos Operacionais
                                        </td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                                                {formatCurrency(m.pagamentosOperacionais)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.pagamentosOperacionais, 0))}
                                        </td>
                                    </tr>

                                    {/* Subcategorias Pagamentos Operacionais */}
                                    {expandedSections.operational_out && getCategoriesByClass('OPERATIONAL_OUT').map(cat => (
                                        <tr key={cat.name} style={{ borderBottom: '1px dotted #e2e8f0', color: '#64748b', fontSize: '0.8rem', backgroundColor: '#fafafa' }}>
                                            <td style={{ padding: '0.5rem 2rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{cat.name}</td>
                                            {data.monthlyData.map((m) => (
                                                <td key={m.month} style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                                    {formatCurrency(m.categories[cat.name]?.amount || 0)}
                                                </td>
                                            ))}
                                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                                                {formatCurrency(data.monthlyData.reduce((sum, m) => sum + (m.categories[cat.name]?.amount || 0), 0))}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* 4. (=) Fluxo de Caixa Operacional */}
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontWeight: 700 }}>
                                        <td style={{ padding: '0.75rem 1rem', color: '#1e293b' }}>(=) Fluxo de Caixa Operacional</td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: m.fluxoOperacional >= 0 ? '#16a34a' : '#dc2626' }}>
                                                {m.fluxoOperacional >= 0 ? '+' : ''}{formatCurrency(m.fluxoOperacional)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: data.monthlyData.reduce((sum, m) => sum + m.fluxoOperacional, 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.fluxoOperacional, 0))}
                                        </td>
                                    </tr>

                                    {/* 5. (-) CAPEX */}
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#d97706', cursor: 'pointer', backgroundColor: '#fffbeb' }} onClick={() => toggleSection('capex')}>
                                        <td style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.65rem', display: 'inline-block', transition: 'transform 0.15s', transform: expandedSections.capex ? 'rotate(90deg)' : 'none' }}>▶</span>
                                            (-) CAPEX (Investimentos em Imobilizado)
                                        </td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                                                {formatCurrency(m.capex)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.capex, 0))}
                                        </td>
                                    </tr>

                                    {/* Subcategorias CAPEX */}
                                    {expandedSections.capex && getCategoriesByClass('CAPEX').map(cat => (
                                        <tr key={cat.name} style={{ borderBottom: '1px dotted #e2e8f0', color: '#64748b', fontSize: '0.8rem', backgroundColor: '#fafafa' }}>
                                            <td style={{ padding: '0.5rem 2rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{cat.name}</td>
                                            {data.monthlyData.map((m) => (
                                                <td key={m.month} style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                                    {formatCurrency(m.categories[cat.name]?.amount || 0)}
                                                </td>
                                            ))}
                                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                                                {formatCurrency(data.monthlyData.reduce((sum, m) => sum + (m.categories[cat.name]?.amount || 0), 0))}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* 6. (+/-) Fluxo de Financiamento */}
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#4f46e5', cursor: 'pointer', backgroundColor: '#eef2ff' }} onClick={() => toggleSection('financing')}>
                                        <td style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.65rem', display: 'inline-block', transition: 'transform 0.15s', transform: expandedSections.financing ? 'rotate(90deg)' : 'none' }}>▶</span>
                                            (+/-) Fluxo de Financiamento
                                        </td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: m.fluxoFinanciamento >= 0 ? '#4f46e5' : '#b91c1c' }}>
                                                {m.fluxoFinanciamento >= 0 ? '+' : ''}{formatCurrency(m.fluxoFinanciamento)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: data.monthlyData.reduce((sum, m) => sum + m.fluxoFinanciamento, 0) >= 0 ? '#4f46e5' : '#b91c1c' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.fluxoFinanciamento, 0))}
                                        </td>
                                    </tr>

                                    {/* Subcategorias Fluxo de Financiamento */}
                                    {expandedSections.financing && getCategoriesByClass('FINANCING').map(cat => (
                                        <tr key={cat.name} style={{ borderBottom: '1px dotted #e2e8f0', color: '#64748b', fontSize: '0.8rem', backgroundColor: '#fafafa' }}>
                                            <td style={{ padding: '0.5rem 2rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{cat.name}</td>
                                            {data.monthlyData.map((m) => (
                                                <td key={m.month} style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                                    {formatCurrency(m.categories[cat.name]?.amount || 0)}
                                                </td>
                                            ))}
                                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                                                {formatCurrency(data.monthlyData.reduce((sum, m) => sum + (m.categories[cat.name]?.amount || 0), 0))}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* 7. Saldo Final */}
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
                    {activeTab === 'audit' && data && (() => {
                        const today = new Date();
                        const curYear = today.getFullYear();
                        const curMonthIdx = today.getMonth();

                        // Contas bancárias agrupadas por empresa
                        const groupedAccounts = data.bankAccounts.reduce((acc, accItem) => {
                            const tName = accItem.tenant?.name || 'Empresa Desconhecida';
                            if (!acc[tName]) {
                                acc[tName] = [];
                            }
                            acc[tName].push(accItem);
                            return acc;
                        }, {} as Record<string, typeof data.bankAccounts>);

                        // Filtrar pendências de acordo com o limite do mês corrente
                        const pendingItems = data.monthlyData
                            .filter(m => selectedYear < curYear || (selectedYear === curYear && (m.month - 1) <= curMonthIdx))
                            .flatMap(m => m.details)
                            .filter(d => !d.isRealized);

                        // Pendências agrupadas por empresa
                        const groupedPending = pendingItems.reduce((acc, item) => {
                            const tName = item.tenantName || 'Empresa Desconhecida';
                            if (!acc[tName]) {
                                acc[tName] = {
                                    name: tName,
                                    items: [],
                                    totalInflow: 0,
                                    totalOutflow: 0
                                };
                            }
                            acc[tName].items.push(item);
                            if (item.isRevenue) {
                                acc[tName].totalInflow += item.amount;
                            } else {
                                acc[tName].totalOutflow += item.amount;
                            }
                            return acc;
                        }, {} as Record<string, { name: string; items: any[]; totalInflow: number; totalOutflow: number }>);

                        const pendingGroups = Object.values(groupedPending).sort((a, b) => a.name.localeCompare(b.name));

                        return (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                                {/* Listagem de Contas e Saldos Agrupados */}
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1.25rem' }}>Auditoria de Contas Financeiras</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {Object.entries(groupedAccounts).sort((a, b) => a[0].localeCompare(b[0])).map(([tName, accounts]) => (
                                            <div key={tName}>
                                                <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.25rem', letterSpacing: '0.05em' }}>
                                                    {tName}
                                                </h4>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                                    {accounts.map((acc) => (
                                                        <div key={acc.id} style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                                                            <h5 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>{acc.name}</h5>
                                                            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: acc.balance >= 0 ? '#1e293b' : '#ef4444' }}>
                                                                {formatCurrency(acc.balance)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {data.bankAccounts.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Nenhuma conta financeira vinculada encontrada. Clique em Sincronizar.</div>
                                        )}
                                    </div>
                                </div>

                                {/* Listagem de Inadimplência e Títulos em Aberto Agrupados */}
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1.25rem' }}>Auditoria de Conciliação e Pendências</h3>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {pendingGroups.map((group) => {
                                            const isExpanded = !!expandedTenants[`audit-${group.name}`];
                                            return (
                                                <div key={group.name} style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                                                    {/* Header do Accordion */}
                                                    <div 
                                                        onClick={() => toggleTenant(`audit-${group.name}`)}
                                                        style={{ 
                                                            padding: '1.25rem 1.5rem', 
                                                            display: 'flex', 
                                                            justifyContent: 'space-between', 
                                                            alignItems: 'center', 
                                                            cursor: 'pointer', 
                                                            backgroundColor: '#f8fafc',
                                                            borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                                                            userSelect: 'none',
                                                            transition: 'background-color 0.2s',
                                                            flexWrap: 'wrap',
                                                            gap: '1rem'
                                                        }}
                                                    >
                                                        {/* Lado Esquerdo */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <svg 
                                                                width="16" 
                                                                height="16" 
                                                                viewBox="0 0 24 24" 
                                                                fill="none" 
                                                                stroke="#475569" 
                                                                strokeWidth="2.5" 
                                                                style={{ 
                                                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                                                                    transition: 'transform 0.2s' 
                                                                }}
                                                            >
                                                                <polyline points="9 18 15 12 9 6" />
                                                            </svg>
                                                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{group.name}</span>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#e2e8f0', color: '#475569', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                                                                {group.items.length} {group.items.length === 1 ? 'pendência' : 'pendências'}
                                                            </span>
                                                        </div>

                                                        {/* Lado Direito */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>A Receber</span>
                                                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#16a34a' }}>{formatCurrency(group.totalInflow)}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>A Pagar</span>
                                                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(group.totalOutflow)}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Tabela do Accordion */}
                                                    {isExpanded && (
                                                        <div style={{ overflowX: 'auto', width: '100%' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#475569', backgroundColor: '#ffffff' }}>
                                                                        <th style={{ padding: '0.75rem 1.5rem' }}>Data Vencimento</th>
                                                                        <th style={{ padding: '0.75rem 1.5rem' }}>Cliente/Fornecedor</th>
                                                                        <th style={{ padding: '0.75rem 1.5rem' }}>Descrição</th>
                                                                        <th style={{ padding: '0.75rem 1.5rem' }}>Categoria</th>
                                                                        <th style={{ padding: '0.75rem 1.5rem' }}>Status</th>
                                                                        <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>Valor</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {group.items.sort((a, b) => a.date.localeCompare(b.date)).map((item, idx) => (
                                                                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                                                                            <td style={{ padding: '0.75rem 1.5rem', fontWeight: 500 }}>
                                                                                {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', color: '#1e293b', fontWeight: 500 }}>{item.customer || '-'}</td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', color: '#475569' }}>{item.description}</td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', color: '#64748b' }}>{item.category}</td>
                                                                            <td style={{ padding: '0.75rem 1.5rem' }}>
                                                                                {item.isOverdue ? (
                                                                                    <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#fef2f2', color: '#dc2626' }}>
                                                                                        ATRASADO
                                                                                    </span>
                                                                                ) : (
                                                                                    <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                                                                                        NO PRAZO
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, color: item.isRevenue ? '#16a34a' : '#dc2626', textAlign: 'right' }}>
                                                                                {item.isRevenue ? '+' : '-'}{formatCurrency(item.amount)}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {pendingGroups.length === 0 && (
                                            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '3rem', border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8' }}>
                                                Não há pendências de conciliação encontradas para os filtros ativos.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ABA: CONTAS A RECEBER (CAR) */}
                    {activeTab === 'car' && data && (() => {
                        const today = new Date();
                        const curYear = today.getFullYear();
                        const curMonthIdx = today.getMonth();
                        const allDetails = data.monthlyData
                            .filter(m => selectedYear < curYear || (selectedYear === curYear && (m.month - 1) <= curMonthIdx))
                            .flatMap(m => m.details);
                        const carDetails = allDetails.filter(d => !d.isRealized && d.isRevenue);
                        
                        const filtered = carDetails.filter(d => {
                            const matchSearch = 
                                (d.description || '').toLowerCase().includes(carSearch.toLowerCase()) ||
                                (d.customer || '').toLowerCase().includes(carSearch.toLowerCase()) ||
                                (d.category || '').toLowerCase().includes(carSearch.toLowerCase());
                            
                            if (carStatusFilter === 'overdue') {
                                return matchSearch && d.isOverdue;
                            } else if (carStatusFilter === 'ontime') {
                                return matchSearch && !d.isOverdue;
                            }
                            return matchSearch;
                        });

                        const totalItems = filtered.length;

                        // Agrupar por empresa
                        const grouped = filtered.reduce((acc, item) => {
                            const tName = item.tenantName || 'Empresa Desconhecida';
                            if (!acc[tName]) {
                                acc[tName] = {
                                    name: tName,
                                    items: [],
                                    total: 0,
                                    overdue: 0,
                                    ontime: 0
                                };
                            }
                            acc[tName].items.push(item);
                            acc[tName].total += item.amount;
                            if (item.isOverdue) {
                                acc[tName].overdue += item.amount;
                            } else {
                                acc[tName].ontime += item.amount;
                            }
                            return acc;
                        }, {} as Record<string, { name: string; items: any[]; total: number; overdue: number; ontime: number }>);

                        const tenantGroups = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '300px' }}>
                                        <input
                                            type="text"
                                            placeholder="Buscar por descrição, cliente ou categoria..."
                                            value={carSearch}
                                            onChange={(e) => { setCarSearch(e.target.value); }}
                                            style={{ flex: 1, padding: '0.625rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.875rem' }}
                                        />
                                        <select
                                            value={carStatusFilter}
                                            onChange={(e) => { setCarStatusFilter(e.target.value as any); }}
                                            style={{ padding: '0.625rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}
                                        >
                                            <option value="all">Todos os Status</option>
                                            <option value="overdue">Atrasados</option>
                                            <option value="ontime">No Prazo</option>
                                        </select>
                                    </div>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
                                        Total Geral: <span style={{ color: '#2563eb' }}>{totalItems}</span> títulos (R$ {formatCurrency(filtered.reduce((sum, item) => sum + item.amount, 0))})
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {tenantGroups.map((group) => {
                                        const isExpanded = !!expandedTenants[group.name];
                                        return (
                                            <div key={group.name} style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                                                {/* Header do Bloco (Clicável) */}
                                                <div 
                                                    onClick={() => toggleTenant(group.name)}
                                                    style={{ 
                                                        padding: '1.25rem 1.5rem', 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between', 
                                                        alignItems: 'center', 
                                                        cursor: 'pointer', 
                                                        backgroundColor: '#f8fafc',
                                                        borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                                                        userSelect: 'none',
                                                        transition: 'background-color 0.2s',
                                                        flexWrap: 'wrap',
                                                        gap: '1rem'
                                                    }}
                                                >
                                                    {/* Lado Esquerdo */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <svg 
                                                            width="16" 
                                                            height="16" 
                                                            viewBox="0 0 24 24" 
                                                            fill="none" 
                                                            stroke="#475569" 
                                                            strokeWidth="2.5" 
                                                            style={{ 
                                                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                                                                transition: 'transform 0.2s' 
                                                            }}
                                                        >
                                                            <polyline points="9 18 15 12 9 6" />
                                                        </svg>
                                                        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{group.name}</span>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#e2e8f0', color: '#475569', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                                                            {group.items.length} {group.items.length === 1 ? 'título' : 'títulos'}
                                                        </span>
                                                    </div>

                                                    {/* Lado Direito: KPIs */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Em Dia</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#16a34a' }}>{formatCurrency(group.ontime)}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Atrasado</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(group.overdue)}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderLeft: '1px solid #cbd5e1', paddingLeft: '1.5rem' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total</span>
                                                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(group.total)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Detalhamento (Tabela) */}
                                                {isExpanded && (
                                                    <div style={{ overflowX: 'auto', width: '100%' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#475569', backgroundColor: '#ffffff' }}>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Vencimento</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Status</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Descrição</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Cliente</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Categoria</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>Valor Original</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>Valor Líquido (c/ Inad.)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {group.items.map((item, idx) => {
                                                                    const originalVal = defaultRate === 100 ? item.amount : item.amount / (1 - defaultRate / 100);
                                                                    return (
                                                                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                                                                            <td style={{ padding: '0.75rem 1.5rem', fontWeight: 500 }}>
                                                                                {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                                {item.isOverdue && overdueAction === 'today' && (
                                                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>Projetado: {new Date(item.date).toLocaleDateString('pt-BR')}</div>
                                                                                )}
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1.5rem' }}>
                                                                                <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: item.isOverdue ? '#fef2f2' : '#f0fdf4', color: item.isOverdue ? '#dc2626' : '#16a34a' }}>
                                                                                    {item.isOverdue ? 'ATRASADO' : 'NO PRAZO'}
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', color: '#1e293b', fontWeight: 500 }}>{item.description || 'Recebimento previsto'}</td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', color: '#64748b' }}>{item.customer || '-'}</td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', color: '#64748b' }}>{item.category}</td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', fontWeight: 500, color: '#475569', textAlign: 'right' }}>
                                                                                {formatCurrency(originalVal)}
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, color: '#16a34a', textAlign: 'right' }}>
                                                                                {formatCurrency(item.amount)}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {tenantGroups.length === 0 && (
                                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '4rem', border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8' }}>
                                            Nenhum recebimento em aberto encontrado para os filtros ativos.
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ABA: CONTAS A PAGAR (CAP) */}
                    {activeTab === 'cap' && data && (() => {
                        const today = new Date();
                        const curYear = today.getFullYear();
                        const curMonthIdx = today.getMonth();
                        const allDetails = data.monthlyData
                            .filter(m => selectedYear < curYear || (selectedYear === curYear && (m.month - 1) <= curMonthIdx))
                            .flatMap(m => m.details);
                        const capDetails = allDetails.filter(d => !d.isRealized && !d.isRevenue);
                        
                        const filtered = capDetails.filter(d => {
                            const matchSearch = 
                                (d.description || '').toLowerCase().includes(capSearch.toLowerCase()) ||
                                (d.customer || '').toLowerCase().includes(capSearch.toLowerCase()) ||
                                (d.category || '').toLowerCase().includes(capSearch.toLowerCase());
                            
                            if (capStatusFilter === 'overdue') {
                                return matchSearch && d.isOverdue;
                            } else if (capStatusFilter === 'ontime') {
                                return matchSearch && !d.isOverdue;
                            }
                            return matchSearch;
                        });

                        const totalItems = filtered.length;

                        // Agrupar por empresa
                        const grouped = filtered.reduce((acc, item) => {
                            const tName = item.tenantName || 'Empresa Desconhecida';
                            if (!acc[tName]) {
                                acc[tName] = {
                                    name: tName,
                                    items: [],
                                    total: 0,
                                    overdue: 0,
                                    ontime: 0
                                };
                            }
                            acc[tName].items.push(item);
                            acc[tName].total += item.amount;
                            if (item.isOverdue) {
                                acc[tName].overdue += item.amount;
                            } else {
                                acc[tName].ontime += item.amount;
                            }
                            return acc;
                        }, {} as Record<string, { name: string; items: any[]; total: number; overdue: number; ontime: number }>);

                        const tenantGroups = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '300px' }}>
                                        <input
                                            type="text"
                                            placeholder="Buscar por descrição, fornecedor ou categoria..."
                                            value={capSearch}
                                            onChange={(e) => { setCapSearch(e.target.value); }}
                                            style={{ flex: 1, padding: '0.625rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.875rem' }}
                                        />
                                        <select
                                            value={capStatusFilter}
                                            onChange={(e) => { setCapStatusFilter(e.target.value as any); }}
                                            style={{ padding: '0.625rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.875rem', color: '#1e293b', fontWeight: 500 }}
                                        >
                                            <option value="all">Todos os Status</option>
                                            <option value="overdue">Atrasados</option>
                                            <option value="ontime">No Prazo</option>
                                        </select>
                                    </div>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
                                        Total Geral: <span style={{ color: '#dc2626' }}>{totalItems}</span> títulos (R$ {formatCurrency(filtered.reduce((sum, item) => sum + item.amount, 0))})
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {tenantGroups.map((group) => {
                                        const isExpanded = !!expandedTenants[group.name];
                                        return (
                                            <div key={group.name} style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                                                {/* Header do Bloco (Clicável) */}
                                                <div 
                                                    onClick={() => toggleTenant(group.name)}
                                                    style={{ 
                                                        padding: '1.25rem 1.5rem', 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between', 
                                                        alignItems: 'center', 
                                                        cursor: 'pointer', 
                                                        backgroundColor: '#f8fafc',
                                                        borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                                                        userSelect: 'none',
                                                        transition: 'background-color 0.2s',
                                                        flexWrap: 'wrap',
                                                        gap: '1rem'
                                                    }}
                                                >
                                                    {/* Lado Esquerdo */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <svg 
                                                            width="16" 
                                                            height="16" 
                                                            viewBox="0 0 24 24" 
                                                            fill="none" 
                                                            stroke="#475569" 
                                                            strokeWidth="2.5" 
                                                            style={{ 
                                                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                                                                transition: 'transform 0.2s' 
                                                            }}
                                                        >
                                                            <polyline points="9 18 15 12 9 6" />
                                                        </svg>
                                                        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{group.name}</span>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#e2e8f0', color: '#475569', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                                                            {group.items.length} {group.items.length === 1 ? 'título' : 'títulos'}
                                                        </span>
                                                    </div>

                                                    {/* Lado Direito: KPIs */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Em Dia</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#16a34a' }}>{formatCurrency(group.ontime)}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Atrasado</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(group.overdue)}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderLeft: '1px solid #cbd5e1', paddingLeft: '1.5rem' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total</span>
                                                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#dc2626' }}>{formatCurrency(group.total)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Detalhamento (Tabela) */}
                                                {isExpanded && (
                                                    <div style={{ overflowX: 'auto', width: '100%' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#475569', backgroundColor: '#ffffff' }}>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Vencimento</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Status</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Descrição</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Fornecedor</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Categoria</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>Valor do Título</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {group.items.map((item, idx) => (
                                                                    <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                                                                        <td style={{ padding: '0.75rem 1.5rem', fontWeight: 500 }}>
                                                                            {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                            {item.isOverdue && overdueAction === 'today' && (
                                                                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>Projetado: {new Date(item.date).toLocaleDateString('pt-BR')}</div>
                                                                            )}
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 1.5rem' }}>
                                                                            <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: item.isOverdue ? '#fef2f2' : '#f0fdf4', color: item.isOverdue ? '#dc2626' : '#16a34a' }}>
                                                                                {item.isOverdue ? 'ATRASADO' : 'NO PRAZO'}
                                                                            </span>
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', color: '#1e293b', fontWeight: 500 }}>{item.description || 'Pagamento previsto'}</td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', color: '#64748b' }}>{item.customer || '-'}</td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', color: '#64748b' }}>{item.category}</td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, color: '#dc2626', textAlign: 'right' }}>
                                                                            {formatCurrency(item.amount)}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {tenantGroups.length === 0 && (
                                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '4rem', border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8' }}>
                                            Nenhum pagamento em aberto encontrado para os filtros ativos.
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </>
            )}

            {/* Modal de Detalhes dos Cards */}
            {modalOpen && data && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1.5rem'
                }}>
                    <div style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '800px',
                        maxHeight: '85vh',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{modalTitle}</h3>
                            <button
                                onClick={() => { setModalOpen(false); setModalType(null); }}
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    color: '#64748b',
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                            {modalType === 'balance' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#475569' }}>
                                                <th style={{ padding: '0.5rem 0.75rem' }}>Conta / Banco</th>
                                                <th style={{ padding: '0.5rem 0.75rem' }}>Tipo</th>
                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Saldo Real</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.bankAccounts.map((acc) => (
                                                <tr key={acc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '0.75rem', fontWeight: 600, color: '#1e293b' }}>{acc.name}</td>
                                                    <td style={{ padding: '0.75rem', color: '#64748b' }}>
                                                        {acc.tenant?.name || 'Conta Corrente / Carteira'}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: acc.balance >= 0 ? '#0f172a' : '#ef4444' }}>
                                                        {formatCurrency(acc.balance)}
                                                    </td>
                                                </tr>
                                            ))}
                                            {data.bankAccounts.length === 0 && (
                                                <tr>
                                                    <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma conta ativa sincronizada.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {modalType === 'inflows' && (() => {
                                const today = new Date();
                                const curYear = today.getFullYear();
                                const curMonthIdx = today.getMonth();
                                const list = data.monthlyData
                                    .filter(m => selectedYear < curYear || (selectedYear === curYear && (m.month - 1) <= curMonthIdx))
                                    .flatMap(m => m.details)
                                    .filter(d => !d.isRealized && d.isRevenue);
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem' }}>
                                            Exibindo todos os <strong>{list.length}</strong> recebimentos previstos em aberto para o ano selecionado:
                                        </div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#475569' }}>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Vencimento</th>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Descrição</th>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Cliente</th>
                                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Valor c/ Inad.</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {list.map((item, idx) => (
                                                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>
                                                                {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                {item.isOverdue && <span style={{ display: 'inline-block', marginLeft: '0.4rem', padding: '0.1rem 0.3rem', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>ATRASADO</span>}
                                                            </td>
                                                            <td style={{ padding: '0.6rem 0.75rem', color: '#1e293b' }}>{item.description}</td>
                                                            <td style={{ padding: '0.6rem 0.75rem', color: '#64748b' }}>{item.customer || '-'}</td>
                                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>
                                                                {formatCurrency(item.amount)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {list.length === 0 && (
                                                        <tr>
                                                            <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Não há recebimentos previstos em aberto.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })()}

                            {modalType === 'outflows' && (() => {
                                const today = new Date();
                                const curYear = today.getFullYear();
                                const curMonthIdx = today.getMonth();
                                const list = data.monthlyData
                                    .filter(m => selectedYear < curYear || (selectedYear === curYear && (m.month - 1) <= curMonthIdx))
                                    .flatMap(m => m.details)
                                    .filter(d => !d.isRealized && !d.isRevenue);
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.5rem' }}>
                                            Exibindo todos os <strong>{list.length}</strong> pagamentos previstos em aberto para o ano selecionado:
                                        </div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#475569' }}>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Vencimento</th>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Descrição</th>
                                                        <th style={{ padding: '0.75rem 0.75rem' }}>Fornecedor</th>
                                                        <th style={{ padding: '0.75rem 0.75rem', textAlign: 'right' }}>Valor</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {list.map((item, idx) => (
                                                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>
                                                                {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                {item.isOverdue && <span style={{ display: 'inline-block', marginLeft: '0.4rem', padding: '0.1rem 0.3rem', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>ATRASADO</span>}
                                                            </td>
                                                            <td style={{ padding: '0.6rem 0.75rem', color: '#1e293b' }}>{item.description}</td>
                                                            <td style={{ padding: '0.6rem 0.75rem', color: '#64748b' }}>{item.customer || '-'}</td>
                                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                                                                {formatCurrency(item.amount)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {list.length === 0 && (
                                                        <tr>
                                                            <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Não há pagamentos previstos em aberto.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })()}

                            {modalType === 'projected' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
                                        O <strong>Saldo Final Projetado</strong> é a estimativa da disponibilidade líquida de caixa ao final do ano, considerando os saldos bancários e a conciliação de todos os títulos em aberto (atrasados e futuros).
                                    </p>
                                    <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '1.25rem', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                                            <span>(+) Saldo Bancário Atual</span>
                                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatCurrency(cardTotals.current)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                                            <span>(+) Recebimentos em Aberto (c/ inad.)</span>
                                            <span>{formatCurrency(cardTotals.inflows)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.75rem' }}>
                                            <span>(-) Pagamentos em Aberto</span>
                                            <span>{formatCurrency(cardTotals.outflows)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.05rem', color: '#0369a1' }}>
                                            <span>(=) Saldo Final Projetado</span>
                                            <span>{formatCurrency(cardTotals.projected)}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem', color: '#64748b', backgroundColor: '#eff6ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                                        <span style={{ fontWeight: 700, color: '#1e40af' }}>Fórmulas e Controles Ativos:</span>
                                        <span>• Taxa de inadimplência projetada: <strong>{defaultRate}%</strong> aplicada a todas as parcelas CAR previstas.</span>
                                        <span>• Tratamento de atrasados: <strong>{overdueAction === 'today' ? 'Postergar vencimento para hoje (padrão)' : overdueAction === 'ignore' ? 'Desconsiderar atrasados' : 'Manter vencimento original'}</strong>.</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f8fafc' }}>
                            <button
                                onClick={() => { setModalOpen(false); setModalType(null); }}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    backgroundColor: '#ffffff',
                                    color: '#334155',
                                    fontWeight: 600,
                                    fontSize: '0.875rem',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
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
