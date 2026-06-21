'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
    // --- Detailed Analysis Custom Charts State ---
    const [activeAnalysisTab, setActiveAnalysisTab] = useState<'carteira' | 'detailed'>('carteira');
    const [companies, setCompanies] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>([]);
    const [detailedAnalyses, setDetailedAnalyses] = useState<any[]>([]);
    const [loadingDetailed, setLoadingDetailed] = useState(false);
    const [isEditingChart, setIsEditingChart] = useState(false);
    const [editingChartId, setEditingChartId] = useState<string | null>(null);

    // Chart editor form states
    const [chartCategory, setChartCategory] = useState<string>('');
    const [chartCategorySearch, setChartCategorySearch] = useState<string>('');
    const [isChartCategoryDropdownOpen, setIsChartCategoryDropdownOpen] = useState(false);
    const [chartTenant, setChartTenant] = useState<string>('');
    const [chartCC, setChartCC] = useState<string>('ALL');
    const [chartType, setChartType] = useState<string>('VERTICAL_BAR');
    const [chartOnlyRealized, setChartOnlyRealized] = useState<boolean>(false);
    const [chartShowAtingido, setChartShowAtingido] = useState<boolean>(false);
    const [chartPctOfRevenue, setChartPctOfRevenue] = useState<boolean>(false);
    const [chartAnalysisText, setChartAnalysisText] = useState<string>('');
    const [chartColor, setChartColor] = useState<string>('#6366f1');

    // Preview data states
    const [chartPreviewData, setChartPreviewData] = useState<any[]>([]);
    const [loadingPreviewData, setLoadingPreviewData] = useState(false);
    const [savingChart, setSavingChart] = useState(false);
    const [indicatorName, setIndicatorName] = useState<string>('');
    const [analysisSelectedTenant, setAnalysisSelectedTenant] = useState<string>('');
    const prevTenantRef = useRef<string>('');

    const [seriesConfig, setSeriesConfig] = useState<Record<string, string>>({
        budget: 'bar',
        realized: 'bar',
        atingido: 'none',
        pctOfRevenue: 'none'
    });

    const toggleChartCategory = useCallback((id: string) => {
        setChartCategory(prev => {
            const selectedIds = prev ? prev.split(',').map(x => x.trim()).filter(Boolean) : [];
            const index = selectedIds.indexOf(id);
            if (index === -1) {
                selectedIds.push(id);
            } else {
                selectedIds.splice(index, 1);
            }
            return selectedIds.join(',');
        });
    }, []);

    const getChartCategoryLabel = useCallback((categoriesStr: string) => {
        if (!categoriesStr) return 'Selecione as contas...';
        const selectedIds = categoriesStr.split(',').map(x => x.trim()).filter(Boolean);
        const dreLabels: Record<string, string> = {
            vRev: 'Receita Bruta',
            vTaxes: 'Deduções / Impostos',
            vRecLiq: 'Receita Líquida',
            vCosts: 'Custos Operacionais',
            vGrossMarg: 'Margem Bruta',
            vOpExp: 'Despesas Operacionais',
            vContribMarg: 'Margem de Contribuição',
            vAdminExp: 'Despesas Administrativas',
            vEbitda: 'EBITDA',
            vFin: 'Despesas Financeiras',
            vNetProfit: 'Lucro Líquido'
        };
        
        const labels = selectedIds.map(id => {
            if (dreLabels[id]) return dreLabels[id];
            const found = categories.find((cat: any) => cat.id === id);
            return found ? found.name : id;
        });

        return labels.join(' + ');
    }, [categories]);

    const getChartHeaderTitle = useCallback((chart: any) => {
        if (chart.chartType && chart.chartType.startsWith('{')) {
            try {
                const parsed = JSON.parse(chart.chartType);
                if (parsed.indicatorName) {
                    return parsed.indicatorName;
                }
            } catch (e) {
                // ignore
            }
        }
        return getChartCategoryLabel(chart.categoryId);
    }, [getChartCategoryLabel]);

    // Resolve month number for custom charts (detailed analysis API needs a specific 1-12 month)
    const activeMonthNumber = useMemo(() => {
        const parsed = Number(selectedMonth);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) return parsed;
        return new Date().getMonth() + 1;
    }, [selectedMonth]);

    // Fetch setup data (companies, categories, cost centers)
    useEffect(() => {
        const fetchSetup = async () => {
            try {
                // Fetch companies
                const compRes = await fetch('/api/companies');
                const compData = await compRes.json();
                if (compData.success) {
                    setCompanies(compData.companies || []);
                    if (compData.companies?.length > 0) {
                        const cached = localStorage.getItem('selectedTenantId');
                        const hasCached = cached && compData.companies.some((c: any) => c.id === cached);
                        let target = compData.companies[0].id;
                        if (hasCached) {
                            target = cached!;
                        } else {
                            const jvs = compData.companies.find((c: any) => c.name.toUpperCase().includes('JVS TRAT'));
                            if (jvs) target = jvs.id;
                        }
                        setAnalysisSelectedTenant(target);
                        prevTenantRef.current = target;
                    }
                }
                
                // Fetch categories and cost centers
                const setupRes = await fetch(`/api/setup?year=${selectedYear}&t=${Date.now()}`);
                const setupData = await setupRes.json();
                if (setupData.success) {
                    setCategories(setupData.categories || []);
                    setCostCenters(setupData.costCenters || []);
                }
            } catch (err) {
                console.error('Setup Fetch Error:', err);
            }
        };
        fetchSetup();
    }, [selectedYear]);

    // Fetch detailed analyses (charts) for all companies
    const fetchDetailedAnalyses = useCallback(async () => {
        if (companies.length === 0) return;
        setLoadingDetailed(true);
        try {
            const promises = companies.map(async (company) => {
                const res = await fetch(`/api/kpi/detailed-analysis?tenantId=${company.id}&month=${activeMonthNumber}&year=${selectedYear}`);
                const json = await res.json();
                return json.success ? json.data || [] : [];
            });
            const results = await Promise.all(promises);
            setDetailedAnalyses(results.flat());
        } catch (err) {
            console.error('Error fetching detailed analyses:', err);
        } finally {
            setLoadingDetailed(false);
        }
    }, [companies, activeMonthNumber, selectedYear]);

    // Fetch chart preview data
    const fetchChartData = useCallback(async (catId: string, tenId: string, ccId: string) => {
        if (!catId || !tenId) return;
        setLoadingPreviewData(true);
        try {
            const res = await fetch(`/api/kpi/detailed-chart-data?categoryId=${catId}&filterTenantId=${tenId}&filterCCId=${ccId}&year=${selectedYear}&viewMode=${selectedViewMode}`);
            const json = await res.json();
            if (json.success) {
                setChartPreviewData(json.data || []);
            }
        } catch (err) {
            console.error('Error fetching chart preview data:', err);
        } finally {
            setLoadingPreviewData(false);
        }
    }, [selectedYear, selectedViewMode]);

    // Reactively fetch detailed analysis list when active tab changes
    useEffect(() => {
        if (activeAnalysisTab === 'detailed') {
            fetchDetailedAnalyses();
        }
    }, [activeAnalysisTab, fetchDetailedAnalyses]);

    // Reactively fetch preview chart data during editing
    useEffect(() => {
        if (isEditingChart && chartCategory && chartTenant) {
            fetchChartData(chartCategory, chartTenant, chartCC);
        }
    }, [isEditingChart, chartCategory, chartTenant, chartCC, fetchChartData]);

    // Mapear seleção de categorias se o Tenant de contexto for alterado
    useEffect(() => {
        if (prevTenantRef.current === analysisSelectedTenant) {
            return;
        }
        prevTenantRef.current = analysisSelectedTenant;

        if (!analysisSelectedTenant || !categories.length || !chartCategory) return;
        
        const currentIds = chartCategory.split(',').map(x => x.trim()).filter(Boolean);
        if (currentIds.length === 0) return;

        const isDreKey = (id: string) => ['vRev', 'vTaxes', 'vRecLiq', 'vCosts', 'vGrossMarg', 'vOpExp', 'vContribMarg', 'vAdminExp', 'vEbitda', 'vFin', 'vNetProfit'].includes(id);
        const hasCategoriesToTranslate = currentIds.some(id => !isDreKey(id));
        if (!hasCategoriesToTranslate) return;

        const selectedCatsInOldTenant = currentIds.map(id => {
            if (isDreKey(id)) return { id, isDre: true };
            const cat = categories.find((c: any) => c.id === id);
            return cat ? { id, name: cat.name, isDre: false } : null;
        }).filter(Boolean);

        const normalize = (s: string) => s.toLowerCase().trim();
        const newIds = selectedCatsInOldTenant.map(item => {
            if (item!.isDre) return item!.id;
            
            // Se a categoria com esse ID já pertence ao tenant de destino, mantém ela!
            const currentCat = categories.find((c: any) => c.id === item!.id);
            if (currentCat && currentCat.tenantId === analysisSelectedTenant) {
                return item!.id;
            }
            
            const foundInNewTenant = categories.find((c: any) => 
                c.tenantId === analysisSelectedTenant && 
                normalize(c.name) === normalize(item!.name)
            );
            return foundInNewTenant ? foundInNewTenant.id : null;
        }).filter(Boolean);

        const uniqueNewIds = Array.from(new Set(newIds));
        const joined = uniqueNewIds.join(',');
        if (joined !== chartCategory) {
            setChartCategory(joined);
        }
    }, [analysisSelectedTenant, categories, chartCategory]);

    const saveDetailedAnalysis = async () => {
        if (!analysisSelectedTenant || !activeMonthNumber || !selectedYear) {
            alert('Parâmetros de contexto ausentes.');
            return;
        }
        if (!chartCategory || !chartTenant || !chartType) {
            alert('Por favor, configure os campos obrigatórios do gráfico (Conta, Empresa e Tipo).');
            return;
        }
        const categoryIdsCount = chartCategory.split(',').map(x => x.trim()).filter(Boolean).length;
        if (categoryIdsCount > 1 && !indicatorName.trim()) {
            alert('Por favor, defina um nome para o indicador (grupo) antes de salvar.');
            return;
        }
        setSavingChart(true);
        try {
            const res = await fetch('/api/kpi/detailed-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingChartId || undefined,
                    tenantId: analysisSelectedTenant,
                    month: activeMonthNumber,
                    year: selectedYear,
                    categoryId: chartCategory,
                    filterTenantId: chartTenant,
                    filterCCId: chartCC,
                    chartType: chartType === 'MIXED' || categoryIdsCount > 1
                        ? JSON.stringify({ mode: chartType, config: seriesConfig, indicatorName })
                        : chartType,
                    onlyRealized: chartOnlyRealized,
                    showAtingido: chartShowAtingido,
                    pctOfRevenue: chartPctOfRevenue,
                    chartColor,
                    analysisText: chartAnalysisText
                })
            });
            const json = await res.json();
            if (json.success) {
                alert('Gráfico e análise detalhada salvos com sucesso!');
                setIsEditingChart(false);
                setEditingChartId(null);
                fetchDetailedAnalyses();
            } else {
                alert(`Erro ao salvar gráfico: ${json.error}`);
            }
        } catch (err) {
            console.error('Error saving detailed analysis:', err);
            alert('Erro de conexão ao salvar.');
        } finally {
            setSavingChart(false);
        }
    };

    const deleteDetailedAnalysis = async (id: string) => {
        if (!confirm('Deseja realmente excluir este gráfico e sua análise detalhada?')) return;
        try {
            const res = await fetch(`/api/kpi/detailed-analysis?id=${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
                fetchDetailedAnalyses();
            } else {
                alert(`Erro ao excluir: ${json.error}`);
            }
        } catch (err) {
            console.error('Error deleting detailed analysis:', err);
        }
    };

    const handleAddChartClick = () => {
        setEditingChartId(null);
        setChartCategory('');
        setChartCategorySearch('');
        setChartTenant('ALL');
        setChartCC('ALL');
        setChartType('VERTICAL_BAR');
        setChartOnlyRealized(false);
        setChartShowAtingido(false);
        setChartPctOfRevenue(false);
        setChartColor('#6366f1');
        setChartAnalysisText('');
        setSeriesConfig({
            budget: 'bar',
            realized: 'bar',
            atingido: 'none',
            pctOfRevenue: 'none'
        });
        setIndicatorName('');
        
        let targetTenant = '';
        let targetFilterTenant = 'ALL';
        if (companies.length > 0) {
            const cached = localStorage.getItem('selectedTenantId');
            const hasCached = cached && cached !== 'ALL' && companies.some(c => c.id === cached);
            if (hasCached) {
                targetTenant = cached!;
                targetFilterTenant = cached!;
            } else {
                const jvs = companies.find(c => c.name.toUpperCase().includes('JVS TRAT'));
                targetTenant = jvs ? jvs.id : companies[0].id;
                targetFilterTenant = 'ALL';
            }
            setAnalysisSelectedTenant(targetTenant);
            setChartTenant(targetFilterTenant);
            prevTenantRef.current = targetTenant;
        } else {
            setChartTenant('ALL');
        }
        
        setChartPreviewData([]);
        setIsEditingChart(true);
    };

    const handleEditChartClick = (chart: any) => {
        setEditingChartId(chart.id);
        setChartCategory(chart.categoryId);
        setChartCategorySearch('');
        setChartTenant(chart.filterTenantId);
        setChartCC(chart.filterCCId || 'ALL');
        
        let nameVal = '';
        if (chart.chartType && chart.chartType.startsWith('{')) {
            try {
                const parsed = JSON.parse(chart.chartType);
                setChartType('MIXED');
                setSeriesConfig(parsed.config || {
                    budget: 'bar',
                    realized: 'bar',
                    atingido: 'none',
                    pctOfRevenue: 'none'
                });
                nameVal = parsed.indicatorName || '';
            } catch (e) {
                setChartType(chart.chartType);
                setSeriesConfig({
                    budget: 'bar',
                    realized: 'bar',
                    atingido: 'none',
                    pctOfRevenue: 'none'
                });
            }
        } else {
            setChartType(chart.chartType || 'VERTICAL_BAR');
            setSeriesConfig({
                budget: 'bar',
                realized: 'bar',
                atingido: 'none',
                pctOfRevenue: 'none'
            });
        }
        setIndicatorName(nameVal);

        setChartOnlyRealized(!!chart.onlyRealized);
        setChartShowAtingido(!!chart.showAtingido);
        setChartPctOfRevenue(!!chart.pctOfRevenue);
        setChartColor(chart.chartColor || '#6366f1');
        setAnalysisSelectedTenant(chart.tenantId);
        prevTenantRef.current = chart.tenantId;
        setChartAnalysisText(chart.analysisText || '');
        setChartPreviewData([]);
        setIsEditingChart(true);
    };

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


                {/* Tab Switcher */}
                <div style={{
                    display: 'flex',
                    background: 'var(--bg-surface)',
                    padding: '0.3rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border-default)',
                    marginBottom: '2rem',
                    maxWidth: '450px',
                    gap: '0.3rem'
                }}>
                    <button
                        onClick={() => setActiveAnalysisTab('carteira')}
                        style={{
                            flex: 1,
                            padding: '0.6rem',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: activeAnalysisTab === 'carteira' ? 'var(--gradient-brand)' : 'transparent',
                            color: activeAnalysisTab === 'carteira' ? '#ffffff' : 'var(--text-secondary)',
                            boxShadow: activeAnalysisTab === 'carteira' ? 'var(--shadow-button)' : 'none'
                        }}
                    >
                        💼 Análise de Carteira
                    </button>
                    <button
                        onClick={() => setActiveAnalysisTab('detailed')}
                        style={{
                            flex: 1,
                            padding: '0.6rem',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: activeAnalysisTab === 'detailed' ? 'var(--gradient-brand)' : 'transparent',
                            color: activeAnalysisTab === 'detailed' ? '#ffffff' : 'var(--text-secondary)',
                            boxShadow: activeAnalysisTab === 'detailed' ? 'var(--shadow-button)' : 'none'
                        }}
                    >
                        📊 Análises Detalhadas
                    </button>
                </div>

                {activeAnalysisTab === 'carteira' && (
                    <>

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
            </>
        )}

                {/* ABA 2: ANÁLISES DETALHADAS */}
                {activeAnalysisTab === 'detailed' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', backgroundColor: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                        {!isEditingChart ? (
                            <>
                                {/* Header list view */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                                            📊 Gráficos Customizados Cadastrados
                                        </h3>
                                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            Analise qualquer conta DRE do período de {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][activeMonthNumber - 1]} de {selectedYear}.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleAddChartClick}
                                        style={{
                                            padding: '0.55rem 1.25rem',
                                            background: 'var(--gradient-brand)',
                                            color: '#ffffff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            boxShadow: 'var(--shadow-button)'
                                        }}
                                    >
                                        ➕ Adicionar Gráfico
                                    </button>
                                </div>

                                {loadingDetailed ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px' }}>
                                        <div style={{ border: '3px solid var(--border-default)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 1s linear infinite' }} />
                                    </div>
                                ) : detailedAnalyses.length === 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', gap: '1rem' }}>
                                        <div style={{ fontSize: '3rem' }}>📊</div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Nenhum gráfico cadastrado para este mês</h4>
                                            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '450px' }}>
                                                Não há gráficos ou relatos históricos registrados para este período. Clique em "Adicionar Gráfico" para configurar a primeira análise.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {detailedAnalyses.map((chart: any) => (
                                            <DetailedChartCard 
                                                key={chart.id}
                                                chart={chart} 
                                                onEdit={handleEditChartClick} 
                                                onDelete={deleteDetailedAnalysis} 
                                                mainMonth={activeMonthNumber} 
                                                year={selectedYear} 
                                                viewMode={selectedViewMode} 
                                                categories={categories} 
                                                companies={companies}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            /* Editor inline */
                            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                                {/* Form column */}
                                <div style={{ flex: 1.2, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {editingChartId ? '✏️ Editar Configuração do Gráfico' : '➕ Configurar Novo Gráfico'}
                                        </h4>
                                    </div>

                                    {/* Chart Types selector buttons */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo de Gráfico *</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
                                            {[
                                                { id: 'VERTICAL_BAR', label: '📊 Vertical' },
                                                { id: 'HORIZONTAL_BAR', label: '➖ Horizontal' },
                                                { id: 'LINE', label: '📈 Linha' },
                                                { id: 'LINE_MARKERS', label: '📉 Linha/Marc.' },
                                                { id: 'PIE', label: '🍕 Pizza' },
                                                { id: 'DONUT', label: '🍩 Rosca' },
                                                { id: 'GAUGE', label: '⏱️ Velocímetro' },
                                                { id: 'MIXED', label: '🔀 Eixo Duplo' }
                                            ].map((typeItem) => (
                                                <button
                                                    key={typeItem.id}
                                                    type="button"
                                                    onClick={() => setChartType(typeItem.id)}
                                                    style={{
                                                        padding: '0.6rem',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 700,
                                                        borderRadius: '8px',
                                                        border: '1px solid',
                                                        borderColor: chartType === typeItem.id ? 'var(--accent-indigo)' : 'var(--border-default)',
                                                        background: chartType === typeItem.id ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-surface)',
                                                        color: chartType === typeItem.id ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.25rem'
                                                    }}
                                                >
                                                    {typeItem.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Category DRE searchable dropdown */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', position: 'relative' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conta do DRE / Indicador *</label>
                                        <div
                                            onClick={() => {
                                                setIsChartCategoryDropdownOpen(!isChartCategoryDropdownOpen);
                                                setChartCategorySearch('');
                                            }}
                                            style={{
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '0 0.85rem',
                                                height: '38px',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                border: '1px solid var(--border-default)',
                                                borderRadius: '8px',
                                                background: 'var(--bg-surface)',
                                                outline: 'none',
                                                userSelect: 'none',
                                                color: 'var(--text-primary)'
                                            }}
                                        >
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {getChartCategoryLabel(chartCategory)}
                                            </span>
                                            <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>▼</span>
                                        </div>

                                        {isChartCategoryDropdownOpen && (
                                            <>
                                                <div 
                                                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }} 
                                                    onClick={() => setIsChartCategoryDropdownOpen(false)} 
                                                />
                                                <div 
                                                    className="glass-card" 
                                                    style={{ 
                                                        position: 'absolute', 
                                                        top: 'calc(100% + 4px)', 
                                                        left: 0, 
                                                        right: 0, 
                                                        zIndex: 10000, 
                                                        maxHeight: '220px', 
                                                        overflowY: 'auto', 
                                                        background: 'var(--bg-surface)', 
                                                        border: '1px solid var(--border-default)',
                                                        borderRadius: '8px',
                                                        boxShadow: 'var(--shadow-card)',
                                                        padding: '0.25rem 0'
                                                    }}
                                                >
                                                    <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10 }}>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Pesquisar conta..." 
                                                            value={chartCategorySearch}
                                                            onChange={(e) => setChartCategorySearch(e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            autoFocus
                                                            style={{ 
                                                                width: '100%', 
                                                                padding: '0.45rem 0.6rem', 
                                                                fontSize: '0.8rem', 
                                                                borderRadius: '6px', 
                                                                border: '1px solid var(--border-default)', 
                                                                background: 'var(--bg-elevated)', 
                                                                outline: 'none',
                                                                color: 'var(--text-primary)',
                                                                boxSizing: 'border-box'
                                                            }}
                                                        />
                                                    </div>
                                                    <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                                        {/* DRE Options */}
                                                        {Object.entries({
                                                            vRev: '(=) Receita Bruta',
                                                            vTaxes: '(-) Deduções / Impostos',
                                                            vRecLiq: '(=) Receita Líquida',
                                                            vCosts: '(-) Custos Operacionais',
                                                            vGrossMarg: '(=) Margem Bruta',
                                                            vOpExp: '(-) Despesas Operacionais',
                                                            vContribMarg: '(=) Margem de Contribuição',
                                                            vAdminExp: '(-) Despesas Administrativas',
                                                            vEbitda: '(=) EBITDA',
                                                            vFin: '(-) Despesas Financeiras',
                                                            vNetProfit: '(=) Lucro Líquido'
                                                        })
                                                        .filter(([_, name]) => !chartCategorySearch || name.toLowerCase().includes(chartCategorySearch.toLowerCase()))
                                                        .map(([id, name]) => {
                                                            const isSelected = chartCategory.split(',').map(x => x.trim()).filter(Boolean).includes(id);
                                                            return (
                                                                <div
                                                                    key={id}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleChartCategory(id);
                                                                    }}
                                                                    style={{ 
                                                                        padding: '0.45rem 0.75rem', 
                                                                        cursor: 'pointer', 
                                                                        fontSize: '0.8rem', 
                                                                        fontWeight: 700,
                                                                        color: 'var(--accent-indigo)',
                                                                        background: isSelected ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.5rem'
                                                                    }}
                                                                >
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={isSelected}
                                                                        readOnly
                                                                        style={{ accentColor: 'var(--accent-indigo)', pointerEvents: 'none' }}
                                                                    />
                                                                    <span>⭐ {name}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Categories list */}
                                                        {categories
                                                            .filter(cat => {
                                                                const activeTenant = analysisSelectedTenant || (companies.length > 0 ? companies[0].id : '');
                                                                return cat.tenantId === activeTenant;
                                                            })
                                                            .filter(cat => !chartCategorySearch || cat.name.toLowerCase().includes(chartCategorySearch.toLowerCase()))
                                                            .sort((a, b) => a.name.localeCompare(b.name))
                                                            .map((cat: any) => {
                                                                const isSelected = chartCategory.split(',').map(x => x.trim()).filter(Boolean).includes(cat.id);
                                                                return (
                                                                    <div
                                                                        key={cat.id}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            toggleChartCategory(cat.id);
                                                                        }}
                                                                        style={{ 
                                                                            padding: '0.45rem 0.75rem', 
                                                                            cursor: 'pointer', 
                                                                            fontSize: '0.8rem', 
                                                                            fontWeight: 600,
                                                                            color: 'var(--text-primary)',
                                                                            background: isSelected ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.5rem'
                                                                        }}
                                                                    >
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={isSelected}
                                                                            readOnly
                                                                            style={{ accentColor: 'var(--accent-indigo)', pointerEvents: 'none' }}
                                                                        />
                                                                        <span>{cat.name}</span>
                                                                    </div>
                                                                );
                                                            })
                                                        }
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Nome do Indicador (Obrigatório se selecionadas múltiplas contas) */}
                                    {chartCategory.split(',').map(x => x.trim()).filter(Boolean).length > 1 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Nome do Indicador / Grupo * <span style={{ color: 'var(--accent-red)' }}>(Obrigatório para múltiplas contas)</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={indicatorName}
                                                onChange={(e) => setIndicatorName(e.target.value)}
                                                placeholder="Ex: Total de Diárias"
                                                style={{ width: '100%', height: '38px', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border-default)', borderRadius: '8px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                    )}

                                    {/* Configuração de Séries Individuais (Modo Combinado/Múltiplas Contas) */}
                                    {chartType === 'MIXED' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.85rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)', marginTop: '0.25rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                ⚙️ Configuração do Eixo Duplo (Exibição por Métrica)
                                            </span>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {/* Orçado */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                        Orçado (Meta)
                                                    </span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'flex-end', maxWidth: '70%' }}>
                                                        {[
                                                            { key: 'bar', label: '📊 Barra (R$)' },
                                                            { key: 'line_val', label: '📈 Linha (R$)' },
                                                            { key: 'diarias_bar', label: '📅 Barra (Diárias R$/dia)' },
                                                            { key: 'diarias_line', label: '📅 Linha (Diárias R$/dia)' },
                                                            { key: 'none', label: '❌ Oculto' }
                                                        ].map(opt => (
                                                            <button
                                                                key={opt.key}
                                                                type="button"
                                                                onClick={() => setSeriesConfig(cfg => ({ ...cfg, budget: opt.key as any }))}
                                                                style={{
                                                                    padding: '0.35rem 0.6rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    borderRadius: '6px',
                                                                    border: '1px solid',
                                                                    borderColor: (seriesConfig.budget || 'bar') === opt.key ? 'var(--accent-indigo)' : 'var(--border-default)',
                                                                    background: (seriesConfig.budget || 'bar') === opt.key ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-surface)',
                                                                    color: (seriesConfig.budget || 'bar') === opt.key ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.15s'
                                                                }}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Realizado */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                        Realizado
                                                    </span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'flex-end', maxWidth: '70%' }}>
                                                        {[
                                                            { key: 'bar', label: '📊 Barra (R$)' },
                                                            { key: 'line_val', label: '📈 Linha (R$)' },
                                                            { key: 'diarias_bar', label: '📅 Barra (Diárias R$/dia)' },
                                                            { key: 'diarias_line', label: '📅 Linha (Diárias R$/dia)' },
                                                            { key: 'none', label: '❌ Oculto' }
                                                        ].map(opt => (
                                                            <button
                                                                key={opt.key}
                                                                type="button"
                                                                onClick={() => setSeriesConfig(cfg => ({ ...cfg, realized: opt.key as any }))}
                                                                style={{
                                                                    padding: '0.35rem 0.6rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    borderRadius: '6px',
                                                                    border: '1px solid',
                                                                    borderColor: (seriesConfig.realized || 'bar') === opt.key ? 'var(--accent-indigo)' : 'var(--border-default)',
                                                                    background: (seriesConfig.realized || 'bar') === opt.key ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-surface)',
                                                                    color: (seriesConfig.realized || 'bar') === opt.key ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.15s'
                                                                }}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Atingido */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                        Atingido (% do Orçado)
                                                    </span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'flex-end', maxWidth: '70%' }}>
                                                        {[
                                                            { key: 'line_atingido', label: '📈 Linha (% At.)' },
                                                            { key: 'none', label: '❌ Oculto' }
                                                        ].map(opt => (
                                                            <button
                                                                key={opt.key}
                                                                type="button"
                                                                onClick={() => setSeriesConfig(cfg => ({ ...cfg, atingido: opt.key as any }))}
                                                                style={{
                                                                    padding: '0.35rem 0.6rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    borderRadius: '6px',
                                                                    border: '1px solid',
                                                                    borderColor: (seriesConfig.atingido || 'none') === opt.key ? 'var(--accent-indigo)' : 'var(--border-default)',
                                                                    background: (seriesConfig.atingido || 'none') === opt.key ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-surface)',
                                                                    color: (seriesConfig.atingido || 'none') === opt.key ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.15s'
                                                                }}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Percentual sobre Receita */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                        Percentual sobre Receita
                                                    </span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'flex-end', maxWidth: '70%' }}>
                                                        {[
                                                            { key: 'line_revenue', label: '📉 Linha (% Rec.)' },
                                                            { key: 'none', label: '❌ Oculto' }
                                                        ].map(opt => (
                                                            <button
                                                                key={opt.key}
                                                                type="button"
                                                                onClick={() => setSeriesConfig(cfg => ({ ...cfg, pctOfRevenue: opt.key as any }))}
                                                                style={{
                                                                    padding: '0.35rem 0.6rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    borderRadius: '6px',
                                                                    border: '1px solid',
                                                                    borderColor: (seriesConfig.pctOfRevenue || 'none') === opt.key ? 'var(--accent-indigo)' : 'var(--border-default)',
                                                                    background: (seriesConfig.pctOfRevenue || 'none') === opt.key ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-surface)',
                                                                    color: (seriesConfig.pctOfRevenue || 'none') === opt.key ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.15s'
                                                                }}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Filters: Tenant & Cost Center */}
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filtro de Empresa no Gráfico *</label>
                                            <select
                                                value={chartTenant}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setChartTenant(val);
                                                    if (val === 'ALL') {
                                                        const jvs = companies.find((c: any) => c.name.toUpperCase().includes('JVS TRAT'));
                                                        setAnalysisSelectedTenant(jvs ? jvs.id : (companies[0]?.id || ''));
                                                    } else {
                                                        setAnalysisSelectedTenant(val);
                                                    }
                                                }}
                                                style={{ width: '100%', height: '38px', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border-default)', borderRadius: '8px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                            >
                                                <option value="ALL">Grupo JVS</option>
                                                {companies.map((c: any) => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Centro de Custo</label>
                                            <select
                                                value={chartCC}
                                                onChange={(e) => setChartCC(e.target.value)}
                                                style={{ width: '100%', height: '38px', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border-default)', borderRadius: '8px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                            >
                                                <option value="ALL">Todos Centros de Custo</option>
                                                {costCenters.map((cc: any) => (
                                                    <option key={cc.id} value={cc.nome}>{cc.nome}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Option switches checkboxes */}
                                    {chartType !== 'MIXED' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={chartOnlyRealized}
                                                    onChange={(e) => setChartOnlyRealized(e.target.checked)}
                                                    style={{ accentColor: 'var(--accent-indigo)', cursor: 'pointer' }}
                                                />
                                                Somente Realizado (oculta o Orçado/Meta)
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={chartShowAtingido}
                                                    onChange={(e) => setChartShowAtingido(e.target.checked)}
                                                    style={{ accentColor: 'var(--accent-indigo)', cursor: 'pointer' }}
                                                />
                                                Adicionar Linha de Atingido
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={chartPctOfRevenue}
                                                    onChange={(e) => setChartPctOfRevenue(e.target.checked)}
                                                    style={{ accentColor: 'var(--accent-indigo)', cursor: 'pointer' }}
                                                />
                                                Percentual sobre Receita (calculado sobre Receita Líquida)
                                            </label>
                                        </div>
                                    )}

                                    {/* Custom Chart Color Picker */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cor Personalizada do Gráfico</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-elevated)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
                                            {/* Preset colors */}
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1, minWidth: '150px' }}>
                                                {[
                                                    { name: 'Indigo', value: '#6366f1' },
                                                    { name: 'Azul', value: '#3b82f6' },
                                                    { name: 'Esmeralda', value: '#10b981' },
                                                    { name: 'Âmbar', value: '#f59e0b' },
                                                    { name: 'Rosa', value: '#f43f5e' },
                                                    { name: 'Violeta', value: '#8b5cf6' },
                                                    { name: 'Menta', value: '#14b8a6' }
                                                ].map(preset => (
                                                    <button
                                                        key={preset.value}
                                                        type="button"
                                                        title={preset.name}
                                                        onClick={() => setChartColor(preset.value)}
                                                        style={{
                                                            width: '24px',
                                                            height: '24px',
                                                            borderRadius: '50%',
                                                            backgroundColor: preset.value,
                                                            border: chartColor === preset.value ? '2px solid var(--text-primary)' : '1.5px solid var(--border-default)',
                                                            cursor: 'pointer',
                                                            transform: chartColor === preset.value ? 'scale(1.15)' : 'scale(1)',
                                                            transition: 'transform 0.15s, border 0.15s',
                                                            boxShadow: chartColor === preset.value ? '0 0 8px ' + preset.value : 'none'
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                            
                                            {/* Custom color picker */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '0.75rem' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Personalizada:</span>
                                                <div style={{ position: 'relative', width: '28px', height: '28px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-default)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <input
                                                        type="color"
                                                        value={chartColor}
                                                        onChange={(e) => setChartColor(e.target.value)}
                                                        style={{
                                                            position: 'absolute',
                                                            opacity: 0,
                                                            width: '100%',
                                                            height: '100%',
                                                            cursor: 'pointer'
                                                        }}
                                                    />
                                                    <div style={{ width: '100%', height: '100%', backgroundColor: chartColor }} />
                                                </div>
                                                <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{chartColor.toUpperCase()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Historical Analysis Textarea */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Análise e Histórico Relacionado</label>
                                        <textarea
                                            value={chartAnalysisText}
                                            onChange={(e) => setChartAnalysisText(e.target.value)}
                                            placeholder="Registre aqui observações históricas ou análises qualitativas desse gráfico..."
                                            style={{ height: '90px', padding: '0.6rem', fontSize: '0.85rem', border: '1px solid var(--border-default)', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                                        />
                                    </div>

                                    {/* Form actions */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingChart(false)}
                                            style={{ padding: '0.5rem 1.25rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={saveDetailedAnalysis}
                                            disabled={savingChart}
                                            style={{ padding: '0.5rem 1.5rem', background: 'var(--gradient-brand)', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-button)' }}
                                        >
                                            {savingChart ? 'Salvando...' : 'Salvar Gráfico'}
                                        </button>
                                    </div>
                                </div>

                                {/* Preview column */}
                                <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-elevated)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-default)', alignSelf: 'stretch', justifyContent: 'center' }}>
                                    <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                                        <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            👁️ Pré-visualização Real-Time
                                        </h4>
                                    </div>

                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '260px' }}>
                                        {loadingPreviewData ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ border: '3px solid var(--border-default)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 1s linear infinite' }} />
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Carregando dados...</span>
                                            </div>
                                        ) : !chartCategory ? (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                                                Selecione uma conta para ver o gráfico.
                                            </div>
                                        ) : (
            <div style={{ width: '100%' }}>
                                                {renderDetailedChart(chartType, chartPreviewData, chartOnlyRealized, chartShowAtingido, chartPctOfRevenue, activeMonthNumber, chartColor, seriesConfig, selectedYear)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}


            </div>
        </div>
    );
}

const DetailedChartCard = ({ chart, onEdit, onDelete, mainMonth, year, viewMode, categories, companies }: { chart: any, onEdit: (c: any) => void, onDelete: (id: string) => void, mainMonth: number, year: number, viewMode: 'caixa' | 'competencia', categories: any[], companies: any[] }) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/kpi/detailed-chart-data?categoryId=${chart.categoryId}&filterTenantId=${chart.filterTenantId}&filterCCId=${chart.filterCCId || 'ALL'}&year=${year}&viewMode=${viewMode}`);
                const json = await res.json();
                if (json.success && active) {
                    setData(json.data || []);
                }
            } catch (err) {
                console.error(err);
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => { active = false; };
    }, [chart.categoryId, chart.filterTenantId, chart.filterCCId, year, viewMode]);

    const getChartCategoryLabel = (categoriesStr: string) => {
        if (!categoriesStr) return 'Sem contas';
        const selectedIds = categoriesStr.split(',').map(x => x.trim()).filter(Boolean);
        const dreLabels: Record<string, string> = {
            vRev: 'Receita Bruta',
            vTaxes: 'Deduções / Impostos',
            vRecLiq: 'Receita Líquida',
            vCosts: 'Custos Operacionais',
            vGrossMarg: 'Margem Bruta',
            vOpExp: 'Despesas Operacionais',
            vContribMarg: 'Margem de Contribuição',
            vAdminExp: 'Despesas Administrativas',
            vEbitda: 'EBITDA',
            vFin: 'Despesas Financeiras',
            vNetProfit: 'Lucro Líquido'
        };
        
        const labels = selectedIds.map(id => {
            if (dreLabels[id]) return dreLabels[id];
            const found = categories.find((cat: any) => cat.id === id);
            return found ? found.name : id;
        });

        return labels.join(' + ');
    };

    const chartTypeNameMap: Record<string, string> = {
        VERTICAL_BAR: 'Barras Vertical',
        HORIZONTAL_BAR: 'Barras Horizontal',
        LINE: 'Linha',
        LINE_MARKERS: 'Linha com Marcadores',
        PIE: 'Pizza',
        DONUT: 'Rosca',
        GAUGE: 'Velocímetro'
    };

    const getChartTypeName = (typeStr: string) => {
        if (typeStr && typeStr.startsWith('{')) {
            return 'Gráfico Combinado (Eixo Duplo)';
        }
        return chartTypeNameMap[typeStr] || typeStr;
    };

    const getChartHeaderTitle = (chart: any) => {
        if (chart.chartType && chart.chartType.startsWith('{')) {
            try {
                const parsed = JSON.parse(chart.chartType);
                if (parsed.indicatorName) {
                    return parsed.indicatorName;
                }
            } catch (e) {
                // ignore
            }
        }
        return getChartCategoryLabel(chart.categoryId);
    };

    return (
        <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)', width: '100%', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📊 {getChartHeaderTitle(chart)} ({getChartTypeName(chart.chartType)})
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginTop: '0.2rem' }}>
                        Filtros: {chart.filterTenantId === 'ALL' ? 'Grupo JVS' : (companies.find(c => c.id === chart.filterTenantId)?.name || 'Empresa Única')} 
                        {chart.filterCCId && chart.filterCCId !== 'ALL' ? ` | Centro de Custo: ${chart.filterCCId}` : ' | Todos Centros de Custo'}
                        {chart.pctOfRevenue ? ' | % sobre Receita' : ''}
                        {chart.onlyRealized ? ' | Somente Realizado' : ''}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button 
                        onClick={() => onEdit(chart)}
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                        ⚙️ Configurar Gráfico
                    </button>
                    <button 
                        onClick={() => onDelete(chart.id)}
                        style={{ background: '#fef2f2', border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', cursor: 'pointer' }}
                    >
                        🗑️ Excluir
                    </button>
                </div>
            </div>

            <div style={{ width: '100%' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '180px', width: '100%' }}>
                        <div style={{ border: '2.5px solid #f3f3f3', borderTop: '2.5px solid #3b82f6', borderRadius: '50%', width: '22px', height: '22px', animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : (
                    renderDetailedChart(chart.chartType, data, !!chart.onlyRealized, !!chart.showAtingido, !!chart.pctOfRevenue, mainMonth, chart.chartColor, undefined, chart.year)
                )}
            </div>

            {chart.analysisText ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--bg-elevated)', borderLeft: `3.5px solid ${chart.chartColor || 'var(--accent-indigo)'}`, borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', whiteSpace: 'pre-wrap', flex: 1 }}>
                            <strong>Análise Histórica:</strong> {chart.analysisText}
                        </span>
                        <button
                            onClick={() => onEdit(chart)}
                            style={{ background: 'none', border: 'none', color: chart.chartColor || 'var(--accent-indigo)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '2px', alignSelf: 'flex-start', flexShrink: 0 }}
                        >
                            📝 Editar Análise
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem', background: 'var(--bg-elevated)', borderRadius: '6px', border: '1px dashed var(--border-default)' }}>
                    <button
                        onClick={() => onEdit(chart)}
                        style={{ background: 'none', border: 'none', color: chart.chartColor || 'var(--accent-indigo)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                        📝 Escrever Análise Histórica
                    </button>
                </div>
            )}
        </div>
    );
};

const renderDetailedChart = (
    type: string,
    data: any[],
    onlyRealized: boolean,
    showAtingido: boolean,
    pctOfRevenue: boolean,
    mainMonth: number,
    chartColor: string = '#6366f1',
    mixedConfig?: Record<string, 'bar' | 'line_val' | 'diarias_bar' | 'diarias_line' | 'line_atingido' | 'line_revenue'>,
    year: number = 2026
) => {
    if (!data || data.length === 0) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px dashed var(--border-default)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Carregando dados do gráfico...
            </div>
        );
    }

    let chartMode = type;
    let config = mixedConfig;
    if (type && type.startsWith('{')) {
        try {
            const parsed = JSON.parse(type);
            chartMode = parsed.mode || 'MIXED';
            config = parsed.config;
        } catch (e) {
            chartMode = 'VERTICAL_BAR';
        }
    }

    const formatVal = (val: number) => {
        if (pctOfRevenue) return `${val.toFixed(1)}%`;
        if (val === 0) return 'R$ 0';
        const absVal = Math.abs(val);
        const formatted = (absVal / 1000).toFixed(1);
        return `${val < 0 ? '-' : ''}R$ ${formatted}k`;
    };

    const currentMonthIdx = new Date().getMonth();
    const hasNegative = data.some(m => m.budget < 0 || m.realized < 0);
    
    const maxVal = Math.max(...data.map((m, idx) => Math.max(
        onlyRealized ? 0 : Math.abs(pctOfRevenue ? m.pctOfRevenue : m.budget),
        (idx + 1 <= currentMonthIdx + 1) ? Math.abs(pctOfRevenue ? m.pctOfRevenue : m.realized) : 0
    ))) || 1;

    switch (chartMode) {
        case 'MIXED': {
            const yBaseline = 210;

            const getDaysInMonth = (mNum: number) => {
                return new Date(year, mNum, 0).getDate();
            };

            const getAbsValue = (val: number, mode: string, mIdx: number) => {
                if (mode === 'diarias_bar' || mode === 'diarias_line') {
                    const days = getDaysInMonth(mIdx + 1);
                    return val / days;
                }
                return val;
            };

            const isDailyMode = (mode: string) => {
                return mode === 'diarias_bar' || mode === 'diarias_line';
            };

            const formatAbs = (val: number, isDaily: boolean = false) => {
                if (val === 0) return 'R$ 0';
                const absVal = Math.abs(val);
                let formatted = '';
                if (absVal < 1000) {
                    formatted = absVal.toFixed(0);
                } else {
                    formatted = (absVal / 1000).toFixed(1) + 'k';
                }
                return `${val < 0 ? '-' : ''}R$ ${formatted}${isDaily ? '/d' : ''}`;
            };

            const bMode = config?.budget || 'bar';
            const rMode = config?.realized || 'bar';
            const atMode = config?.atingido || 'none';
            const pctMode = config?.pctOfRevenue || 'none';

            const hasDailyActive = isDailyMode(bMode) || isDailyMode(rMode);

            let maxAbs = 1;
            data.forEach((m, idx) => {
                if (bMode !== 'none') {
                    const bVal = getAbsValue(m.budget, bMode, idx);
                    maxAbs = Math.max(maxAbs, Math.abs(bVal));
                }
                if (rMode !== 'none' && idx + 1 <= currentMonthIdx + 1) {
                    const rVal = getAbsValue(m.realized, rMode, idx);
                    maxAbs = Math.max(maxAbs, Math.abs(rVal));
                }
            });
            const scaleMaxAbs = maxAbs * 1.20;

            let maxPct = 5;
            data.forEach((m, idx) => {
                if (idx + 1 <= currentMonthIdx + 1) {
                    if (atMode !== 'none') {
                        maxPct = Math.max(maxPct, Math.abs(m.atingido));
                    }
                    if (pctMode !== 'none') {
                        maxPct = Math.max(maxPct, Math.abs(m.pctOfRevenue));
                    }
                }
            });
            const scaleMaxPct = maxPct * 1.15;

            const getYAbs = (val: number) => {
                const ratio = val / scaleMaxAbs;
                return yBaseline - ratio * 170;
            };

            const getYPct = (val: number) => {
                const ratio = val / scaleMaxPct;
                return yBaseline - ratio * 170;
            };

            const startX = 80;
            const stepX = 94;
            const getX = (idx: number) => startX + idx * stepX;

            // RENDER BARS (bar, diarias_bar)
            const activeBarKeys: ('budget' | 'realized')[] = [];
            if (bMode === 'bar' || bMode === 'diarias_bar') activeBarKeys.push('budget');
            if (rMode === 'bar' || rMode === 'diarias_bar') activeBarKeys.push('realized');

            const renderedBars = data.map((m, monthIdx) => {
                const xCenter = getX(monthIdx);
                const numBars = activeBarKeys.length;
                if (numBars === 0) return null;

                const groupWidth = 76;
                const barWidth = Math.max(16, (groupWidth / numBars) - 4);
                const startBarX = xCenter - (groupWidth / 2);

                return activeBarKeys.map((key, keyIdx) => {
                    const mode = key === 'budget' ? bMode : rMode;
                    const val = key === 'budget' ? m.budget : m.realized;
                    const valScaled = getAbsValue(val, mode, monthIdx);

                    const barX = startBarX + keyIdx * (barWidth + 4);
                    const yVal = getYAbs(valScaled);
                    const hVal = Math.max(2, yBaseline - yVal);

                    if (key === 'budget') {
                        return (
                            <rect 
                                key={`${monthIdx}-budget`}
                                x={barX} 
                                y={yVal} 
                                width={barWidth} 
                                height={hVal} 
                                fill="none" 
                                stroke="var(--text-muted)" 
                                strokeWidth="1" 
                                strokeDasharray="2 2" 
                                rx="2"
                            />
                        );
                    } else {
                        // realized
                        return (
                            <g key={`${monthIdx}-realized`}>
                                <rect 
                                    x={barX} 
                                    y={yVal} 
                                    width={barWidth} 
                                    height={hVal} 
                                    fill={chartColor} 
                                    rx="2"
                                />
                                <text 
                                    x={barX + barWidth / 2} 
                                    y={yVal - 4} 
                                    textAnchor="middle" 
                                    fill="var(--text-secondary)" 
                                    fontSize="7px" 
                                    fontWeight="700"
                                >
                                    {formatAbs(valScaled, isDailyMode(rMode))}
                                </text>
                            </g>
                        );
                    }
                });
            });

            // RENDER LEFT AXIS LINES (line_val, diarias_line)
            const leftLines: JSX.Element[] = [];

            if (bMode === 'line_val' || bMode === 'diarias_line') {
                const points: { x: number; y: number; val: number }[] = [];
                data.forEach((m, monthIdx) => {
                    const valScaled = getAbsValue(m.budget, bMode, monthIdx);
                    points.push({
                        x: getX(monthIdx),
                        y: getYAbs(valScaled),
                        val: valScaled
                    });
                });
                
                let pathD = `M ${points[0].x} ${points[0].y}`;
                for (let i = 1; i < points.length; i++) {
                    pathD += ` L ${points[i].x} ${points[i].y}`;
                }

                leftLines.push(
                    <g key="budget-line">
                        <path 
                            d={pathD} 
                            fill="none" 
                            stroke="var(--text-muted)" 
                            strokeWidth="2" 
                            strokeDasharray="3 3"
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                        />
                        {points.map((p, idx) => (
                            <g key={idx}>
                                <circle 
                                    cx={p.x} 
                                    cy={p.y} 
                                    r="3.5" 
                                    fill="var(--text-muted)" 
                                    stroke="var(--bg-surface)" 
                                    strokeWidth="1" 
                                />
                            </g>
                        ))}
                    </g>
                );
            }

            if (rMode === 'line_val' || rMode === 'diarias_line') {
                const points: { x: number; y: number; val: number }[] = [];
                data.forEach((m, monthIdx) => {
                    if (monthIdx + 1 <= currentMonthIdx + 1) {
                        const valScaled = getAbsValue(m.realized, rMode, monthIdx);
                        points.push({
                            x: getX(monthIdx),
                            y: getYAbs(valScaled),
                            val: valScaled
                        });
                    }
                });

                if (points.length > 0) {
                    let pathD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                    }

                    leftLines.push(
                        <g key="realized-line">
                            <path 
                                d={pathD} 
                                fill="none" 
                                stroke={chartColor} 
                                strokeWidth="2.5" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                            />
                            {points.map((p, idx) => (
                                <g key={idx}>
                                    <circle 
                                        cx={p.x} 
                                        cy={p.y} 
                                        r="4.5" 
                                        fill={chartColor} 
                                        stroke="var(--bg-surface)" 
                                        strokeWidth="1.5" 
                                    />
                                    <text 
                                        x={p.x} 
                                        y={p.y - 7} 
                                        textAnchor="middle" 
                                        fill={chartColor} 
                                        fontSize="7.5px" 
                                        fontWeight="800"
                                    >
                                        {formatAbs(p.val, isDailyMode(rMode))}
                                    </text>
                                </g>
                            ))}
                        </g>
                    );
                }
            }

            // RENDER RIGHT AXIS LINES (% lines)
            const rightLines: JSX.Element[] = [];

            if (atMode === 'line_atingido') {
                const points: { x: number; y: number; val: number }[] = [];
                data.forEach((m, monthIdx) => {
                    if (monthIdx + 1 <= currentMonthIdx + 1) {
                        points.push({
                            x: getX(monthIdx),
                            y: getYPct(m.atingido),
                            val: m.atingido
                        });
                    }
                });

                if (points.length > 0) {
                    let pathD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                    }

                    const lineColor = '#10b981';

                    rightLines.push(
                        <g key="atingido-line">
                            <path 
                                d={pathD} 
                                fill="none" 
                                stroke={lineColor} 
                                strokeWidth="2.5" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                            />
                            {points.map((p, idx) => (
                                <g key={idx}>
                                    <circle 
                                        cx={p.x} 
                                        cy={p.y} 
                                        r="4.5" 
                                        fill={lineColor} 
                                        stroke="var(--bg-surface)" 
                                        strokeWidth="1.5" 
                                    />
                                    <text 
                                        x={p.x} 
                                        y={p.y - 7} 
                                        textAnchor="middle" 
                                        fill={lineColor} 
                                        fontSize="7.5px" 
                                        fontWeight="800"
                                    >
                                        {p.val.toFixed(1)}%
                                    </text>
                                </g>
                            ))}
                        </g>
                    );
                }
            }

            if (pctMode === 'line_revenue') {
                const points: { x: number; y: number; val: number }[] = [];
                data.forEach((m, monthIdx) => {
                    if (monthIdx + 1 <= currentMonthIdx + 1) {
                        points.push({
                            x: getX(monthIdx),
                            y: getYPct(m.pctOfRevenue),
                            val: m.pctOfRevenue
                        });
                    }
                });

                if (points.length > 0) {
                    let pathD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                    }

                    const lineColor = '#f59e0b';

                    rightLines.push(
                        <g key="revenue-line">
                            <path 
                                d={pathD} 
                                fill="none" 
                                stroke={lineColor} 
                                strokeWidth="2.5" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                            />
                            {points.map((p, idx) => (
                                <g key={idx}>
                                    <circle 
                                        cx={p.x} 
                                        cy={p.y} 
                                        r="4.5" 
                                        fill={lineColor} 
                                        stroke="var(--bg-surface)" 
                                        strokeWidth="1.5" 
                                    />
                                    <text 
                                        x={p.x} 
                                        y={p.y - 7} 
                                        textAnchor="middle" 
                                        fill={lineColor} 
                                        fontSize="7.5px" 
                                        fontWeight="800"
                                    >
                                        {p.val.toFixed(1)}%
                                    </text>
                                </g>
                            ))}
                        </g>
                    );
                }
            }

            return (
                <svg viewBox="0 0 1200 260" width="100%" height="auto" style={{ overflow: 'visible' }}>
                    {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, gridIdx) => {
                        const yGrid = yBaseline - ratio * 170;
                        return (
                            <g key={gridIdx}>
                                <line x1="80" y1={yGrid} x2="1120" y2={yGrid} stroke="var(--border-subtle)" strokeWidth="0.5" strokeDasharray="3 3" />
                                <text x="70" y={yGrid + 3} textAnchor="end" fill="var(--text-muted)" fontSize="7.5px" fontWeight="600">
                                    {formatAbs(ratio * scaleMaxAbs, hasDailyActive)}
                                </text>
                                <text x="1130" y={yGrid + 3} textAnchor="start" fill="var(--text-muted)" fontSize="7.5px" fontWeight="600">
                                    {(ratio * scaleMaxPct).toFixed(0)}%
                                </text>
                            </g>
                        );
                    })}

                    <line x1="80" y1={yBaseline} x2="1120" y2={yBaseline} stroke="var(--border-default)" strokeWidth="1" />

                    {renderedBars}
                    {leftLines}
                    {rightLines}

                    {data.map((m, idx) => (
                        <text 
                            key={idx} 
                            x={getX(idx)} 
                            y={yBaseline + 18} 
                            textAnchor="middle" 
                            fill="var(--text-secondary)" 
                            fontSize="8px" 
                            fontWeight="800"
                        >
                            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                        </text>
                    ))}
                </svg>
            );
        }

        case 'VERTICAL_BAR': {
            const yBaseline = hasNegative ? 130 : 210;
            const maxBarHeight = hasNegative ? 100 : 165;
            const scaleMaxVal = maxVal * 1.20; // 20% respiro vertical para rótulos de valores

            return (
                <svg viewBox="0 0 1200 260" width="100%" height="auto" style={{ overflow: 'visible', maxHeight: '250px' }}>
                    {hasNegative ? (
                        <>
                            <line x1="80" y1="130" x2="1140" y2="130" stroke="var(--border-strong)" strokeWidth="1.5" />
                            <line x1="80" y1="70" x2="1140" y2="70" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                            <line x1="80" y1="190" x2="1140" y2="190" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                        </>
                    ) : (
                        <>
                            <line x1="80" y1="210" x2="1140" y2="210" stroke="var(--border-default)" strokeWidth="1" />
                            <line x1="80" y1="130" x2="1140" y2="130" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                            <line x1="80" y1="50" x2="1140" y2="50" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                        </>
                    )}

                    <text x="75" y={hasNegative ? "73" : "53"} textAnchor="end" fill="var(--text-muted)" fontSize="8px" fontWeight="700">{formatVal(scaleMaxVal)}</text>
                    <text x="75" y={yBaseline + 3} textAnchor="end" fill="var(--text-muted)" fontSize="8px" fontWeight="700">{formatVal(0)}</text>
                    {hasNegative && (
                        <text x="75" y="193" textAnchor="end" fill="var(--text-muted)" fontSize="8px" fontWeight="700">{formatVal(-scaleMaxVal)}</text>
                    )}

                    {data.map((m, idx) => {
                        const valB = pctOfRevenue ? m.pctOfRevenue : m.budget;
                        const valR = (idx + 1 <= currentMonthIdx + 1) ? (pctOfRevenue ? m.pctOfRevenue : m.realized) : 0;
                        
                        const bHeight = onlyRealized ? 0 : (Math.abs(valB) / scaleMaxVal) * maxBarHeight;
                        const rHeight = (idx + 1 <= currentMonthIdx + 1) ? (Math.abs(valR) / scaleMaxVal) * maxBarHeight : 0;
                        
                        const xBase = 80 + idx * 94;
                        const barWidth = onlyRealized ? 48 : 36;
                        const xB = xBase + 6;
                        const xR = onlyRealized ? xBase + 20 : xBase + 46;

                        const isClose = !onlyRealized && (idx + 1 <= currentMonthIdx + 1) && Math.abs(bHeight - rHeight) < 14 && (valB >= 0 === valR >= 0);

                        const bLabelY = valB >= 0 ? yBaseline - bHeight - 5 : yBaseline + bHeight + 11;
                        let rLabelY = valR >= 0 ? yBaseline - rHeight - 5 : yBaseline + rHeight + 11;
                        if (isClose) {
                            rLabelY = valR >= 0 ? yBaseline - rHeight - 15 : yBaseline + rHeight + 21;
                        }

                        const xMonthText = xBase + 44;

                        return (
                            <g key={idx}>
                                {!onlyRealized && valB !== 0 && (
                                    <>
                                        <rect 
                                            x={xB} 
                                            y={valB >= 0 ? yBaseline - bHeight : yBaseline} 
                                            width={barWidth} 
                                            height={bHeight} 
                                            fill="var(--border-strong)" 
                                            rx="3" 
                                        />
                                        <text x={xB + barWidth / 2} y={bLabelY} textAnchor="middle" fill="var(--text-secondary)" fontSize="8px" fontWeight="700">{formatVal(valB)}</text>
                                    </>
                                )}

                                {idx + 1 <= currentMonthIdx + 1 && valR !== 0 && (
                                    <>
                                        <rect 
                                            x={xR} 
                                            y={valR >= 0 ? yBaseline - rHeight : yBaseline} 
                                            width={barWidth} 
                                            height={rHeight} 
                                            fill={valR >= 0 ? chartColor : 'var(--accent-red)'} 
                                            rx="3" 
                                        />
                                        <text x={xR + barWidth / 2} y={rLabelY} textAnchor="middle" fill={valR >= 0 ? '#ffffff' : '#7f1d1d'} fontSize="8px" fontWeight="700">{formatVal(valR)}</text>
                                    </>
                                )}

                                <text x={xMonthText} y="240" textAnchor="middle" fill="var(--text-muted)" fontSize="9px" fontWeight="700">
                                    {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            );
        }

        case 'HORIZONTAL_BAR': {
            const xBaseline = 120;
            const maxBarWidth = 980;
            const scaleMaxVal = maxVal * 1.15; // 15% respiro horizontal para rótulos de valores

            return (
                <svg viewBox="0 0 1200 320" width="100%" height="auto" style={{ overflow: 'visible', maxHeight: '280px' }}>
                    <line x1={xBaseline} y1="10" x2={xBaseline} y2="295" stroke="var(--border-default)" strokeWidth="1.5" />
                    <line x1={xBaseline + maxBarWidth / 2} y1="10" x2={xBaseline + maxBarWidth / 2} y2="295" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <line x1={xBaseline + maxBarWidth} y1="10" x2={xBaseline + maxBarWidth} y2="295" stroke="var(--border-default)" strokeDasharray="3 3" />

                    <text x={xBaseline} y="310" textAnchor="middle" fill="var(--text-muted)" fontSize="8px" fontWeight="700">{formatVal(0)}</text>
                    <text x={xBaseline + maxBarWidth / 2} y="310" textAnchor="middle" fill="var(--text-muted)" fontSize="8px" fontWeight="700">{formatVal(scaleMaxVal / 2)}</text>
                    <text x={xBaseline + maxBarWidth} y="310" textAnchor="middle" fill="var(--text-muted)" fontSize="8px" fontWeight="700">{formatVal(scaleMaxVal)}</text>

                    {data.map((m, idx) => {
                        const valB = pctOfRevenue ? m.pctOfRevenue : m.budget;
                        const valR = (idx + 1 <= currentMonthIdx + 1) ? (pctOfRevenue ? m.pctOfRevenue : m.realized) : 0;

                        const bWidth = onlyRealized ? 0 : (Math.abs(valB) / scaleMaxVal) * maxBarWidth;
                        const rWidth = (idx + 1 <= currentMonthIdx + 1) ? (Math.abs(valR) / scaleMaxVal) * maxBarWidth : 0;
                        
                        const yBase = 15 + idx * 24;
                        const barHeight = onlyRealized ? 16 : 10;
                        const yB = yBase;
                        const yR = onlyRealized ? yBase + 2 : yBase + 12;

                        return (
                            <g key={idx}>
                                <text x={xBaseline - 10} y={yBase + 12} textAnchor="end" fill="var(--text-secondary)" fontSize="9px" fontWeight="700">
                                    {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                                </text>

                                {!onlyRealized && valB !== 0 && (
                                    <>
                                        <rect 
                                            x={xBaseline} 
                                            y={yB} 
                                            height={barHeight} 
                                            width={bWidth} 
                                            fill="var(--border-strong)" 
                                            rx="1.5" 
                                        />
                                        <text x={xBaseline + bWidth + 5} y={yB + 7} textAnchor="start" fill="var(--text-secondary)" fontSize="7px" fontWeight="700">{formatVal(valB)}</text>
                                    </>
                                )}

                                {idx + 1 <= currentMonthIdx + 1 && valR !== 0 && (
                                    <>
                                        <rect 
                                            x={xBaseline} 
                                            y={yR} 
                                            height={barHeight} 
                                            width={rWidth} 
                                            fill={valR >= 0 ? chartColor : 'var(--accent-red)'} 
                                            rx="1.5" 
                                        />
                                        <text x={xBaseline + rWidth + 5} y={yR + 7} textAnchor="start" fill={valR >= 0 ? chartColor : '#7f1d1d'} fontSize="7px" fontWeight="700">{formatVal(valR)}</text>
                                    </>
                                )}
                            </g>
                        );
                    })}
                </svg>
            );
        }

        case 'LINE':
        case 'LINE_MARKERS': {
            const yBaseline = hasNegative ? 130 : 210;
            const maxLineHeight = hasNegative ? 100 : 165;
            const scaleMaxVal = maxVal * 1.20; // 20% respiro vertical para rótulos de valores

            let pathB = '';
            let pathR = '';
            const pointsB: { x: number, y: number, val: number }[] = [];
            const pointsR: { x: number, y: number, val: number }[] = [];

            data.forEach((m, idx) => {
                const valB = pctOfRevenue ? m.pctOfRevenue : m.budget;
                const valR = (idx + 1 <= currentMonthIdx + 1) ? (pctOfRevenue ? m.pctOfRevenue : m.realized) : 0;

                const x = 80 + idx * 94;
                const yB = yBaseline - (valB / scaleMaxVal) * maxLineHeight;
                const yR = yBaseline - (valR / scaleMaxVal) * maxLineHeight;

                if (!onlyRealized) {
                    pointsB.push({ x, y: yB, val: valB });
                    pathB += (pathB === '' ? 'M' : 'L') + ` ${x} ${yB}`;
                }

                if (idx + 1 <= currentMonthIdx + 1) {
                    pointsR.push({ x, y: yR, val: valR });
                    pathR += (pathR === '' ? 'M' : 'L') + ` ${x} ${yR}`;
                }
            });

            return (
                <svg viewBox="0 0 1200 260" width="100%" height="auto" style={{ overflow: 'visible', maxHeight: '250px' }}>
                    {hasNegative ? (
                        <>
                            <line x1="80" y1="130" x2="1140" y2="130" stroke="var(--border-strong)" strokeWidth="1.5" />
                            <line x1="80" y1="70" x2="1140" y2="70" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                            <line x1="80" y1="190" x2="1140" y2="190" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                        </>
                    ) : (
                        <>
                            <line x1="80" y1="210" x2="1140" y2="210" stroke="var(--border-default)" strokeWidth="1" />
                            <line x1="80" y1="130" x2="1140" y2="130" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                            <line x1="80" y1="50" x2="1140" y2="50" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                        </>
                    )}

                    <text x="75" y={hasNegative ? "73" : "53"} textAnchor="end" fill="var(--text-muted)" fontSize="8px" fontWeight="700">{formatVal(scaleMaxVal)}</text>
                    <text x="75" y={yBaseline + 3} textAnchor="end" fill="var(--text-muted)" fontSize="8px" fontWeight="700">{formatVal(0)}</text>
                    {hasNegative && (
                        <text x="75" y="193" textAnchor="end" fill="var(--text-muted)" fontSize="8px" fontWeight="700">{formatVal(-scaleMaxVal)}</text>
                    )}

                    {!onlyRealized && pathB && (
                        <path d={pathB} fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {pathR && (
                        <path d={pathR} fill="none" stroke={chartColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    )}

                    {type === 'LINE_MARKERS' && (
                        <>
                            {!onlyRealized && pointsB.map((p, idx) => (
                                <g key={`b-${idx}`}>
                                    <circle cx={p.x} cy={p.y} r="4" fill="var(--text-muted)" stroke="var(--bg-surface)" strokeWidth="1.5" />
                                    <text x={p.x} y={p.y - 8} textAnchor="middle" fill="var(--text-secondary)" fontSize="8px" fontWeight="700">{formatVal(p.val)}</text>
                                </g>
                            ))}

                            {pointsR.map((p, idx) => (
                                <g key={`r-${idx}`}>
                                    <circle cx={p.x} cy={p.y} r="5" fill={chartColor} stroke="var(--bg-surface)" strokeWidth="2" />
                                    <text x={p.x} y={p.y - 9} textAnchor="middle" fill={chartColor} fontSize="8px" fontWeight="800">{formatVal(p.val)}</text>
                                </g>
                            ))}
                        </>
                    )}

                    {data.map((m, idx) => (
                        <text key={idx} x={80 + idx * 94} y="240" textAnchor="middle" fill="var(--text-muted)" fontSize="9px" fontWeight="700">
                            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                        </text>
                    ))}
                </svg>
            );
        }

        case 'PIE':
        case 'DONUT': {
            const totalRealizedSum = data.reduce((acc, m, idx) => acc + (idx + 1 <= currentMonthIdx + 1 ? Math.max(0, m.realized) : 0), 0);
            
            if (totalRealizedSum <= 0) {
                return (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px dashed var(--border-default)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-red)' }}>
                        ⚠️ Sem dados positivos de Realizado para exibir em Pizza.
                    </div>
                );
            }

            const cx = 140;
            const cy = 120;
            const R = 85;
            let cumulativeAngle = 0;

            return (
                <svg viewBox="0 0 420 240" width="100%" height="220px" style={{ overflow: 'visible' }}>
                    {data.map((m, idx) => {
                        const val = idx + 1 <= currentMonthIdx + 1 ? Math.max(0, m.realized) : 0;
                        if (val === 0) return null;

                        const percentage = (val / totalRealizedSum) * 100;
                        const angle = (val / totalRealizedSum) * 360;

                        const radStart = (cumulativeAngle - 90) * Math.PI / 180;
                        const radEnd = (cumulativeAngle + angle - 90) * Math.PI / 180;

                        const x1 = cx + R * Math.cos(radStart);
                        const y1 = cy + R * Math.sin(radStart);
                        const x2 = cx + R * Math.cos(radEnd);
                        const y2 = cy + R * Math.sin(radEnd);

                        const largeArc = angle > 180 ? 1 : 0;
                        const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                        cumulativeAngle += angle;
                        const sliceOpacity = 1 - (idx * 0.065);

                        return (
                            <path 
                                key={idx} 
                                d={pathData} 
                                fill={chartColor} 
                                fillOpacity={sliceOpacity}
                                stroke="var(--bg-surface)" 
                                strokeWidth="1.5"
                                onMouseEnter={(e) => e.currentTarget.style.fillOpacity = String(Math.max(0.2, sliceOpacity - 0.15))}
                                onMouseLeave={(e) => e.currentTarget.style.fillOpacity = String(sliceOpacity)}
                                style={{ transition: 'fill-opacity 0.2s', cursor: 'pointer' }}
                            />
                        );
                    })}

                    {type === 'DONUT' && (
                        <>
                            <circle cx={cx} cy={cy} r="52" fill="var(--bg-surface)" />
                            <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="8px" fontWeight="800" textTransform="uppercase" letterSpacing="0.05em">Total Realiz.</text>
                            <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-primary)" fontSize="11px" fontWeight="800">{formatVal(totalRealizedSum)}</text>
                        </>
                    )}

                    <g transform="translate(255, 10)">
                        {data.map((m, idx) => {
                            const val = idx + 1 <= currentMonthIdx + 1 ? Math.max(0, m.realized) : 0;
                            if (val === 0) return null;
                            const percentage = (val / totalRealizedSum) * 100;
                            const yPos = idx * 16;
                            const sliceOpacity = 1 - (idx * 0.065);

                            return (
                                <g key={idx} transform={`translate(0, ${yPos})`}>
                                    <rect width="9" height="9" rx="2" fill={chartColor} fillOpacity={sliceOpacity} />
                                    <text x="14" y="8" fill="var(--text-secondary)" fontSize="8.5px" fontWeight="700">
                                        {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}: {percentage.toFixed(1)}%
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                </svg>
            );
        }

        case 'GAUGE': {
            const mData = data[mainMonth - 1] || { atingido: 100 };
            const atingido = mData.atingido;
            
            const cx = 200;
            const cy = 175;
            const R = 110;
            
            const clampedAtingido = Math.min(200, Math.max(0, atingido));
            const needleAngleDeg = 180 - clampedAtingido * 0.9;
            const rad = needleAngleDeg * Math.PI / 180;
            const needleX = cx + (R - 20) * Math.cos(rad);
            const needleY = cy + (R - 20) * Math.sin(rad);

            const polarToCartesian = (x: number, y: number, r: number, angleInDegrees: number) => {
                const angleInRadians = (angleInDegrees - 180) * Math.PI / 180.0;
                return {
                    x: x + (r * Math.cos(angleInRadians)),
                    y: y + (r * Math.sin(angleInRadians))
                };
            };

            const getArcPath = (x: number, y: number, r: number, startAngle: number, endAngle: number) => {
                const start = polarToCartesian(x, y, r, endAngle);
                const end = polarToCartesian(x, y, r, startAngle);
                const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
                return [
                    "M", start.x, start.y,
                    "A", r, r, 0, largeArcFlag, 0, end.x, end.y
                ].join(" ");
            };

            return (
                <svg viewBox="0 0 400 230" width="100%" height="220px" style={{ overflow: 'visible' }}>
                    <path d={getArcPath(cx, cy, R, 0, 63)} fill="none" stroke="var(--accent-red)" strokeWidth="22" strokeLinecap="butt" />
                    <path d={getArcPath(cx, cy, R, 63, 85.5)} fill="none" stroke="#f59e0b" strokeWidth="22" strokeLinecap="butt" />
                    <path d={getArcPath(cx, cy, R, 85.5, 99)} fill="none" stroke="var(--accent-green)" strokeWidth="22" strokeLinecap="butt" />
                    <path d={getArcPath(cx, cy, R, 99, 180)} fill="none" stroke="var(--accent-blue)" strokeWidth="22" strokeLinecap="butt" />

                    <text x={cx - R - 15} y={cy + 5} textAnchor="middle" fill="var(--text-muted)" fontSize="8.5px" fontWeight="800">0%</text>
                    <text x={cx} y={cy - R - 10} textAnchor="middle" fill="var(--text-muted)" fontSize="8.5px" fontWeight="800">100%</text>
                    <text x={cx + R + 18} y={cy + 5} textAnchor="middle" fill="var(--text-muted)" fontSize="8.5px" fontWeight="800">200%+</text>

                    <polygon points={`${cx - 2},${cy} ${needleX},${needleY} ${cx + 2},${cy}`} fill="var(--text-primary)" />
                    <circle cx={cx} cy={cy} r="8.5" fill="var(--text-primary)" stroke="var(--bg-surface)" strokeWidth="2" />

                    <text x={cx} y={cy + 30} textAnchor="middle" fill={chartColor} fontSize="13px" fontWeight="800">
                        {atingido.toFixed(1)}% Atingido
                    </text>
                    <text x={cx} y={cy + 46} textAnchor="middle" fill="var(--text-secondary)" fontSize="8.5px" fontWeight="700">
                        No mês de {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][mainMonth - 1]}
                    </text>
                </svg>
            );
        }

        default:
            return null;
    }
};




