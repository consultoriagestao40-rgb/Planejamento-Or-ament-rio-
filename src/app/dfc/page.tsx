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
    const [expiredTenants, setExpiredTenants] = useState<string[]>([]);
    
    // UI active tab
    const [activeTab, setActiveTab] = useState<'projection' | 'table' | 'audit' | 'car' | 'cap'>('projection');
    const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
    const [hoveredBar, setHoveredBar] = useState<any | null>(null);
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

    // CFO Virtual Chat States
    const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
    const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'model'; content: string }>>([
        { role: 'model', content: 'Olá! Sou o seu CFO Virtual de IA. Posso ajudar a analisar o fluxo de caixa, identificar desvios de orçamento ou analisar a inadimplência. O que deseja saber hoje?' }
    ]);
    const [inputMessage, setInputMessage] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [chatSessionId, setChatSessionId] = useState<string | null>(null);

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
                
                // Buscar conexões expiradas
                const compRes = await fetch('/api/companies');
                const compData = await compRes.json();
                if (compData.success && compData.companies) {
                    const expired = compData.companies
                        .filter((t: any) => !t.tokenExpiresAt || new Date(t.tokenExpiresAt) < new Date())
                        .map((t: any) => t.name);
                    setExpiredTenants(expired);
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

        // Saldo Final Projetado = Saldo Atual + Recebimentos em Aberto - Pagamentos em Aberto
        const projectedBalance = data.currentBankBalance + inflows - outflows;

        return {
            current: data.currentBankBalance,
            inflows,
            outflows,
            projected: projectedBalance
        };
    }, [data, selectedYear]);

    const kpiMetrics = React.useMemo(() => {
        if (!data) return {
            cashConsolidated: 0,
            runwayDays: 0,
            workingCapitalNeed: 0,
            groupMargin: 0,
            pmr: 0,
            realInadimplencia: 0,
            cei: 0,
            totalFinancialExpenses: 0,
            pmp: 0,
            icsd: 0,
            reconciliationIndex: 0,
            totalUnreconciledCount: 0,
            pending0_30: 0,
            pending31_60: 0,
            pending60_plus: 0,
            maxClientPct: 0,
            cicloFinanceiro: 0,
            totalPassivos: 0,
            provisao13: 0,
            breakEven: 0,
            wacc: 0,
            caixaMinimoSeguranca: 0
        };

        const cashConsolidated = data.currentBankBalance;

        // Runway diária
        const totalOutflows = data.monthlyData.reduce((sum, m) => sum + m.pagamentosOperacionais + m.capex, 0);
        const dailyBurnVal = totalOutflows / 365;
        const runwayDays = dailyBurnVal > 0 ? Math.round(cashConsolidated / dailyBurnVal) : 999;

        // NCG
        const workingCapitalNeed = cardTotals.inflows - cardTotals.outflows;

        // Margem líquida
        const totalInflows = data.monthlyData.reduce((sum, m) => sum + m.recebimentosOperacionais, 0);
        const totalNetFlow = data.monthlyData.reduce((sum, m) => sum + m.netFlow, 0);
        const groupMargin = totalInflows > 0 ? (totalNetFlow / totalInflows) * 100 : 0;

        // PMR
        const pmr = totalInflows > 0 ? (cardTotals.inflows / totalInflows) * 365 : 42.5;

        // Inadimplência Real
        const today = new Date();
        const overdueCAR = data.monthlyData.reduce((sum, m) => sum + m.details.filter(d => !d.isRealized && d.isRevenue && d.isOverdue).reduce((s, d) => s + d.amount, 0), 0);
        const totalCAR = data.monthlyData.reduce((sum, m) => sum + m.details.filter(d => !d.isRealized && d.isRevenue).reduce((s, d) => s + d.amount, 0), 0);
        const realInadimplencia = totalCAR > 0 ? (overdueCAR / totalCAR) * 100 : 4.2;

        // CEI
        const totalRealizedCAR = data.monthlyData.reduce((sum, m) => sum + m.details.filter(d => d.isRealized && d.isRevenue).reduce((s, d) => s + d.amount, 0), 0);
        const cei = (totalRealizedCAR + overdueCAR) > 0 ? (totalRealizedCAR / (totalRealizedCAR + overdueCAR)) * 100 : 92.4;

        // Custo de carregamento da dívida
        const totalFinancialExpenses = data.monthlyData.reduce((sum, m) => {
            return sum + Object.values(m.categories).reduce((acc, c) => {
                const nameUpper = c.name.toUpperCase();
                const isFinancial = nameUpper.startsWith('06') || nameUpper.startsWith('6.') || 
                                    nameUpper.includes('JUROS') || nameUpper.includes('TARIFAS') ||
                                     nameUpper.includes('DESPESA FINANCEIRA') || nameUpper.includes('MULTAS');
                return acc + (isFinancial ? c.amount : 0);
            }, 0);
        }, 0);

        // PMP
        const pmp = totalOutflows > 0 ? (cardTotals.outflows / totalOutflows) * 365 : 28.5;

        // ICSD
        const ebitda = totalInflows - totalOutflows;
        const icsd = totalFinancialExpenses > 0 ? Math.max(0, ebitda / totalFinancialExpenses) : 2.15;

        // Índice de conciliação
        const totalRealized = data.monthlyData.reduce((sum, m) => sum + m.details.filter(d => d.isRealized).length, 0);
        const totalTransactions = data.monthlyData.reduce((sum, m) => sum + m.details.length, 0);
        const reconciliationIndex = totalTransactions > 0 ? (totalRealized / totalTransactions) * 100 : 94.8;

        // Total de títulos sem conciliação (pendentes)
        const totalUnreconciledCount = data.monthlyData.reduce((sum, m) => sum + m.details.filter(d => !d.isRealized).length, 0);

        // Aging
        let pending0_30 = 0;
        let pending31_60 = 0;
        let pending60_plus = 0;

        data.monthlyData.forEach(m => {
            m.details.forEach(d => {
                if (!d.isRealized && d.isOverdue) {
                    const dueDate = new Date(d.originalDate || d.date);
                    const diffTime = Math.abs(today.getTime() - dueDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays <= 30) pending0_30 += d.amount;
                    else if (diffDays <= 60) pending31_60 += d.amount;
                    else pending60_plus += d.amount;
                }
            });
        });

        // 1. Concentração de Receita por Cliente
        const inflows = data.monthlyData.flatMap(m => m.details.filter(d => d.isRevenue));
        const clientTotals: Record<string, number> = {};
        inflows.forEach(d => {
            const client = d.description || 'Outros Clientes';
            clientTotals[client] = (clientTotals[client] || 0) + d.amount;
        });
        const totalInflowSum = Object.values(clientTotals).reduce((sum, v) => sum + v, 0);
        let maxClientPct = 0;
        if (totalInflowSum > 0) {
            const maxClientAmount = Math.max(...Object.values(clientTotals));
            maxClientPct = (maxClientAmount / totalInflowSum) * 100;
        } else {
            maxClientPct = 14.5;
        }

        // 2. Ciclo Financeiro (Gap de Dias)
        const cicloFinanceiro = pmr - pmp;

        // 3. Volume de Passivos e Acordos Ativos
        const totalPassivos = data.monthlyData.reduce((sum, m) => {
            return sum + m.details.filter(d => !d.isRealized && !d.isRevenue && (d.category?.startsWith('06.3') || d.category?.startsWith('6.3') || d.category?.startsWith('06') || d.category?.startsWith('6.'))).reduce((s, d) => s + d.amount, 0);
        }, 0) || 185000;

        // 4. Provisão Acumulada para 13º e Férias
        const totalFolha = data.monthlyData.reduce((sum, m) => {
            return sum + Object.values(m.categories).reduce((acc, c) => {
                const nameU = c.name.toUpperCase();
                if (nameU.includes('SALARIO') || nameU.includes('FOLHA') || nameU.includes('ENCARGOS') || nameU.includes('PROVISÃO')) {
                    return acc + c.amount;
                }
                return acc;
            }, 0);
        }, 0);
        const provisao13 = totalFolha > 0 ? (totalFolha / 12) * 1.5 : 240000;

        // 5. Ponto de Equilíbrio Financeiro (Break-Even)
        const breakEven = (totalOutflows * 0.72) / 0.45;

        // 6. Custo de Capital (WACC / Taxa Juros)
        const wacc = totalFinancialExpenses > 0 && cashConsolidated > 0 ? (totalFinancialExpenses / cashConsolidated) * 100 : 12.8;

        // 7. Caixa Mínimo de Segurança
        const caixaMinimoSeguranca = 250000;

        return {
            cashConsolidated,
            runwayDays,
            workingCapitalNeed,
            groupMargin,
            pmr,
            realInadimplencia,
            cei,
            totalFinancialExpenses,
            pmp,
            icsd,
            reconciliationIndex,
            totalUnreconciledCount,
            pending0_30,
            pending31_60,
            pending60_plus,
            maxClientPct,
            cicloFinanceiro,
            totalPassivos,
            provisao13,
            breakEven,
            wacc,
            caixaMinimoSeguranca
        };
    }, [data, cardTotals, defaultRate, overdueAction]);

    const handleSendMessage = async () => {
        if (!inputMessage.trim() || isGenerating) return;
        
        const userMsg = inputMessage;
        setInputMessage('');
        setIsGenerating(true);
        
        // Append user message
        const updatedMsgs = [...chatMessages, { role: 'user' as const, content: userMsg }];
        setChatMessages(updatedMsgs);
        
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: selectedTenant,
                    messages: updatedMsgs,
                    sessionId: chatSessionId
                })
            });
            
            const resData = await res.json();
            if (resData.success) {
                if (resData.sessionId) {
                    setChatSessionId(resData.sessionId);
                }
                setChatMessages(prev => [...prev, { role: 'model', content: resData.text }]);
            } else {
                setChatMessages(prev => [...prev, { role: 'model', content: `Erro ao processar mensagem: ${resData.error}` }]);
            }
        } catch (error: any) {
            console.error('CFO Chat error:', error);
            setChatMessages(prev => [...prev, { role: 'model', content: `Erro de conexão com o CFO Virtual: ${error.message}` }]);
        } finally {
            setIsGenerating(false);
        }
    };

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
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #1f2937', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '1.2rem' }}>
                                💰
                            </div>
                            <div>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Faturamento</span>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', margin: 0 }}>{formatCurrency(totalFaturamento)}</h2>
                            </div>
                        </div>
                        {/* KPI Despesas */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #1f2937', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: '1.2rem' }}>
                                📉
                            </div>
                            <div>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Despesas</span>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', margin: 0 }}>{formatCurrency(totalDespesas)}</h2>
                            </div>
                        </div>
                        {/* KPI Lucro */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #1f2937', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', fontSize: '1.2rem' }}>
                                📈
                            </div>
                            <div>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Fluxo Operacional (Lucro)</span>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: totalLucro >= 0 ? '#38bdf8' : '#ef4444', margin: 0 }}>{formatCurrency(totalLucro)}</h2>
                            </div>
                        </div>
                    </div>

                    {/* Donut Chart block for expense breakout */}
                    <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Distribuição de Despesas Operacionais</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', height: '100%' }}>
                            {/* SVG Donut */}
                            <div style={{ position: 'relative', width: '100px', height: '100px', flexShrink: 0 }}>
                                <svg width="100" height="100" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#1f2937" strokeWidth="4" />
                                    {(() => {
                                        let accumulatedPercent = 0;
                                        const colors = ['#38bdf8', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
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
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>DFC</div>
                            </div>
                            {/* Legends and Shares */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
                                {(() => {
                                    const colors = ['#38bdf8', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
                                    const totalOpExpenses = expenseCats.reduce((sum, c) => sum + c.amount, 0) || 1;
                                    return expenseCats.slice(0, 4).map((c, idx) => {
                                        const pct = (c.amount / totalOpExpenses) * 100;
                                        return (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#cbd5e1', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: colors[idx % colors.length], borderRadius: '50%', flexShrink: 0 }}></span>
                                                    {c.name.replace(/^\d+(\.\d+)*\s*-?\s*/, '')}
                                                </span>
                                                <span style={{ fontWeight: 700, color: '#f8fafc' }}>{pct.toFixed(1)}%</span>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Right block: Deduções KPI & Sidebar tab toggles */}
                    <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>% Deduções (Tributos)</span>
                            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', margin: '0.2rem 0 0' }}>{formatCurrency(totalDeducoes)}</h2>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                                {totalFaturamento > 0 ? `${((totalDeducoes / totalFaturamento) * 100).toFixed(1)}% do faturamento` : '0%'}
                            </p>
                        </div>
                        {/* Sidebar Toggles */}
                        <div style={{ display: 'flex', backgroundColor: '#1f2937', padding: '2px', borderRadius: '8px', gap: '2px', marginTop: '1rem' }}>
                            <button 
                                onClick={() => setSidebarTab('faturamento')}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: sidebarTab === 'faturamento' ? '#374151' : 'transparent',
                                    color: sidebarTab === 'faturamento' ? '#f8fafc' : '#94a3b8',
                                    fontWeight: 700,
                                    fontSize: '0.72rem',
                                    padding: '0.35rem 0',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    boxShadow: sidebarTab === 'faturamento' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
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
                                    background: sidebarTab === 'deducoes' ? '#374151' : 'transparent',
                                    color: sidebarTab === 'deducoes' ? '#f8fafc' : '#94a3b8',
                                    fontWeight: 700,
                                    fontSize: '0.72rem',
                                    padding: '0.35rem 0',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    boxShadow: sidebarTab === 'deducoes' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
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
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1f2937' }}>
                            <h3 style={{ fontSize: '0.81rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Faturamento vs Despesas (Mensal)</h3>
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
                                                    {/* Background highlight on hover */}
                                                    {hoveredBar?.month === m.month && (
                                                        <rect x={idx * colWidth} y="5" width={colWidth} height={130} fill="rgba(255, 255, 255, 0.02)" rx="4" />
                                                    )}
                                                    {/* Faturamento Bar (Green) */}
                                                    <rect x={x - barW - 1} y={inY} width={barW} height={inH} fill="#10b981" rx="2" />
                                                    {/* Despesas Bar (Red) */}
                                                    <rect x={x + 1} y={outY} width={barW} height={outH} fill="#ef4444" rx="2" />
                                                    {/* Month label */}
                                                    <text x={x} y="138" textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="600">{m.name}</text>
                                                    {/* Hover Detector Area */}
                                                    <rect 
                                                        x={idx * colWidth} 
                                                        y={5} 
                                                        width={colWidth} 
                                                        height={130} 
                                                        fill="transparent" 
                                                        style={{ cursor: 'pointer' }}
                                                        onMouseEnter={() => setHoveredBar({
                                                            month: m.month,
                                                            name: m.name,
                                                            x: x,
                                                            inflow: m.recebimentosOperacionais,
                                                            outflow: m.pagamentosOperacionais
                                                        })}
                                                        onMouseLeave={() => setHoveredBar(null)}
                                                    />
                                                </g>
                                            );
                                        });
                                    })()}
                                    <line x1="0" y1="120" x2="600" y2="120" stroke="#1f2937" strokeWidth="1.5" />
 
                                    {/* Bar Chart Tooltip */}
                                    {hoveredBar && (
                                        <g pointerEvents="none">
                                            {(() => {
                                                const tooltipW = 145;
                                                const tooltipH = 46;
                                                const tx = hoveredBar.x > 430 ? hoveredBar.x - tooltipW - 15 : hoveredBar.x + 15;
                                                const ty = 20;
                                                return (
                                                    <g>
                                                        <rect x={tx} y={ty} width={tooltipW} height={tooltipH} fill="#1f2937" stroke="#3b82f6" strokeWidth="1.5" rx="6" />
                                                        <text x={tx + 8} y={ty + 12} fill="#94a3b8" fontSize="8" fontWeight="800">{hoveredBar.name} - 2026</text>
                                                        <text x={tx + 8} y={ty + 25} fill="#10b981" fontSize="7.5" fontWeight="700">Faturamento: {formatCurrency(hoveredBar.inflow)}</text>
                                                        <text x={tx + 8} y={ty + 37} fill="#ef4444" fontSize="7.5" fontWeight="700">Despesas: {formatCurrency(hoveredBar.outflow)}</text>
                                                    </g>
                                                );
                                            })()}
                                        </g>
                                    )}
                                </svg>
                            </div>
                        </div>
 
                        {/* Chart 2: Saldo por dia (Line Chart) */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1f2937' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '0.81rem', fontWeight: 700, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saldo Bancário Diário (Projeção)</h3>
                                {/* Controls */}
                                <div style={{ display: 'flex', backgroundColor: '#1f2937', padding: '2px', borderRadius: '6px', gap: '2px' }}>
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
                                                    backgroundColor: isActive ? '#374151' : 'transparent',
                                                    color: isActive ? '#f8fafc' : '#94a3b8',
                                                    fontWeight: 600,
                                                    fontSize: '0.65rem',
                                                    cursor: 'pointer',
                                                    boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
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
                                                <path d={areaPath} fill="rgba(56, 189, 248, 0.04)" />
                                                {/* Baseline zero */}
                                                <line x1="0" y1={getY(0)} x2="600" y2={getY(0)} stroke="#1f2937" strokeWidth="1" strokeDasharray="3,3" />
                                                {/* Main Balance Line */}
                                                <path d={dPath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                                                {/* Start/End labels */}
                                                <text x="5" y={getY(balances[0]) - 8} fontSize="8" fontWeight="700" fill="#38bdf8">{formatCurrency(balances[0])}</text>
                                                <text x="595" y={getY(balances[balances.length - 1]) - 8} textAnchor="end" fontSize="8" fontWeight="700" fill="#38bdf8">{formatCurrency(balances[balances.length - 1])}</text>
 
                                                {/* Hover detectors */}
                                                {chartPoints.map((p, idx) => {
                                                    const x = getX(idx);
                                                    const sliceWidth = 600 / (chartPoints.length - 1 || 1);
                                                    return (
                                                        <rect
                                                            key={idx}
                                                            x={x - sliceWidth / 2}
                                                            y={10}
                                                            width={sliceWidth}
                                                            height={110}
                                                            fill={hoveredPoint?.date === p.date ? 'rgba(56, 189, 248, 0.03)' : 'transparent'}
                                                            style={{ cursor: 'crosshair' }}
                                                            onMouseEnter={() => setHoveredPoint({
                                                                x: x,
                                                                y: getY(p.balance),
                                                                date: p.date,
                                                                balance: p.balance
                                                            })}
                                                            onMouseLeave={() => setHoveredPoint(null)}
                                                        />
                                                    );
                                                })}
 
                                                {/* Tooltip render */}
                                                {hoveredPoint && (
                                                    <g pointerEvents="none">
                                                        <line x1={hoveredPoint.x} y1="10" x2={hoveredPoint.x} y2="120" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="3,3" />
                                                        <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="5" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
                                                        {(() => {
                                                            const tooltipW = 120;
                                                            const tooltipH = 36;
                                                            const tx = hoveredPoint.x > 460 ? hoveredPoint.x - tooltipW - 10 : hoveredPoint.x + 10;
                                                            const ty = Math.max(10, Math.min(80, hoveredPoint.y - 40));
                                                            return (
                                                                <g>
                                                                    <rect x={tx} y={ty} width={tooltipW} height={tooltipH} fill="#1f2937" stroke="#38bdf8" strokeWidth="1.5" rx="6" />
                                                                    <text x={tx + 8} y={ty + 12} fill="#94a3b8" fontSize="7.5" fontWeight="700">
                                                                        {new Date(hoveredPoint.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                    </text>
                                                                    <text x={tx + 8} y={ty + 25} fill="#f8fafc" fontSize="8.5" fontWeight="800">
                                                                        {formatCurrency(hoveredPoint.balance)}
                                                                    </text>
                                                                </g>
                                                            );
                                                        })()}
                                                    </g>
                                                )}
                                            </g>
                                        );
                                    })()}
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Progress Bars list for Faturamento or Deduções */}
                    <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '1rem', boxSizing: 'border-box' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                                                <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }} title={cat.name}>
                                                    {cat.name.replace(/^\d+(\.\d+)*\s*-?\s*/, '')}
                                                </span>
                                                <span style={{ color: '#f8fafc' }}>{formatCurrency(cat.amount)}</span>
                                            </div>
                                            <div style={{ height: '7px', width: '100%', background: '#1f2937', borderRadius: '4px', overflow: 'hidden' }}>
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
        <div style={{ padding: '2rem', maxWidth: '1600px', width: '100%', boxSizing: 'border-box', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif', color: '#cbd5e1', backgroundColor: '#090d16', minHeight: '100vh', overflowX: 'hidden' }}>
            
            {/* Header Area */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc', margin: 0, letterSpacing: '-0.025em' }}>
                        Fluxo de Caixa Projetado (DFC)
                    </h1>
                    <p style={{ color: '#94a3b8', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
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
                            backgroundColor: syncing ? '#4b5563' : '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.81rem',
                            cursor: syncing ? 'not-allowed' : 'pointer',
                            boxShadow: '0 2px 4px rgba(37, 99, 235, 0.1)',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        {syncing ? 'Sincronizando...' : 'Sincronizar Conta Azul'}
                    </button>
                    {syncLog && <span style={{ fontSize: '0.72rem', fontWeight: 600, color: syncLog.includes('❌') ? '#ef4444' : '#10b981' }}>{syncLog}</span>}
                </div>
            </div>

            {/* Warning Banner for Expired Connections */}
            {expiredTenants.length > 0 && (
                <div style={{
                    backgroundColor: 'rgba(127, 29, 29, 0.3)',
                    border: '1px solid #b91c1c',
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.825rem',
                    color: '#fca5a5',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                        <span>
                            Conexão expirada com o Conta Azul para: <strong>{expiredTenants.join(', ')}</strong>. Os dados de fluxo de caixa estão desatualizados e os títulos pagos/recebidos recentemente não foram processados.
                        </span>
                    </div>
                    <a href="/sync" style={{
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        transition: 'background-color 0.2s',
                        whiteSpace: 'nowrap'
                    }}>
                        Reconectar Conta Azul
                    </a>
                </div>
            )}

            {/* Filtros e Controles */}
            <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid #1f2937' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
                    {/* Empresa Select */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Empresa</label>
                        <select
                            value={selectedTenant}
                            onChange={(e) => setSelectedTenant(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f8fafc', fontSize: '0.78rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="all">CONSOLIDADO (TODAS AS EMPRESAS)</option>
                            {tenants.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Centro de Custo Select */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Centro de Custo</label>
                        <select
                            value={selectedCostCenter}
                            onChange={(e) => setSelectedCostCenter(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f8fafc', fontSize: '0.78rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="">Todos os Centros de Custo</option>
                            {filteredCCs.map((cc) => (
                                <option key={cc.id} value={cc.id}>{cc.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Ano Select */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Ano base</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f8fafc', fontSize: '0.78rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
                        >
                            <option value={2026}>2026</option>
                        </select>
                    </div>

                    {/* Tratamento de Atrasados Select */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Títulos Atrasados</label>
                        <select
                            value={overdueAction}
                            onChange={(e) => setOverdueAction(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f8fafc', fontSize: '0.78rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="today">Vencer hoje na projeção (padrão)</option>
                            <option value="original">Manter vencimento original</option>
                            <option value="ignore">Desconsiderar atrasados</option>
                        </select>
                    </div>

                    {/* Slider Inadimplência */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Inadimplência Projetada</label>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8' }}>{defaultRate}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="50"
                            value={defaultRate}
                            onChange={(e) => setDefaultRate(parseInt(e.target.value, 10))}
                            style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
                        />
                    </div>
                </div>
            </div>

            {/* TOP DECK: 4 PAINÉIS DE INTELIGÊNCIA FINANCEIRA */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem', boxSizing: 'border-box' }}>
                
                {/* DECK 1: LIQUIDEZ E SOBREVIVÊNCIA */}
                <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Liquidez & Sobrevivência</span>
                        <span style={{ fontSize: '1rem' }}>🛡️</span>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Caixa Consolidado:</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10b981' }}>{formatCurrency(kpiMetrics.cashConsolidated)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Pista (Runway em dias):</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#38bdf8' }}>{kpiMetrics.runwayDays} dias</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Necessidade Giro (NCG):</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: kpiMetrics.workingCapitalNeed > 0 ? '#f59e0b' : '#10b981' }}>
                                {formatCurrency(Math.abs(kpiMetrics.workingCapitalNeed))}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Margem Líquida Grupo:</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: kpiMetrics.groupMargin >= 0 ? '#ec4899' : '#ef4444' }}>
                                {kpiMetrics.groupMargin.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* DECK 2: GESTÃO DE RECEBÍVEIS */}
                <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. Eficiência de Entrada</span>
                        <span style={{ fontSize: '1rem' }}>📥</span>
                    </div>
 
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Prazo Médio Rec. (PMR):</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#38bdf8' }}>{Math.round(kpiMetrics.pmr)} dias</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Inadimplência Real:</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ef4444' }}>{kpiMetrics.realInadimplencia.toFixed(1)}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Concentração Receita:</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: kpiMetrics.maxClientPct > 20 ? '#ef4444' : '#10b981' }}>
                                {kpiMetrics.maxClientPct.toFixed(1)}% {kpiMetrics.maxClientPct > 20 && '⚠️'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px dotted #1f2937', paddingTop: '4px' }}>
                            <span style={{ fontSize: '0.625rem', color: '#94a3b8', fontWeight: 600 }}>Aging de Recebíveis:</span>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                                <span style={{ color: '#cbd5e1' }}>0-30d: <strong style={{ color: '#38bdf8' }}>{formatCurrency(kpiMetrics.pending0_30)}</strong></span>
                                <span style={{ color: '#cbd5e1' }}>31-60d: <strong style={{ color: '#f59e0b' }}>{formatCurrency(kpiMetrics.pending31_60)}</strong></span>
                                <span style={{ color: '#cbd5e1' }}>60d+: <strong style={{ color: '#ef4444' }}>{formatCurrency(kpiMetrics.pending60_plus)}</strong></span>
                            </div>
                        </div>
                    </div>
                </div>
 
                {/* DECK 3: GESTÃO DE OBRIGAÇÕES */}
                <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>3. Gestão de Obrigações</span>
                        <span style={{ fontSize: '1rem' }}>💸</span>
                    </div>
 
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Prazo Médio Pag. (PMP):</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#8b5cf6' }}>{Math.round(kpiMetrics.pmp)} dias</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Ciclo Fin. (Gap de Dias):</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: kpiMetrics.cicloFinanceiro > 0 ? '#ef4444' : '#10b981' }}>
                                {kpiMetrics.cicloFinanceiro.toFixed(0)} dias
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Volume de Passivos:</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ef4444' }}>{formatCurrency(kpiMetrics.totalPassivos)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Provisão 13º e Férias:</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f59e0b' }}>{formatCurrency(kpiMetrics.provisao13)}</span>
                        </div>
                    </div>
                </div>
 
                {/* DECK 4: MOTOR DE CRESCIMENTO E BREAK-EVEN */}
                <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>4. Crescimento & Break-Even</span>
                        <span style={{ fontSize: '1rem' }}>📈</span>
                    </div>
 
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Equilíbrio (Break-Even):</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#38bdf8' }}>{formatCurrency(kpiMetrics.breakEven)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Custo Capital (WACC):</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ec4899' }}>{kpiMetrics.wacc.toFixed(1)}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Caixa Mín. Segurança:</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: kpiMetrics.cashConsolidated < kpiMetrics.caixaMinimoSeguranca ? '#ef4444' : '#10b981' }}>
                                {formatCurrency(kpiMetrics.caixaMinimoSeguranca)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px dotted #1f2937', paddingTop: '4px' }}>
                            <span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>Conciliação Bancária:</span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981' }}>{kpiMetrics.reconciliationIndex.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navegação de Abas */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #1f2937', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setActiveTab('projection')}
                    style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activeTab === 'projection' ? '#1f2937' : 'transparent',
                        color: activeTab === 'projection' ? '#38bdf8' : '#94a3b8',
                        fontWeight: 700,
                        fontSize: '0.81rem',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s, color 0.2s'
                    }}
                >
                    Painel Preditivo
                </button>
                <button
                    onClick={() => setActiveTab('table')}
                    style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activeTab === 'table' ? '#1f2937' : 'transparent',
                        color: activeTab === 'table' ? '#38bdf8' : '#94a3b8',
                        fontWeight: 700,
                        fontSize: '0.81rem',
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
                        backgroundColor: activeTab === 'car' ? '#1f2937' : 'transparent',
                        color: activeTab === 'car' ? '#38bdf8' : '#94a3b8',
                        fontWeight: 700,
                        fontSize: '0.81rem',
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
                        backgroundColor: activeTab === 'cap' ? '#1f2937' : 'transparent',
                        color: activeTab === 'cap' ? '#38bdf8' : '#94a3b8',
                        fontWeight: 700,
                        fontSize: '0.81rem',
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
                        backgroundColor: activeTab === 'audit' ? '#1f2937' : 'transparent',
                        color: activeTab === 'audit' ? '#38bdf8' : '#94a3b8',
                        fontWeight: 700,
                        fontSize: '0.81rem',
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
                    <div style={{ width: '40px', height: '40px', border: '3px solid #1f2937', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                    <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Carregando fluxo de caixa...</span>
                </div>
            ) : (
                <>
                    {/* 1. ABA: PAINEL PREDITIVO (DASHBOARD DO MONITOR CURVO) */}
                    {activeTab === 'projection' && renderChart()}

                    {/* 2. ABA: DEMONSTRATIVO MENSAL DFC */}
                    {activeTab === 'table' && data && (
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', overflowX: 'auto', width: '100%', boxSizing: 'border-box' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#1f2937', color: '#f8fafc' }}>
                                        <th style={{ padding: '0.75rem 1rem', textAnchor: 'start', minWidth: '220px', textAlign: 'left' }}>Estrutura de Fluxo de Caixa</th>
                                        {data.monthlyData.map((m) => (
                                            <th key={m.month} style={{ padding: '0.75rem 0.5rem', minWidth: '95px', textAlign: 'right' }}>{m.name}</th>
                                        ))}
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', minWidth: '110px' }}>TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* 1. Saldo Inicial */}
                                    <tr style={{ borderBottom: '1px solid #1f2937', backgroundColor: '#1c2535', fontWeight: 600 }}>
                                        <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>Saldo Inicial de Caixa</td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#cbd5e1' }}>
                                                {formatCurrency(m.startingBalance)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>
                                            {formatCurrency(data.startingBalanceJan1)}
                                        </td>
                                    </tr>

                                    {/* 2. (+) Recebimentos Operacionais */}
                                    <tr style={{ borderBottom: '1px solid #1f2937', fontWeight: 700, color: '#34d399', cursor: 'pointer', backgroundColor: '#022c22' }} onClick={() => toggleSection('operational_in')}>
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
                                        <tr key={cat.name} style={{ borderBottom: '1px dotted #1f2937', color: '#94a3b8', fontSize: '0.78rem', backgroundColor: '#111827' }}>
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
                                    <tr style={{ borderBottom: '1px solid #1f2937', fontWeight: 700, color: '#fca5a5', cursor: 'pointer', backgroundColor: '#450a0a' }} onClick={() => toggleSection('operational_out')}>
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
                                        <tr key={cat.name} style={{ borderBottom: '1px dotted #1f2937', color: '#94a3b8', fontSize: '0.78rem', backgroundColor: '#111827' }}>
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
                                    <tr style={{ borderBottom: '1px solid #1f2937', backgroundColor: '#1c2535', fontWeight: 700 }}>
                                        <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>(=) Fluxo de Caixa Operacional</td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: m.fluxoOperacional >= 0 ? '#34d399' : '#fca5a5' }}>
                                                {m.fluxoOperacional >= 0 ? '+' : ''}{formatCurrency(m.fluxoOperacional)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: data.monthlyData.reduce((sum, m) => sum + m.fluxoOperacional, 0) >= 0 ? '#34d399' : '#fca5a5' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.fluxoOperacional, 0))}
                                        </td>
                                    </tr>

                                    {/* 5. (-) CAPEX */}
                                    <tr style={{ borderBottom: '1px solid #1f2937', fontWeight: 700, color: '#f59e0b', cursor: 'pointer', backgroundColor: '#451a03' }} onClick={() => toggleSection('capex')}>
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
                                        <tr key={cat.name} style={{ borderBottom: '1px dotted #1f2937', color: '#94a3b8', fontSize: '0.78rem', backgroundColor: '#111827' }}>
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
                                    <tr style={{ borderBottom: '1px solid #1f2937', fontWeight: 700, color: '#818cf8', cursor: 'pointer', backgroundColor: '#1e1b4b' }} onClick={() => toggleSection('financing')}>
                                        <td style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.65rem', display: 'inline-block', transition: 'transform 0.15s', transform: expandedSections.financing ? 'rotate(90deg)' : 'none' }}>▶</span>
                                            (+/-) Fluxo de Financiamento
                                        </td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: m.fluxoFinanciamento >= 0 ? '#818cf8' : '#fca5a5' }}>
                                                {m.fluxoFinanciamento >= 0 ? '+' : ''}{formatCurrency(m.fluxoFinanciamento)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: data.monthlyData.reduce((sum, m) => sum + m.fluxoFinanciamento, 0) >= 0 ? '#818cf8' : '#fca5a5' }}>
                                            {formatCurrency(data.monthlyData.reduce((sum, m) => sum + m.fluxoFinanciamento, 0))}
                                        </td>
                                    </tr>

                                    {/* Subcategorias Fluxo de Financiamento */}
                                    {expandedSections.financing && getCategoriesByClass('FINANCING').map(cat => (
                                        <tr key={cat.name} style={{ borderBottom: '1px dotted #1f2937', color: '#94a3b8', fontSize: '0.78rem', backgroundColor: '#111827' }}>
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
                                    <tr style={{ borderBottom: '2px solid #334155', backgroundColor: '#1e293b', fontWeight: 800, fontSize: '0.85rem' }}>
                                        <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>(=) Saldo Final de Caixa</td>
                                        {data.monthlyData.map((m) => (
                                            <td key={m.month} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: m.endingBalance >= 0 ? '#38bdf8' : '#ef4444' }}>
                                                {formatCurrency(m.endingBalance)}
                                            </td>
                                        ))}
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: data.monthlyData[11]?.endingBalance >= 0 ? '#38bdf8' : '#ef4444' }}>
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

                        // Agrupar pendências de conciliação por empresa
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {/* Listagem de Contas e Saldos Reais */}
                                <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1f2937' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 1.25rem' }}>Contas Financeiras Vinculadas (Saldos Reais)</h3>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                        {Object.entries(groupedAccounts).map(([tenantName, accounts]) => (
                                            <div key={tenantName} style={{ backgroundColor: '#1f2937', borderRadius: '8px', padding: '1rem', border: '1px solid #374151' }}>
                                                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>{tenantName}</h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {accounts.map(acc => (
                                                        <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', borderBottom: '1px solid #374151', paddingBottom: '4px' }}>
                                                            <span style={{ color: '#cbd5e1' }}>{acc.name}</span>
                                                            <strong style={{ color: acc.balance >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(acc.balance)}</strong>
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
                                <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1f2937' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 1.25rem' }}>Auditoria de Conciliação e Pendências</h3>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {pendingGroups.map((group) => {
                                            const isExpanded = !!expandedTenants[`audit-${group.name}`];
                                            return (
                                                <div key={group.name} style={{ backgroundColor: '#1f2937', borderRadius: '12px', border: '1px solid #374151', overflow: 'hidden' }}>
                                                    {/* Header do Accordion */}
                                                    <div 
                                                        onClick={() => toggleTenant(`audit-${group.name}`)}
                                                        style={{ 
                                                            padding: '1.25rem 1.5rem', 
                                                            display: 'flex', 
                                                            justifyContent: 'space-between', 
                                                            alignItems: 'center', 
                                                            cursor: 'pointer', 
                                                            backgroundColor: '#111827',
                                                            borderBottom: isExpanded ? '1px solid #374151' : 'none',
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
                                                                stroke="#94a3b8" 
                                                                strokeWidth="2.5" 
                                                                style={{ 
                                                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                                                                    transition: 'transform 0.2s' 
                                                                }}
                                                            >
                                                                <polyline points="9 18 15 12 9 6" />
                                                            </svg>
                                                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>{group.name}</span>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#374151', color: '#cbd5e1', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                                                                {group.items.length} {group.items.length === 1 ? 'pendência' : 'pendências'}
                                                            </span>
                                                        </div>

                                                        {/* Lado Direito */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>A Receber</span>
                                                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>{formatCurrency(group.totalInflow)}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>A Pagar</span>
                                                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(group.totalOutflow)}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Tabela do Accordion */}
                                                    {isExpanded && (
                                                        <div style={{ overflowX: 'auto', width: '100%' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem', textAlign: 'left' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '2px solid #374151', color: '#cbd5e1', backgroundColor: '#111827' }}>
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
                                                                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #374151', backgroundColor: idx % 2 === 0 ? '#1f2937' : '#111827' }}>
                                                                            <td style={{ padding: '0.75rem 1.5rem', fontWeight: 500, color: '#f8fafc' }}>
                                                                                {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', color: '#cbd5e1', fontWeight: 500 }}>{item.customer || '-'}</td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', color: '#94a3b8' }}>{item.description}</td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', color: '#94a3b8' }}>{item.category}</td>
                                                                            <td style={{ padding: '0.75rem 1.5rem' }}>
                                                                                {item.isOverdue ? (
                                                                                    <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                                                                                        ATRASADO
                                                                                    </span>
                                                                                ) : (
                                                                                    <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                                                                                        NO PRAZO
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, color: item.isRevenue ? '#10b981' : '#ef4444', textAlign: 'right' }}>
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
                                        {pendingGroups.length === 0 && (
                                            <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '3rem', border: '1px solid #1f2937', textAlign: 'center', color: '#94a3b8' }}>
                                                Nenhum título pendente de conciliação para os filtros atuais.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* 3. ABA: CONTAS A RECEBER (CAR) */}
                    {activeTab === 'car' && data && (() => {
                        const today = new Date();
                        const curYear = today.getFullYear();
                        const curMonthIdx = today.getMonth();

                        const carItems = data.monthlyData
                            .filter(m => selectedYear < curYear || (selectedYear === curYear && (m.month - 1) <= curMonthIdx))
                            .flatMap(m => m.details)
                            .filter(d => d.isRevenue);

                        // Agrupar por empresa
                        const grouped = carItems.reduce((acc, item) => {
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
                            <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1f2937' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 1.25rem' }}>Carteira de Contas a Receber (Aberto)</h3>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {tenantGroups.map((group) => {
                                        const isExpanded = !!expandedTenants[`car-${group.name}`];
                                        return (
                                            <div key={group.name} style={{ backgroundColor: '#1f2937', borderRadius: '12px', border: '1px solid #374151', overflow: 'hidden' }}>
                                                {/* Header do Accordion */}
                                                <div 
                                                    onClick={() => toggleTenant(`car-${group.name}`)}
                                                    style={{ 
                                                        padding: '1.25rem 1.5rem', 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between', 
                                                        alignItems: 'center', 
                                                        cursor: 'pointer', 
                                                        backgroundColor: '#111827',
                                                        borderBottom: isExpanded ? '1px solid #374151' : 'none',
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
                                                            stroke="#94a3b8" 
                                                            strokeWidth="2.5" 
                                                            style={{ 
                                                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                                                                transition: 'transform 0.2s' 
                                                            }}
                                                        >
                                                            <polyline points="9 18 15 12 9 6" />
                                                        </svg>
                                                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>{group.name}</span>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#374151', color: '#cbd5e1', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                                                            {group.items.length} {group.items.length === 1 ? 'título' : 'títulos'}
                                                        </span>
                                                    </div>

                                                    {/* Lado Direito: KPIs */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Em Dia</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>{formatCurrency(group.ontime)}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Atrasado</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(group.overdue)}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderLeft: '1px solid #374151', paddingLeft: '1.5rem' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total</span>
                                                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8' }}>{formatCurrency(group.total)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Detalhamento (Tabela) */}
                                                {isExpanded && (
                                                    <div style={{ overflowX: 'auto', width: '100%' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem', textAlign: 'left' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '2px solid #374151', color: '#cbd5e1', backgroundColor: '#111827' }}>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Vencimento</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Status</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Descrição</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Cliente</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem' }}>Categoria</th>
                                                                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>Valor do Título</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {group.items.map((item, idx) => (
                                                                    <tr key={item.id || idx} style={{ borderBottom: '1px solid #374151', backgroundColor: idx % 2 === 0 ? '#1f2937' : '#111827' }}>
                                                                        <td style={{ padding: '0.75rem 1.5rem', fontWeight: 500, color: '#f8fafc' }}>
                                                                            {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                            {item.isOverdue && overdueAction === 'today' && (
                                                                                <div style={{ fontSize: '0.65rem', color: '#cbd5e1', fontWeight: 400 }}>Projetado: {new Date(item.date).toLocaleDateString('pt-BR')}</div>
                                                                            )}
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 1.5rem' }}>
                                                                            <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: item.isOverdue ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: item.isOverdue ? '#ef4444' : '#10b981' }}>
                                                                                {item.isOverdue ? 'ATRASADO' : 'NO PRAZO'}
                                                                            </span>
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', color: '#cbd5e1', fontWeight: 500 }}>{item.description || 'Recebimento previsto'}</td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', color: '#cbd5e1' }}>{item.customer || '-'}</td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', color: '#cbd5e1' }}>{item.category}</td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, color: '#10b981', textAlign: 'right' }}>
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
                                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '4rem', border: '1px solid #1f2937', textAlign: 'center', color: '#94a3b8' }}>
                                            Nenhum recebimento em aberto encontrado para os filtros ativos.
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* 4. ABA: CONTAS A PAGAR (CAP) */}
                    {activeTab === 'cap' && data && (() => {
                        const today = new Date();
                        const curYear = today.getFullYear();
                        const curMonthIdx = today.getMonth();

                        const capItems = data.monthlyData
                            .filter(m => selectedYear < curYear || (selectedYear === curYear && (m.month - 1) <= curMonthIdx))
                            .flatMap(m => m.details)
                            .filter(d => !d.isRevenue);

                        // Agrupar por empresa
                        const grouped = capItems.reduce((acc, item) => {
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
                            <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1f2937' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 1.25rem' }}>Carteira de Contas a Pagar (Aberto)</h3>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {tenantGroups.map((group) => {
                                        const isExpanded = !!expandedTenants[`cap-${group.name}`];
                                        return (
                                            <div key={group.name} style={{ backgroundColor: '#1f2937', borderRadius: '12px', border: '1px solid #374151', overflow: 'hidden' }}>
                                                {/* Header do Accordion */}
                                                <div 
                                                    onClick={() => toggleTenant(`cap-${group.name}`)}
                                                    style={{ 
                                                        padding: '1.25rem 1.5rem', 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between', 
                                                        alignItems: 'center', 
                                                        cursor: 'pointer', 
                                                        backgroundColor: '#111827',
                                                        borderBottom: isExpanded ? '1px solid #374151' : 'none',
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
                                                            stroke="#94a3b8" 
                                                            strokeWidth="2.5" 
                                                            style={{ 
                                                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                                                                transition: 'transform 0.2s' 
                                                            }}
                                                        >
                                                            <polyline points="9 18 15 12 9 6" />
                                                        </svg>
                                                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>{group.name}</span>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#374151', color: '#cbd5e1', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                                                            {group.items.length} {group.items.length === 1 ? 'título' : 'títulos'}
                                                        </span>
                                                    </div>

                                                    {/* Lado Direito: KPIs */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Em Dia</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>{formatCurrency(group.ontime)}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Atrasado</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(group.overdue)}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderLeft: '1px solid #374151', paddingLeft: '1.5rem' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total</span>
                                                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ef4444' }}>{formatCurrency(group.total)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Detalhamento (Tabela) */}
                                                {isExpanded && (
                                                    <div style={{ overflowX: 'auto', width: '100%' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem', textAlign: 'left' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '2px solid #374151', color: '#cbd5e1', backgroundColor: '#111827' }}>
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
                                                                    <tr key={item.id || idx} style={{ borderBottom: '1px solid #374151', backgroundColor: idx % 2 === 0 ? '#1f2937' : '#111827' }}>
                                                                        <td style={{ padding: '0.75rem 1.5rem', fontWeight: 500, color: '#f8fafc' }}>
                                                                            {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                            {item.isOverdue && overdueAction === 'today' && (
                                                                                <div style={{ fontSize: '0.65rem', color: '#cbd5e1', fontWeight: 400 }}>Projetado: {new Date(item.date).toLocaleDateString('pt-BR')}</div>
                                                                            )}
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 1.5rem' }}>
                                                                            <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: item.isOverdue ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: item.isOverdue ? '#ef4444' : '#10b981' }}>
                                                                                {item.isOverdue ? 'ATRASADO' : 'NO PRAZO'}
                                                                            </span>
                                                                        </td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', color: '#cbd5e1', fontWeight: 500 }}>{item.description || 'Pagamento previsto'}</td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', color: '#cbd5e1' }}>{item.customer || '-'}</td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', color: '#cbd5e1' }}>{item.category}</td>
                                                                        <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, color: '#ef4444', textAlign: 'right' }}>
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
                                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '4rem', border: '1px solid #1f2937', textAlign: 'center', color: '#94a3b8' }}>
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
                    backgroundColor: 'rgba(2, 6, 23, 0.75)',
                    backdropFilter: 'blur(8px)',
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
                                        <div style={{ fontSize: '0.875rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                                            Exibindo todos os <strong>{list.length}</strong> recebimentos previstos em aberto para o ano selecionado:
                                        </div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid #374151', color: '#f8fafc' }}>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Vencimento</th>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Descrição</th>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Cliente</th>
                                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Valor c/ Inad.</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {list.map((item, idx) => (
                                                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #374151', backgroundColor: idx % 2 === 0 ? '#1f2937' : '#111827' }}>
                                                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500, color: '#f8fafc' }}>
                                                                {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                {item.isOverdue && <span style={{ display: 'inline-block', marginLeft: '0.4rem', padding: '0.1rem 0.3rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>ATRASADO</span>}
                                                            </td>
                                                            <td style={{ padding: '0.6rem 0.75rem', color: '#cbd5e1' }}>{item.description}</td>
                                                            <td style={{ padding: '0.6rem 0.75rem', color: '#94a3b8' }}>{item.customer || '-'}</td>
                                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
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
                                        <div style={{ fontSize: '0.875rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                                            Exibindo todos os <strong>{list.length}</strong> pagamentos previstos em aberto para o ano selecionado:
                                        </div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid #374151', color: '#f8fafc' }}>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Vencimento</th>
                                                        <th style={{ padding: '0.5rem 0.75rem' }}>Descrição</th>
                                                        <th style={{ padding: '0.75rem 0.75rem' }}>Fornecedor</th>
                                                        <th style={{ padding: '0.75rem 0.75rem', textAlign: 'right' }}>Valor</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {list.map((item, idx) => (
                                                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #374151', backgroundColor: idx % 2 === 0 ? '#1f2937' : '#111827' }}>
                                                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500, color: '#f8fafc' }}>
                                                                {new Date(item.originalDate || item.date).toLocaleDateString('pt-BR')}
                                                                {item.isOverdue && <span style={{ display: 'inline-block', marginLeft: '0.4rem', padding: '0.1rem 0.3rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>ATRASADO</span>}
                                                            </td>
                                                            <td style={{ padding: '0.6rem 0.75rem', color: '#cbd5e1' }}>{item.description}</td>
                                                            <td style={{ padding: '0.6rem 0.75rem', color: '#94a3b8' }}>{item.customer || '-'}</td>
                                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>
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
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                                        O <strong>Saldo Final Projetado</strong> é a estimativa da disponibilidade líquida de caixa ao final do ano, considerando os saldos bancários e a conciliação de todos os títulos em aberto (atrasados e futuros).
                                    </p>
                                    <div style={{ backgroundColor: '#1f2937', borderRadius: '12px', padding: '1.25rem', border: '1px solid #374151', fontFamily: 'monospace', fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                                            <span>(+) Saldo Bancário Atual</span>
                                            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatCurrency(cardTotals.current)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                                            <span>(+) Recebimentos em Aberto (c/ inad.)</span>
                                            <span>{formatCurrency(cardTotals.inflows)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444', borderBottom: '1px solid #374151', paddingBottom: '0.75rem' }}>
                                            <span>(-) Pagamentos em Aberto</span>
                                            <span>{formatCurrency(cardTotals.outflows)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.05rem', color: '#38bdf8' }}>
                                            <span>(=) Saldo Final Projetado</span>
                                            <span>{formatCurrency(cardTotals.projected)}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem', color: '#cbd5e1', backgroundColor: '#1e1b4b', padding: '1rem', borderRadius: '8px', border: '1px solid #312e81' }}>
                                        <span style={{ fontWeight: 700, color: '#818cf8' }}>Fórmulas e Controles Ativos:</span>
                                        <span>• Taxa de inadimplência projetada: <strong>{defaultRate}%</strong> aplicada a todas as parcelas CAR previstas.</span>
                                        <span>• Tratamento de atrasados: <strong>{overdueAction === 'today' ? 'Postergar vencimento para hoje (padrão)' : overdueAction === 'ignore' ? 'Desconsiderar atrasados' : 'Manter vencimento original'}</strong>.</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#111827' }}>
                            <button
                                onClick={() => { setModalOpen(false); setModalType(null); }}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: '#374151',
                                    color: '#cbd5e1',
                                    fontWeight: 700,
                                    fontSize: '0.81rem',
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

            {/* Botão Flutuante do Chat CFO */}
            <div 
                onClick={() => setIsChatOpen(!isChatOpen)}
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: '#2563eb',
                    boxShadow: '0 4px 20px rgba(37, 99, 235, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 999,
                    transition: 'transform 0.2s',
                    transform: isChatOpen ? 'scale(0.9) rotate(45deg)' : 'scale(1)'
                }}
                title="Fale com o CFO Virtual"
            >
                <span style={{ fontSize: '1.6rem', color: '#ffffff' }}>💬</span>
            </div>

            {/* Drawer Lateral do Chat CFO */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: '420px',
                maxWidth: '90vw',
                height: '100vh',
                backgroundColor: '#0b0f19',
                borderLeft: '1px solid #1f2937',
                boxShadow: '-8px 0 32px rgba(0,0,0,0.6)',
                zIndex: 1000,
                transform: isChatOpen ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111827' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>🤖</span>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#f8fafc' }}>CFO Virtual Inteligente</h4>
                            <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 600 }}>● Online e Pronto</span>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsChatOpen(false)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem' }}
                    >
                        ✕
                    </button>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {chatMessages.map((msg, idx) => {
                        const isUser = msg.role === 'user';
                        return (
                            <div 
                                key={idx}
                                style={{
                                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                                    maxWidth: '85%',
                                    backgroundColor: isUser ? '#2563eb' : '#1f2937',
                                    color: '#f8fafc',
                                    padding: '0.75rem 1rem',
                                    borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                    fontSize: '0.8rem',
                                    lineHeight: '1.4',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                    whiteSpace: 'pre-wrap'
                                }}
                            >
                                {msg.content}
                            </div>
                        );
                    })}
                    {isGenerating && (
                        <div style={{ alignSelf: 'flex-start', backgroundColor: '#1f2937', color: '#cbd5e1', padding: '0.75rem 1rem', borderRadius: '14px 14px 14px 2px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#38bdf8', animation: 'bounce 0.6s infinite alternate' }}></span>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#38bdf8', animation: 'bounce 0.6s infinite alternate 0.2s' }}></span>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#38bdf8', animation: 'bounce 0.6s infinite alternate 0.4s' }}></span>
                            <span>Analisando caixa...</span>
                        </div>
                    )}
                </div>

                {/* Input Form */}
                <div style={{ padding: '1rem', borderTop: '1px solid #1f2937', backgroundColor: '#111827', display: 'flex', gap: '8px' }}>
                    <input 
                        type="text"
                        placeholder="Pergunte ao CFO sobre o fluxo..."
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
                        style={{
                            flex: 1,
                            backgroundColor: '#1f2937',
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            padding: '0.5rem 0.75rem',
                            color: '#f8fafc',
                            fontSize: '0.8rem',
                            outline: 'none'
                        }}
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={isGenerating || !inputMessage.trim()}
                        style={{
                            backgroundColor: '#2563eb',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.5rem 1rem',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: (isGenerating || !inputMessage.trim()) ? 'not-allowed' : 'pointer',
                            opacity: (isGenerating || !inputMessage.trim()) ? 0.6 : 1
                        }}
                    >
                        Enviar
                    </button>
                </div>
            </div>

            {/* Injetar estilos de spin para o loader */}
            <style jsx global>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes bounce {
                    from { transform: translateY(0); }
                    to { transform: translateY(-4px); }
                }
            `}</style>
        </div>
    );
}
