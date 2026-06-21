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

        // Limitar visualização diária para 45 dias para legibilidade
        const points = chartView === 'day' 
            ? groupedProjection.slice(0, 45) 
            : groupedProjection;

        const width = 1000;
        const height = 320;
        const paddingLeft = 70;
        const paddingRight = 70;
        const paddingTop = 40;
        const paddingBottom = 40;
        const chartWidth = width - paddingLeft - paddingRight;
        const chartHeight = height - paddingTop - paddingBottom;
        const baselineY = paddingTop + chartHeight / 2; // Linha de zero para as barras (Y = 160)

        // Escala das Barras (Entradas e Saídas)
        const maxBarVal = Math.max(...points.map(p => Math.max(p.inflows, p.outflows)), 1000) * 1.1;
        const barScale = (chartHeight / 2) / maxBarVal; // Altura máxima de cada barra é metade do gráfico

        // Escala da Linha de Saldo (Simétrica em torno de zero para alinhar a linha zero com as barras)
        const balances = points.map(p => p.balance);
        const absoluteMaxBal = Math.max(...balances.map(b => Math.abs(b)), 1000) * 1.05;
        const maxBal = absoluteMaxBal;
        const minBal = -absoluteMaxBal;
        const balRange = maxBal - minBal;
        const balScale = chartHeight / (balRange || 1);

        const getX = (index: number) => {
            if (points.length <= 1) return paddingLeft + chartWidth / 2;
            return paddingLeft + (index / (points.length - 1)) * chartWidth;
        };

        const getBalY = (val: number) => {
            return paddingTop + chartHeight - ((val - minBal) * balScale);
        };

        // Gerar string do path da linha de saldo
        let pathD = '';
        points.forEach((p, idx) => {
            const x = getX(idx);
            const y = getBalY(p.balance);
            if (idx === 0) pathD += `M ${x} ${y}`;
            else pathD += ` L ${x} ${y}`;
        });

        // Configuração de hover do ponto
        const barWidth = Math.max(2, (chartWidth / points.length) * 0.4);

        return (
            <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box', backgroundColor: '#ffffff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                {/* Controles de Visualização */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Fluxo de Caixa Projetado</h3>
                        <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                            Visualização gráfica das entradas, saídas e evolução do saldo acumulado.
                        </p>
                    </div>
                    
                    {/* Botões de Agrupamento */}
                    <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '0.25rem', borderRadius: '8px', gap: '0.25rem' }}>
                        {(['day', 'week', 'quinzena', 'month'] as const).map((view) => {
                            const labelMap = { day: 'Dia', week: 'Semana', quinzena: 'Quinzena', month: 'Mês' };
                            const isActive = chartView === view;
                            return (
                                <button
                                    key={view}
                                    onClick={() => setChartView(view)}
                                    style={{
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: isActive ? '#ffffff' : 'transparent',
                                        color: isActive ? '#0f172a' : '#64748b',
                                        fontWeight: 600,
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {labelMap[view]}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Legendas de Cores */}
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', marginBottom: '1.5rem', flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#475569', fontWeight: 500 }}>
                        <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#10b981', borderRadius: '3px' }}></span> Entradas (Recebimentos)
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#475569', fontWeight: 500 }}>
                        <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#ef4444', borderRadius: '3px' }}></span> Saídas (Custos / Despesas)
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#475569', fontWeight: 500 }}>
                        <span style={{ display: 'inline-block', width: '16px', height: '3px', backgroundColor: '#2563eb', borderRadius: '2px' }}></span> Saldo Acumulado
                    </span>
                </div>

                <div style={{ overflowX: 'auto', width: '100%' }}>
                    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: 'visible', minWidth: '800px' }}>
                        {/* Linhas de Grade de Fundo */}
                        {[0.1, 0.3, 0.5, 0.7, 0.9].map((ratio, idx) => {
                            const y = paddingTop + ratio * chartHeight;
                            return (
                                <line key={idx} x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                            );
                        })}

                        {/* Linha Central de Baseline zero (para barras) */}
                        <line x1={paddingLeft} y1={baselineY} x2={width - paddingRight} y2={baselineY} stroke="#cbd5e1" strokeWidth="1.5" />

                        {/* Y-Axis Esquerda (Entradas / Saídas) */}
                        <text x={paddingLeft - 10} y={paddingTop + 5} textAnchor="end" fontSize="9" fill="#10b981" fontWeight="700">+{new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(maxBarVal)}</text>
                        <text x={paddingLeft - 10} y={baselineY + 3} textAnchor="end" fontSize="9" fill="#64748b" fontWeight="600">0</text>
                        <text x={paddingLeft - 10} y={paddingTop + chartHeight} textAnchor="end" fontSize="9" fill="#ef4444" fontWeight="700">-{new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(maxBarVal)}</text>

                        {/* Y-Axis Direita (Saldo Acumulado) */}
                        <text x={width - paddingRight + 10} y={paddingTop + 5} textAnchor="start" fontSize="9" fill="#2563eb" fontWeight="700">+{new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(maxBal)}</text>
                        <text x={width - paddingRight + 10} y={baselineY + 3} textAnchor="start" fontSize="9" fill="#64748b" fontWeight="600">0</text>
                        <text x={width - paddingRight + 10} y={paddingTop + chartHeight} textAnchor="start" fontSize="9" fill="#2563eb" fontWeight="700">-{new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(maxBal)}</text>

                        {/* 1. Desenhar Barras de Entradas e Saídas */}
                        {points.map((p, idx) => {
                            const x = getX(idx);
                            
                            // Inflows Bar (Green, goes UP from baselineY)
                            const inflowHeight = p.inflows * barScale;
                            const inflowY = baselineY - inflowHeight;

                            // Outflows Bar (Red, goes DOWN from baselineY)
                            const outflowHeight = p.outflows * barScale;

                            return (
                                <g key={idx}>
                                    {/* Barra de Entradas */}
                                    {p.inflows > 0 && (
                                        <rect
                                            x={x - barWidth / 2}
                                            y={inflowY}
                                            width={barWidth}
                                            height={inflowHeight}
                                            fill="#10b981"
                                            opacity="0.85"
                                            rx="1"
                                        />
                                    )}
                                    {/* Barra de Saídas */}
                                    {p.outflows > 0 && (
                                        <rect
                                            x={x - barWidth / 2}
                                            y={baselineY}
                                            width={barWidth}
                                            height={outflowHeight}
                                            fill="#ef4444"
                                            opacity="0.85"
                                            rx="1"
                                        />
                                    )}
                                </g>
                            );
                        })}

                        {/* 2. Desenhar Linha de Saldo Acumulado */}
                        <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                        {/* 3. Desenhar Pontos e Área de Interação da Linha de Saldo */}
                        {points.map((p, idx) => {
                            const x = getX(idx);
                            const y = getBalY(p.balance);

                            return (
                                <g key={`dot-${idx}`}>
                                    {/* Círculo da linha de saldo */}
                                    <circle
                                        cx={x}
                                        cy={y}
                                        r={hoveredPoint && hoveredPoint.idx === idx ? 6 : 2.5}
                                        fill={hoveredPoint && hoveredPoint.idx === idx ? '#1d4ed8' : '#2563eb'}
                                        stroke="#ffffff"
                                        strokeWidth={2}
                                        style={{ cursor: 'pointer', transition: 'r 0.1s, fill 0.1s' }}
                                        onMouseEnter={() => setHoveredPoint({ idx, ...p })}
                                        onMouseLeave={() => setHoveredPoint(null)}
                                    />

                                    {/* Rótulos do Eixo X (Datas) - Exibir a cada N pontos dependendo do tamanho */}
                                    {((points.length < 15) || (points.length < 35 && idx % 3 === 0) || (idx % 6 === 0)) && (
                                        <text
                                            x={x}
                                            y={height - paddingBottom + 18}
                                            textAnchor="middle"
                                            fontSize="9"
                                            fill="#64748b"
                                            fontWeight="600"
                                        >
                                            {p.formattedDate}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>

                {/* Tooltip interativo */}
                {hoveredPoint && (
                    <div style={{
                        position: 'absolute',
                        top: '80px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: '#1e293b',
                        color: '#ffffff',
                        padding: '0.85rem 1.2rem',
                        borderRadius: '10px',
                        fontSize: '0.8rem',
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                        border: '1px solid #334155',
                        zIndex: 10,
                        pointerEvents: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem'
                    }}>
                        <div style={{ fontWeight: 700, borderBottom: '1px solid #334155', paddingBottom: '0.35rem', color: '#93c5fd', fontSize: '0.85rem' }}>
                            Período: {chartView === 'day' ? new Date(hoveredPoint.date).toLocaleDateString('pt-BR', { dateStyle: 'long' }) : `A partir de ${new Date(hoveredPoint.date).toLocaleDateString('pt-BR')}`}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem' }}>
                            <span>Entradas no Período:</span>
                            <span style={{ fontWeight: 700, color: '#4ade80' }}>
                                +{formatCurrency(hoveredPoint.inflows)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem' }}>
                            <span>Saídas no Período:</span>
                            <span style={{ fontWeight: 700, color: '#f87171' }}>
                                -{formatCurrency(hoveredPoint.outflows)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', borderTop: '1px solid #334155', paddingTop: '0.35rem', marginTop: '0.15rem' }}>
                            <span>Saldo Acumulado:</span>
                            <span style={{ fontWeight: 800, color: '#60a5fa', fontSize: '0.85rem' }}>
                                {formatCurrency(hoveredPoint.balance)}
                            </span>
                        </div>
                    </div>
                )}
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
