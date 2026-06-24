'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';

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

const syntheticLabels: Record<string, string> = {
    'synth-1.1': '01.1 - Receita de Serviços',
    'synth-1.2': '01.2 - Receitas de Vendas',
    'synth-2.1': '02.1 - Tributos',
    'synth-3.1': '03.1 Salarios e Remuneração',
    'synth-3.2': '03.2 Encargos Sociais',
    'synth-3.3': '03.3 Beneficios',
    'synth-3.4': '03.4 Diárias',
    'synth-3.5': '03.5 SSMA',
    'synth-3.6': '03.6 Materiais',
    'synth-3.7': '03.7 Equipamentos',
    'synth-3.8': '03.8 Comunicação/Sistema/Licenças',
    'synth-3.9': '03.9 Custo com Veiculo',
    'synth-4.1': '04.1 Salarios e Remuneração',
    'synth-4.2': '04.2 Encargos Sociais',
    'synth-4.3': '04.3 Beneficios',
    'synth-4.4': '04.4 SSMA',
    'synth-4.5': '04.5 Viagens',
    'synth-4.6': '04.6 Custo com Veículos',
    'synth-4.7': '04.7 Cartão Corporativo',
    'synth-4.8': '04.8 Serviços Terceirizados',
    'synth-5.1': '05.1 Salario e Remuneração',
    'synth-5.2': '05.2 Encargos Sociais',
    'synth-5.3': '05.3 Beneficios',
    'synth-5.4': '05.4 SSMA',
    'synth-5.5': '05.5 Viagens',
    'synth-5.6': '05.6 Despesa com Socios',
    'synth-5.7': '05.7 Serviços Contratados',
    'synth-5.8': '05.8 Despesa Comercial/Marketing',
    'synth-5.9': '05.9 Despesa com Estrutura',
    'synth-5.10': '05.10 Despesa Copa e Cozinha',
    'synth-5.11': '05.11 Despesa com Veículos',
    'synth-5.12': '05.12 Despesa de Informatica',
    'synth-5.13': '05.13 Taxas e Despesas Legais',
    'synth-6.1': '06.1 Entradas Financeiras',
    'synth-6.2': '06.2 Saidas Financeiras',
    'synth-6.3': '06.3 Financiamento',
    'synth-6.4': '06.4 Juros/Multas',
    'synth-6.5': '06.5 Passivo Trabalhista',
    'synth-6.6': '06.6 Depreciação',
    'synth-6.7': '06.7 Cartão de Credito',
    'synth-6.8': '06.8 PDD'
};

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
    const [chartComparisonCategory, setChartComparisonCategory] = useState<string>('');
    const [chartComparisonCategorySearch, setChartComparisonCategorySearch] = useState<string>('');
    const [isChartComparisonCategoryDropdownOpen, setIsChartComparisonCategoryDropdownOpen] = useState(false);
    const [chartTenant, setChartTenant] = useState<string>('');
    const [chartCC, setChartCC] = useState<string>('ALL');
    const [chartType, setChartType] = useState<string>('VERTICAL_BAR');
    const [chartOnlyRealized, setChartOnlyRealized] = useState<boolean>(false);
    const [chartShowAtingido, setChartShowAtingido] = useState<boolean>(false);
    const [chartPctOfRevenue, setChartPctOfRevenue] = useState<boolean>(false);
    const [chartAnalysisText, setChartAnalysisText] = useState<string>('');
    const [chartColor, setChartColor] = useState<string>('#6366f1');
    const [chartComparePeriod, setChartComparePeriod] = useState<string>('none');
    const [chartDimension, setChartDimension] = useState<string>('none');
    const [chartStartMonth, setChartStartMonth] = useState<number>(0);
    const [chartEndMonth, setChartEndMonth] = useState<number>(11);

    // Preview data states
    const [chartPreviewData, setChartPreviewData] = useState<any[]>([]);

    const processedPreviewData = useMemo(() => {
        if (chartComparePeriod === 'none') return chartPreviewData;
        const compInfo = getComparisonPeriods(chartComparePeriod);
        if (!compInfo) return chartPreviewData;
        const { monthsA, monthsB, monthLabelsA, monthLabelsB } = compInfo;
        const result: any[] = [];
        const isRatio = chartCategory && chartCategory.includes('|');
        for (let i = 0; i < monthsA.length; i++) {
            const idxA = monthsA[i];
            const idxB = monthsB[i];
            const mA = chartPreviewData[idxA] || { budget: 0, realized: 0, compareBudget: 0, compareRealized: 0, pctOfRevenue: 0, pctOfRevenueBudget: 0 };
            const mB = chartPreviewData[idxB] || { budget: 0, realized: 0, compareBudget: 0, compareRealized: 0, pctOfRevenue: 0, pctOfRevenueBudget: 0 };
            
            let atA = 0;
            if (isRatio) {
                atA = mA.realized !== 0 ? ((mA.compareRealized || 0) / mA.realized) * 100 : 0;
            } else {
                if (mA.budget > 0) atA = (mA.realized / mA.budget) * 100;
                else if (mA.budget < 0) atA = (1 + (mA.budget - mA.realized) / mA.budget) * 100;
                else atA = mA.realized >= 0 ? 100 : 0;
            }

            let atB = 0;
            if (isRatio) {
                atB = mB.realized !== 0 ? ((mB.compareRealized || 0) / mB.realized) * 100 : 0;
            } else {
                if (mB.budget > 0) atB = (mB.realized / mB.budget) * 100;
                else if (mB.budget < 0) atB = (1 + (mB.budget - mB.realized) / mB.budget) * 100;
                else atB = mB.realized >= 0 ? 100 : 0;
            }

            result.push({
                month: i + 1,
                labelA: monthLabelsA[i],
                labelB: monthLabelsB[i],
                budget: mA.budget,
                realized: mA.realized,
                compareBudget: mA.compareBudget || 0,
                compareRealized: mA.compareRealized || 0,
                atingido: atA,
                pctOfRevenue: mA.pctOfRevenue || 0,
                pctOfRevenueBudget: mA.pctOfRevenueBudget || 0,

                budgetB: mB.budget,
                realizedB: mB.realized,
                compareBudgetB: mB.compareBudget || 0,
                compareRealizedB: mB.compareRealized || 0,
                atingidoB: atB,
                pctOfRevenueB: mB.pctOfRevenue || 0,
                pctOfRevenueBudgetB: mB.pctOfRevenueBudget || 0
            });
        }
        return result;
    }, [chartPreviewData, chartComparePeriod, chartCategory]);
    const [previewTooltip, setPreviewTooltip] = useState<{ x: number; y: number; title: string; items: { label: string; value: string; color?: string }[] } | null>(null);
    const [loadingPreviewData, setLoadingPreviewData] = useState(false);
    const [savingChart, setSavingChart] = useState(false);
    const [indicatorName, setIndicatorName] = useState<string>('');
    const [analysisSelectedTenant, setAnalysisSelectedTenant] = useState<string>('');
    const prevTenantRef = useRef<string>('');

    // State hooks for individual detailed analysis modal
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [analysisChart, setAnalysisChart] = useState<any | null>(null);
    const [analysisMonth, setAnalysisMonth] = useState<number>(1);
    const [analysisTenant, setAnalysisTenant] = useState<string>('');
    const [analysisId, setAnalysisId] = useState<string | null>(null);
    const [deviationReport, setDeviationReport] = useState('');
    const [analysisPerformed, setAnalysisPerformed] = useState('');
    const [analysisActions, setAnalysisActions] = useState<any[]>([]);
    const [analysisComments, setAnalysisComments] = useState<any[]>([]);
    const [newCommentUser, setNewCommentUser] = useState('Cristiano Silva');
    const [newCommentText, setNewCommentText] = useState('');
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
    const [isAnalysisSaving, setIsAnalysisSaving] = useState(false);
    const [newActionDesc, setNewActionDesc] = useState('');
    const [newActionResp, setNewActionResp] = useState('');
    const [newActionDate, setNewActionDate] = useState('');
    const [activeModalTab, setActiveModalTab] = useState<'deviation' | 'actions' | 'comments'>('deviation');


    const [seriesConfig, setSeriesConfig] = useState<Record<string, string>>({
        budget: 'bar',
        realized: 'bar',
        atingido: 'none',
        pctOfRevenue: 'none',
        showBudgetLabels: 'true',
        showRealizedLabels: 'true',
        showAtingidoLabels: 'true',
        showPctOfRevenueLabels: 'true'
    });

    const toggleChartCategory = useCallback((id: string) => {
        setChartCategory(prev => {
            const selectedIds = prev ? prev.split(',').map(x => x.trim()).filter(Boolean) : [];
            
            // Find if there are equivalent/duplicate categories in categories state
            const targetCat = categories.find((c: any) => c.id === id);
            const targetName = targetCat?.name;
            const isTenantAgnosticKey = ['vRev', 'vTaxes', 'vRecLiq', 'vCosts', 'vGrossMarg', 'vOpExp', 'vContribMarg', 'vAdminExp', 'vEbitda', 'vFin', 'vNetProfit'].includes(id) || id.startsWith('synth-');

            // Get all IDs associated with this category name in the active list
            const equivalentIds = !isTenantAgnosticKey && targetName
                ? categories.filter((c: any) => c.name === targetName).map((c: any) => c.id)
                : [id];

            const alreadyHasAny = selectedIds.some(sid => equivalentIds.includes(sid));

            if (alreadyHasAny) {
                // Remove all equivalent IDs
                return selectedIds.filter(sid => !equivalentIds.includes(sid)).join(',');
            } else {
                // Add only the toggled ID
                selectedIds.push(id);
                return selectedIds.join(',');
            }
        });
    }, [categories]);

    const getChartCategoryLabel = useCallback((categoriesStr: string): string => {
        if (!categoriesStr) return 'Selecione as contas...';
        if (categoriesStr.includes('|')) {
            const [base, compare] = categoriesStr.split('|');
            return `${getChartCategoryLabel(base)} / ${getChartCategoryLabel(compare)}`;
        }
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
            if (syntheticLabels[id]) return syntheticLabels[id];
            const found = categories.find((cat: any) => cat.id === id);
            return found ? found.name : id;
        });

        // Deduplicate labels to clean up any duplicate/equivalent database category rows
        const uniqueLabels = Array.from(new Set(labels));
        return uniqueLabels.join(' + ');
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

    useEffect(() => {
        const storedTab = localStorage.getItem('activeAnalysisTab');
        if (storedTab === 'carteira' || storedTab === 'detailed') {
            setActiveAnalysisTab(storedTab as 'carteira' | 'detailed');
        }
    }, []);

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
    const fetchChartData = useCallback(async (catId: string, tenId: string, ccId: string, dimension: string = 'none', startM: number = 0, endM: number = 11) => {
        if (!catId || !tenId) return;
        setLoadingPreviewData(true);
        try {
            const res = await fetch(`/api/kpi/detailed-chart-data?categoryId=${catId}&filterTenantId=${tenId}&filterCCId=${ccId}&year=${selectedYear}&viewMode=${selectedViewMode}&dimension=${dimension}&startMonth=${startM}&endMonth=${endM}`);
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
            const finalCatId = chartComparisonCategory ? `${chartCategory}|${chartComparisonCategory}` : chartCategory;
            fetchChartData(finalCatId, chartTenant, chartCC, chartDimension, chartStartMonth, chartEndMonth);
        }
    }, [isEditingChart, chartCategory, chartComparisonCategory, chartTenant, chartCC, chartDimension, chartStartMonth, chartEndMonth, fetchChartData]);

    // Mapear seleção de categorias se o Tenant de contexto for alterado
    useEffect(() => {
        if (prevTenantRef.current === analysisSelectedTenant) {
            return;
        }
        prevTenantRef.current = analysisSelectedTenant;

        if (!analysisSelectedTenant || !categories.length || !chartCategory) return;
        
        const currentIds = chartCategory.split(',').map(x => x.trim()).filter(Boolean);
        if (currentIds.length === 0) return;

        const isTenantAgnosticKey = (id: string) => 
            ['vRev', 'vTaxes', 'vRecLiq', 'vCosts', 'vGrossMarg', 'vOpExp', 'vContribMarg', 'vAdminExp', 'vEbitda', 'vFin', 'vNetProfit'].includes(id) ||
            id.startsWith('synth-');
        const hasCategoriesToTranslate = currentIds.some(id => !isTenantAgnosticKey(id));
        if (!hasCategoriesToTranslate) return;

        const selectedCatsInOldTenant = currentIds.map(id => {
            if (isTenantAgnosticKey(id)) return { id, isTenantAgnostic: true };
            const cat = categories.find((c: any) => c.id === id);
            return cat ? { id, name: cat.name, isTenantAgnostic: false } : null;
        }).filter(Boolean);

        const normalize = (s: string) => s.toLowerCase().trim();
        const newIds = selectedCatsInOldTenant.map(item => {
            if (item!.isTenantAgnostic) return item!.id;
            
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
                    categoryId: chartComparisonCategory ? `${chartCategory}|${chartComparisonCategory}` : chartCategory,
                    filterTenantId: chartTenant,
                    filterCCId: chartCC,
                    chartType: (chartType === 'MIXED' || categoryIdsCount > 1 || chartComparePeriod !== 'none' || ((chartType === 'PIE' || chartType === 'DONUT') && chartDimension !== 'none'))
                        ? JSON.stringify({
                            mode: chartType,
                            config: seriesConfig,
                            indicatorName,
                            comparePeriod: chartComparePeriod,
                            dimension: chartDimension,
                            startMonth: chartStartMonth,
                            endMonth: chartEndMonth
                          })
                        : chartType,
                    onlyRealized: ((chartType === 'PIE' || chartType === 'DONUT') && chartDimension !== 'none') ? true : chartOnlyRealized,
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
        setChartComparisonCategory('');
        setChartComparisonCategorySearch('');
        setChartTenant('ALL');
        setChartCC('ALL');
        setChartType('VERTICAL_BAR');
        setChartOnlyRealized(false);
        setChartShowAtingido(false);
        setChartPctOfRevenue(false);
        setChartColor('#6366f1');
        setChartComparePeriod('none');
        setChartDimension('none');
        setChartStartMonth(0);
        setChartEndMonth(11);
        setChartAnalysisText('');
        setSeriesConfig({
            budget: 'bar',
            realized: 'bar',
            atingido: 'none',
            pctOfRevenue: 'none',
            showBudgetLabels: 'true',
            showRealizedLabels: 'true',
            showAtingidoLabels: 'true',
            showPctOfRevenueLabels: 'true'
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
        const hasPipe = chart.categoryId && chart.categoryId.includes('|');
        const baseCatId = hasPipe ? chart.categoryId.split('|')[0] : chart.categoryId;
        const compareCatId = hasPipe ? chart.categoryId.split('|')[1] : '';
        setChartCategory(baseCatId);
        setChartComparisonCategory(compareCatId);
        setChartCategorySearch('');
        setChartComparisonCategorySearch('');
        setChartTenant(chart.filterTenantId);
        setChartCC(chart.filterCCId || 'ALL');
        
        let nameVal = '';
        let comparePeriodVal = 'none';
        let dimensionVal = 'none';
        let startMonthVal = 0;
        let endMonthVal = 11;
        if (chart.chartType && chart.chartType.startsWith('{')) {
            try {
                const parsed = JSON.parse(chart.chartType);
                setChartType(parsed.mode || 'MIXED');
                setSeriesConfig({
                    budget: 'bar',
                    realized: 'bar',
                    atingido: 'none',
                    pctOfRevenue: 'none',
                    showBudgetLabels: 'true',
                    showRealizedLabels: 'true',
                    showAtingidoLabels: 'true',
                    showPctOfRevenueLabels: 'true',
                    ...(parsed.config || {})
                });
                nameVal = parsed.indicatorName || '';
                comparePeriodVal = parsed.comparePeriod || 'none';
                dimensionVal = parsed.dimension || 'none';
                startMonthVal = parsed.startMonth !== undefined ? parsed.startMonth : 0;
                endMonthVal = parsed.endMonth !== undefined ? parsed.endMonth : 11;
            } catch (e) {
                setChartType(chart.chartType);
                setSeriesConfig({
                    budget: 'bar',
                    realized: 'bar',
                    atingido: 'none',
                    pctOfRevenue: 'none',
                    showBudgetLabels: 'true',
                    showRealizedLabels: 'true',
                    showAtingidoLabels: 'true',
                    showPctOfRevenueLabels: 'true'
                });
            }
        } else {
            setChartType(chart.chartType || 'VERTICAL_BAR');
            setSeriesConfig({
                budget: 'bar',
                realized: 'bar',
                atingido: 'none',
                pctOfRevenue: 'none',
                showBudgetLabels: 'true',
                showRealizedLabels: 'true',
                showAtingidoLabels: 'true',
                showPctOfRevenueLabels: 'true'
            });
        }
        setIndicatorName(nameVal);
        setChartComparePeriod(comparePeriodVal);
        setChartDimension(dimensionVal);
        setChartStartMonth(startMonthVal);
        setChartEndMonth(endMonthVal);

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

    const handleOpenAnalysis = (chart: any) => {
        setAnalysisChart(chart);
        const defaultTenant = chart.filterTenantId === 'ALL' ? (companies?.[0]?.id || '') : chart.filterTenantId;
        setAnalysisTenant(defaultTenant);
        setAnalysisMonth(activeMonthNumber);
        setDeviationReport('');
        setAnalysisPerformed('');
        setAnalysisActions([]);
        setAnalysisComments([]);
        setNewCommentText('');
        setActiveModalTab('deviation');
        setIsAnalysisModalOpen(true);
    };

    useEffect(() => {
        if (isAnalysisModalOpen && analysisTenant && analysisChart?.categoryId && analysisMonth) {
            const loadAnalysis = async () => {
                setIsAnalysisLoading(true);
                try {
                    const res = await fetch(`/api/kpi/analysis?tenantId=${analysisTenant}&categoryId=${analysisChart.categoryId}&month=${analysisMonth}&year=${selectedYear}`);
                    const result = await res.json();
                    if (result.success && result.data) {
                        const data = result.data;
                        setAnalysisId(data.id);
                        setDeviationReport(data.deviationReport || '');
                        setAnalysisPerformed(data.analysisPerformed || '');
                        setAnalysisActions(data.actions || []);
                        setAnalysisComments(data.comments || []);
                    } else {
                        setAnalysisId(null);
                        setDeviationReport('');
                        setAnalysisPerformed('');
                        setAnalysisActions([]);
                        setAnalysisComments([]);
                    }
                } catch (e) {
                    console.error("Error loading analysis data:", e);
                } finally {
                    setIsAnalysisLoading(false);
                }
            };
            loadAnalysis();
        }
    }, [isAnalysisModalOpen, analysisTenant, analysisChart?.categoryId, analysisMonth, selectedYear]);

    const saveAnalysisData = async () => {
        if (!analysisTenant || !analysisChart || !analysisMonth) {
            alert('Parâmetros obrigatórios ausentes.');
            return;
        }
        setIsAnalysisSaving(true);
        try {
            const res = await fetch('/api/kpi/analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: analysisTenant,
                    categoryId: analysisChart.categoryId,
                    month: analysisMonth,
                    year: selectedYear,
                    deviationReport,
                    analysisPerformed,
                    actions: analysisActions
                })
            });
            const result = await res.json();
            if (result.success) {
                alert('Análise salva com sucesso!');
                setIsAnalysisModalOpen(false);
                fetchDetailedAnalyses();
            } else {
                alert('Erro ao salvar análise: ' + result.error);
            }
        } catch (e) {
            console.error("Error saving analysis:", e);
            alert('Erro de conexão ao salvar.');
        } finally {
            setIsAnalysisSaving(false);
        }
    };

    const postComment = async () => {
        if (!newCommentText.trim() || !analysisChart || !analysisTenant) return;
        try {
            const res = await fetch('/api/kpi/analysis/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: analysisTenant,
                    categoryId: analysisChart.categoryId,
                    month: analysisMonth,
                    year: selectedYear,
                    userName: newCommentUser || 'Cristiano Silva',
                    content: newCommentText
                })
            });
            const result = await res.json();
            if (result.success) {
                setAnalysisComments(prev => [...prev, result.data]);
                setNewCommentText('');
            } else {
                alert('Erro ao enviar comentário: ' + result.error);
            }
        } catch (e) {
            console.error(e);
        }
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
                        onClick={() => {
                            setActiveAnalysisTab('carteira');
                            localStorage.setItem('activeAnalysisTab', 'carteira');
                        }}
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
                        onClick={() => {
                            setActiveAnalysisTab('detailed');
                            localStorage.setItem('activeAnalysisTab', 'detailed');
                        }}
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
                                                onOpenAnalysis={handleOpenAnalysis}
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

                                    {/* Comparação de Períodos */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comparação de Períodos (Opcional)</label>
                                        <select
                                            value={chartComparePeriod}
                                            onChange={(e) => setChartComparePeriod(e.target.value)}
                                            style={{
                                                padding: '0.5rem 0.85rem',
                                                height: '38px',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                border: '1px solid var(--border-default)',
                                                borderRadius: '8px',
                                                background: 'var(--bg-surface)',
                                                outline: 'none',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="none">Nenhuma (Evolução Anual Padrão)</option>
                                            <option value="tri1_vs_tri2">1º Trimestre (Jan-Mar) vs 2º Trimestre (Abr-Jun)</option>
                                            <option value="tri1_vs_tri3">1º Trimestre (Jan-Mar) vs 3º Trimestre (Jul-Set)</option>
                                            <option value="tri1_vs_tri4">1º Trimestre (Jan-Mar) vs 4º Trimestre (Out-Dez)</option>
                                            <option value="tri2_vs_tri3">2º Trimestre (Abr-Jun) vs 3º Trimestre (Jul-Set)</option>
                                            <option value="tri2_vs_tri4">2º Trimestre (Abr-Jun) vs 4º Trimestre (Out-Dez)</option>
                                            <option value="tri3_vs_tri4">3º Trimestre (Jul-Set) vs 4º Trimestre (Out-Dez)</option>
                                            <option value="semestre1_vs_semestre2">1º Semestre (Jan-Jun) vs 2º Semestre (Jul-Dez)</option>
                                        </select>
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
                                                        {/* Synthetic Parents Options */}
                                                        {Object.entries(syntheticLabels)
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
                                                                    <span>📁 {name} (Consolidado)</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Categories list */}
                                                        {(() => {
                                                             const filtered = categories
                                                                 .filter(cat => {
                                                                     const activeTenant = analysisSelectedTenant || (companies.length > 0 ? companies[0].id : '');
                                                                     return cat.tenantId === activeTenant;
                                                                 })
                                                                 .filter(cat => !chartCategorySearch || cat.name.toLowerCase().includes(chartCategorySearch.toLowerCase()));

                                                             const uniqueMap = new Map<string, any>();
                                                             filtered.forEach(cat => {
                                                                 if (!uniqueMap.has(cat.name)) {
                                                                     uniqueMap.set(cat.name, cat);
                                                                 }
                                                             });

                                                             const uniqueCategories = Array.from(uniqueMap.values())
                                                                 .sort((a, b) => a.name.localeCompare(b.name));

                                                             return uniqueCategories.map((cat: any) => {
                                                                 // Check if any of the equivalent duplicate category IDs are selected
                                                                 const equivalentIds = categories
                                                                     .filter((c: any) => c.name === cat.name)
                                                                     .map((c: any) => c.id);
                                                                 
                                                                 const isSelected = chartCategory
                                                                     .split(',')
                                                                     .map(x => x.trim())
                                                                     .filter(Boolean)
                                                                     .some(sid => equivalentIds.includes(sid));

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
                                                             });
                                                         })()}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Comparação Category dropdown */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', position: 'relative', marginTop: '0.5rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Conta de Comparação (Opcional - para calcular razão %)
                                        </label>
                                        <div
                                            onClick={() => {
                                                setIsChartComparisonCategoryDropdownOpen(!isChartComparisonCategoryDropdownOpen);
                                                setChartComparisonCategorySearch('');
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
                                                color: chartComparisonCategory ? 'var(--text-primary)' : 'var(--text-muted)'
                                            }}
                                        >
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {chartComparisonCategory ? getChartCategoryLabel(chartComparisonCategory) : 'Selecione uma conta para comparar (ex: Salário)...'}
                                            </span>
                                            <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>▼</span>
                                        </div>

                                        {isChartComparisonCategoryDropdownOpen && (
                                            <>
                                                <div 
                                                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }} 
                                                    onClick={() => setIsChartComparisonCategoryDropdownOpen(false)} 
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
                                                            value={chartComparisonCategorySearch}
                                                            onChange={(e) => setChartComparisonCategorySearch(e.target.value)}
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
                                                        {/* Option to clear selection */}
                                                        <div
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setChartComparisonCategory('');
                                                                setIsChartComparisonCategoryDropdownOpen(false);
                                                            }}
                                                            style={{ 
                                                                padding: '0.45rem 0.75rem', 
                                                                cursor: 'pointer', 
                                                                fontSize: '0.8rem', 
                                                                fontWeight: 700,
                                                                color: 'var(--accent-red)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.5rem',
                                                                background: 'rgba(239, 68, 68, 0.05)'
                                                            }}
                                                        >
                                                            <span>❌ Sem comparação (limpar)</span>
                                                        </div>

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
                                                        .filter(([_, name]) => !chartComparisonCategorySearch || name.toLowerCase().includes(chartComparisonCategorySearch.toLowerCase()))
                                                        .map(([id, name]) => {
                                                            const isSelected = chartComparisonCategory === id;
                                                            return (
                                                                <div
                                                                    key={id}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setChartComparisonCategory(id);
                                                                        setIsChartComparisonCategoryDropdownOpen(false);
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
                                                                    <span>⭐ {name}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Synthetic Parents Options */}
                                                        {Object.entries(syntheticLabels)
                                                        .filter(([_, name]) => !chartComparisonCategorySearch || name.toLowerCase().includes(chartComparisonCategorySearch.toLowerCase()))
                                                        .map(([id, name]) => {
                                                            const isSelected = chartComparisonCategory === id;
                                                            return (
                                                                <div
                                                                    key={id}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setChartComparisonCategory(id);
                                                                        setIsChartComparisonCategoryDropdownOpen(false);
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
                                                                    <span>📁 {name} (Consolidado)</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Categories list */}
                                                        {(() => {
                                                             const filtered = categories
                                                                 .filter(cat => {
                                                                     const activeTenant = analysisSelectedTenant || (companies.length > 0 ? companies[0].id : '');
                                                                     return cat.tenantId === activeTenant;
                                                                 })
                                                                 .filter(cat => !chartComparisonCategorySearch || cat.name.toLowerCase().includes(chartComparisonCategorySearch.toLowerCase()));

                                                             const uniqueMap = new Map<string, any>();
                                                             filtered.forEach(cat => {
                                                                 if (!uniqueMap.has(cat.name)) {
                                                                     uniqueMap.set(cat.name, cat);
                                                                 }
                                                             });

                                                             const uniqueCategories = Array.from(uniqueMap.values())
                                                                 .sort((a, b) => a.name.localeCompare(b.name));

                                                             return uniqueCategories.map((cat: any) => {
                                                                 const isSelected = chartComparisonCategory === cat.id;

                                                                 return (
                                                                     <div
                                                                         key={cat.id}
                                                                         onClick={(e) => {
                                                                             e.stopPropagation();
                                                                             setChartComparisonCategory(cat.id);
                                                                             setIsChartComparisonCategoryDropdownOpen(false);
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
                                                                         <span>{cat.name}</span>
                                                                     </div>
                                                                 );
                                                             });
                                                         })()}
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
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                            Orçado (Meta)
                                                        </span>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={(seriesConfig.showBudgetLabels || 'true') !== 'false'} 
                                                                onChange={(e) => setSeriesConfig(cfg => ({ ...cfg, showBudgetLabels: e.target.checked ? 'true' : 'false' }))}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Valores no gráfico
                                                        </label>
                                                    </div>
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
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                            Realizado
                                                        </span>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={(seriesConfig.showRealizedLabels || 'true') !== 'false'} 
                                                                onChange={(e) => setSeriesConfig(cfg => ({ ...cfg, showRealizedLabels: e.target.checked ? 'true' : 'false' }))}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Valores no gráfico
                                                        </label>
                                                    </div>
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
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                            {chartComparisonCategory ? 'Razão de Comparação (% comp/base)' : 'Atingido (% do Orçado)'}
                                                        </span>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={(seriesConfig.showAtingidoLabels || 'true') !== 'false'} 
                                                                onChange={(e) => setSeriesConfig(cfg => ({ ...cfg, showAtingidoLabels: e.target.checked ? 'true' : 'false' }))}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Valores no gráfico
                                                        </label>
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'flex-end', maxWidth: '70%' }}>
                                                        {[
                                                            { key: 'line_atingido', label: chartComparisonCategory ? '📈 Linha (% Razão)' : '📈 Linha (% At.)' },
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
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                            Percentual sobre Receita
                                                        </span>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={(seriesConfig.showPctOfRevenueLabels || 'true') !== 'false'} 
                                                                onChange={(e) => setSeriesConfig(cfg => ({ ...cfg, showPctOfRevenueLabels: e.target.checked ? 'true' : 'false' }))}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Valores no gráfico
                                                        </label>
                                                    </div>
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
                                            {(!((chartType === 'PIE' || chartType === 'DONUT') && chartDimension !== 'none')) && (
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={chartOnlyRealized}
                                                        onChange={(e) => setChartOnlyRealized(e.target.checked)}
                                                        style={{ accentColor: 'var(--accent-indigo)', cursor: 'pointer' }}
                                                    />
                                                    Somente Realizado (oculta o Orçado/Meta)
                                                </label>
                                            )}
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

                                    {/* Pizza / Rosca Dynamic Dimensions UI */}
                                    {(chartType === 'PIE' || chartType === 'DONUT') && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Segunda Dimensão</label>
                                                <select
                                                    value={chartDimension}
                                                    onChange={(e) => {
                                                        const d = e.target.value;
                                                        setChartDimension(d);
                                                        if (d !== 'none') {
                                                            setChartOnlyRealized(true);
                                                        }
                                                    }}
                                                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border-default)', borderRadius: '8px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                                >
                                                    <option value="none">Nenhuma (Evolução Mensal)</option>
                                                    <option value="empresa">Empresa</option>
                                                    <option value="cc">Centro de Custo</option>
                                                </select>
                                            </div>

                                            {chartDimension !== 'none' && (
                                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                    <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mês Inicial</label>
                                                        <select
                                                            value={chartStartMonth}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value, 10);
                                                                setChartStartMonth(val);
                                                                if (chartEndMonth < val) {
                                                                    setChartEndMonth(val);
                                                                }
                                                            }}
                                                            style={{ width: '100%', height: '38px', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border-default)', borderRadius: '8px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                                        >
                                                            {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((mName, mIdx) => (
                                                                <option key={mIdx} value={mIdx}>{mName}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mês Final</label>
                                                        <select
                                                            value={chartEndMonth}
                                                            onChange={(e) => setChartEndMonth(parseInt(e.target.value, 10))}
                                                            style={{ width: '100%', height: '38px', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border-default)', borderRadius: '8px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                                        >
                                                            {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((mName, mIdx) => (
                                                                <option key={mIdx} value={mIdx} disabled={mIdx < chartStartMonth}>{mName}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
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
                                                {(() => {
                                                    const resolvedPreviewType = ((chartType === 'PIE' || chartType === 'DONUT') && chartDimension !== 'none')
                                                        ? JSON.stringify({ mode: chartType, dimension: chartDimension, startMonth: chartStartMonth, endMonth: chartEndMonth })
                                                        : chartType;
                                                    return renderDetailedChart(
                                                        resolvedPreviewType, 
                                                        processedPreviewData, 
                                                        ((chartType === 'PIE' || chartType === 'DONUT') && chartDimension !== 'none') ? true : chartOnlyRealized, 
                                                        chartShowAtingido, 
                                                        chartPctOfRevenue, 
                                                        activeMonthNumber, 
                                                        chartColor, 
                                                        seriesConfig, 
                                                        selectedYear, 
                                                        setPreviewTooltip,
                                                        {},
                                                        chartCategory ? getChartCategoryLabel(chartCategory) : undefined,
                                                        chartComparisonCategory ? getChartCategoryLabel(chartComparisonCategory) : undefined
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

            {/* Preview Tooltip Rendering */}
            {previewTooltip && previewTooltip.items.length > 0 && (() => {
                const tipW = 180;
                const tipH = 32 + previewTooltip.items.length * 22;
                const safeLeft = Math.min(previewTooltip.x + 15, (typeof window !== 'undefined' ? window.innerWidth : 1200) - tipW - 10);
                let safeTop = previewTooltip.y + 15;
                if (previewTooltip.y + tipH + 20 > (typeof window !== 'undefined' ? window.innerHeight : 800)) {
                    safeTop = previewTooltip.y - tipH - 10; // flip above cursor
                    if (safeTop < 10) safeTop = 10;
                }
                return (
                    <div style={{
                        position: 'fixed',
                        left: safeLeft,
                        top: safeTop,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '0.55rem 0.75rem',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        zIndex: 99999,
                        pointerEvents: 'none',
                        color: '#f8fafc',
                        fontSize: '0.75rem',
                        minWidth: '150px',
                        fontFamily: 'inherit'
                    }}>
                        <div style={{ fontWeight: 800, borderBottom: '1px solid rgba(255, 255, 255, 0.15)', paddingBottom: '4px', marginBottom: '4px', color: '#cbd5e1' }}>
                            {previewTooltip.title}
                        </div>
                        {previewTooltip.items.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.25rem', marginTop: '3px', alignItems: 'center' }}>
                                <span style={{ color: 'rgba(241, 245, 249, 0.8)', fontWeight: 500 }}>{item.label}</span>
                                <span style={{ fontWeight: 800, color: item.color || '#fff' }}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                );
            })()}


            {/* Modal de Análise Detalhada / Justificativa de Desvio */}
            {isAnalysisModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '1.5rem',
                }}>
                    <div style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '900px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        overflow: 'hidden',
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '1.5rem',
                            borderBottom: '1px solid var(--border-subtle)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'var(--bg-surface)',
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span>📝 Analisar Desvio:</span>
                                    <span style={{ color: 'var(--accent-blue)' }}>{analysisChart ? getChartHeaderTitle(analysisChart) : ''}</span>
                                </h3>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    Justificativas, plano de ação e comentários sobre o indicador.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsAnalysisModalOpen(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    lineHeight: 1,
                                }}
                            >
                                &times;
                            </button>
                        </div>

                        {/* Controls Bar */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            background: 'var(--bg-elevated)',
                            borderBottom: '1px solid var(--border-subtle)',
                            display: 'flex',
                            gap: '1rem',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Empresa</label>
                                <select
                                    value={analysisTenant}
                                    onChange={(e) => setAnalysisTenant(e.target.value)}
                                    disabled={analysisChart?.filterTenantId !== 'ALL'}
                                    style={{
                                        padding: '0.4rem 0.75rem',
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        color: 'var(--text-primary)',
                                        fontWeight: 600,
                                        minWidth: '200px',
                                    }}
                                >
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Mês de Referência</label>
                                <select
                                    value={analysisMonth}
                                    onChange={(e) => setAnalysisMonth(Number(e.target.value))}
                                    style={{
                                        padding: '0.4rem 0.75rem',
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        color: 'var(--text-primary)',
                                        fontWeight: 600,
                                        minWidth: '150px',
                                    }}
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                                        <option key={m} value={m}>
                                            {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][m - 1]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Modal Navigation Tabs */}
                        <div style={{
                            display: 'flex',
                            background: 'var(--bg-surface)',
                            borderBottom: '1px solid var(--border-subtle)',
                            padding: '0 1.5rem',
                        }}>
                            {[
                                { id: 'deviation', label: 'Relato de Desvio', icon: '📝' },
                                { id: 'actions', label: 'Plano de Ação', icon: '🎯' },
                                { id: 'comments', label: 'Discussão', icon: '💬' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveModalTab(tab.id as any)}
                                    style={{
                                        padding: '1rem 1.25rem',
                                        background: 'none',
                                        border: 'none',
                                        borderBottom: activeModalTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                                        color: activeModalTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                                        fontWeight: activeModalTab === tab.id ? 700 : 500,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    <span>{tab.icon}</span>
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Modal Body Container */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '1.5rem',
                            background: 'var(--bg-elevated)',
                            position: 'relative',
                        }}>
                            {isAnalysisLoading ? (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '250px',
                                    gap: '0.75rem',
                                }}>
                                    <div style={{ border: '3px solid var(--border-default)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Carregando dados da análise...</span>
                                </div>
                            ) : (
                                <>
                                    {/* Relato de Desvio Tab */}
                                    {activeModalTab === 'deviation' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    Justificativa do Desvio (Orçado vs Realizado)
                                                </label>
                                                <textarea
                                                    value={deviationReport}
                                                    onChange={(e) => setDeviationReport(e.target.value)}
                                                    placeholder="Descreva as causas do desvio de valor entre o orçado e o realizado..."
                                                    style={{
                                                        width: '100%',
                                                        minHeight: '120px',
                                                        padding: '0.75rem',
                                                        background: 'var(--bg-surface)',
                                                        border: '1px solid var(--border-default)',
                                                        borderRadius: '8px',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.85rem',
                                                        lineHeight: 1.5,
                                                        resize: 'vertical',
                                                    }}
                                                />
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    Análise Realizada / Explicação Geral
                                                </label>
                                                <textarea
                                                    value={analysisPerformed}
                                                    onChange={(e) => setAnalysisPerformed(e.target.value)}
                                                    placeholder="Detalhe a análise técnica executada sobre este indicador..."
                                                    style={{
                                                        width: '100%',
                                                        minHeight: '120px',
                                                        padding: '0.75rem',
                                                        background: 'var(--bg-surface)',
                                                        border: '1px solid var(--border-default)',
                                                        borderRadius: '8px',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.85rem',
                                                        lineHeight: 1.5,
                                                        resize: 'vertical',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Plano de Ação Tab */}
                                    {activeModalTab === 'actions' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            {/* Action Items List */}
                                            <div>
                                                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    Ações Cadastradas ({analysisActions.length})
                                                </h4>
                                                {analysisActions.length === 0 ? (
                                                    <div style={{
                                                        padding: '2rem',
                                                        border: '1px dashed var(--border-default)',
                                                        borderRadius: '8px',
                                                        textAlign: 'center',
                                                        color: 'var(--text-secondary)',
                                                        fontSize: '0.85rem',
                                                    }}>
                                                        Nenhuma ação cadastrada para esta análise. Preencha o formulário abaixo para adicionar.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {analysisActions.map((action, idx) => (
                                                            <div
                                                                key={idx}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    padding: '0.75rem 1rem',
                                                                    background: 'var(--bg-surface)',
                                                                    border: '1px solid var(--border-default)',
                                                                    borderRadius: '8px',
                                                                    gap: '1rem',
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={action.status === 'done'}
                                                                        onChange={(e) => {
                                                                            const updated = [...analysisActions];
                                                                            updated[idx] = { ...action, status: e.target.checked ? 'done' : 'pending' };
                                                                            setAnalysisActions(updated);
                                                                        }}
                                                                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                                    />
                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                        <span style={{
                                                                            fontSize: '0.85rem',
                                                                            fontWeight: 600,
                                                                            color: 'var(--text-primary)',
                                                                            textDecoration: action.status === 'done' ? 'line-through' : 'none',
                                                                            opacity: action.status === 'done' ? 0.6 : 1,
                                                                        }}>
                                                                            {action.description}
                                                                        </span>
                                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                            Responsável: {action.responsable} | Prazo: {action.deadline}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        setAnalysisActions(analysisActions.filter((_, i) => i !== idx));
                                                                    }}
                                                                    style={{
                                                                        background: 'none',
                                                                        border: 'none',
                                                                        color: '#ef4444',
                                                                        fontSize: '0.8rem',
                                                                        fontWeight: 600,
                                                                        cursor: 'pointer',
                                                                    }}
                                                                >
                                                                    Excluir
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Add Action Item Form */}
                                            <div style={{
                                                padding: '1.25rem',
                                                background: 'var(--bg-surface)',
                                                border: '1px solid var(--border-default)',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '1rem',
                                            }}>
                                                <h5 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    ➕ Nova Ação Corretiva
                                                </h5>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Descrição da Ação</label>
                                                    <input
                                                        type="text"
                                                        value={newActionDesc}
                                                        onChange={(e) => setNewActionDesc(e.target.value)}
                                                        placeholder="Ex: Renegociar contrato de terceirizados..."
                                                        style={{
                                                            padding: '0.5rem 0.75rem',
                                                            background: 'var(--bg-elevated)',
                                                            border: '1px solid var(--border-default)',
                                                            borderRadius: '6px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '0.85rem',
                                                        }}
                                                    />
                                                </div>

                                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                                    <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Responsável</label>
                                                        <input
                                                            type="text"
                                                            value={newActionResp}
                                                            onChange={(e) => setNewActionResp(e.target.value)}
                                                            placeholder="Ex: João Silva"
                                                            style={{
                                                                padding: '0.5rem 0.75rem',
                                                                background: 'var(--bg-elevated)',
                                                                border: '1px solid var(--border-default)',
                                                                borderRadius: '6px',
                                                                color: 'var(--text-primary)',
                                                                fontSize: '0.85rem',
                                                            }}
                                                        />
                                                    </div>

                                                    <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Prazo</label>
                                                        <input
                                                            type="text"
                                                            value={newActionDate}
                                                            onChange={(e) => setNewActionDate(e.target.value)}
                                                            placeholder="Ex: 30/06/2026"
                                                            style={{
                                                                padding: '0.5rem 0.75rem',
                                                                background: 'var(--bg-elevated)',
                                                                border: '1px solid var(--border-default)',
                                                                borderRadius: '6px',
                                                                color: 'var(--text-primary)',
                                                                fontSize: '0.85rem',
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => {
                                                        if (!newActionDesc.trim()) return;
                                                        const newAction = {
                                                            description: newActionDesc,
                                                            responsable: newActionResp || 'N/A',
                                                            deadline: newActionDate || 'N/A',
                                                            status: 'pending'
                                                        };
                                                        setAnalysisActions([...analysisActions, newAction]);
                                                        setNewActionDesc('');
                                                        setNewActionResp('');
                                                        setNewActionDate('');
                                                    }}
                                                    style={{
                                                        alignSelf: 'flex-start',
                                                        padding: '0.4rem 1rem',
                                                        background: 'var(--bg-elevated)',
                                                        border: '1px solid var(--border-default)',
                                                        borderRadius: '6px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 700,
                                                        color: 'var(--text-primary)',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    Adicionar Ação
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Comentários Tab */}
                                    {activeModalTab === 'comments' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', minHeight: '300px' }}>
                                            {/* List of comments */}
                                            <div style={{
                                                flex: 1,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.75rem',
                                                maxHeight: '300px',
                                                overflowY: 'auto',
                                                paddingRight: '0.5rem',
                                            }}>
                                                {analysisComments.length === 0 ? (
                                                    <div style={{
                                                        padding: '2rem',
                                                        textAlign: 'center',
                                                        color: 'var(--text-secondary)',
                                                        fontSize: '0.85rem',
                                                        fontStyle: 'italic',
                                                    }}>
                                                        Nenhum comentário registrado ainda. Comece a discussão!
                                                    </div>
                                                ) : (
                                                    analysisComments.map((comment, idx) => (
                                                        <div
                                                            key={idx}
                                                            style={{
                                                                padding: '0.75rem 1rem',
                                                                background: 'var(--bg-surface)',
                                                                border: '1px solid var(--border-default)',
                                                                borderRadius: '8px',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '0.25rem',
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                                                    {comment.userName}
                                                                </span>
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                                    {new Date(comment.createdAt).toLocaleString('pt-BR')}
                                                                </span>
                                                            </div>
                                                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                                                                {comment.content}
                                                            </p>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            {/* Post comment form */}
                                            <div style={{
                                                padding: '1rem',
                                                background: 'var(--bg-surface)',
                                                border: '1px solid var(--border-default)',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.75rem',
                                            }}>
                                                <div style={{ display: 'flex', gap: '1rem' }}>
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Usuário</label>
                                                        <input
                                                            type="text"
                                                            value={newCommentUser}
                                                            onChange={(e) => setNewCommentUser(e.target.value)}
                                                            placeholder="Nome..."
                                                            style={{
                                                                padding: '0.4rem 0.75rem',
                                                                background: 'var(--bg-elevated)',
                                                                border: '1px solid var(--border-default)',
                                                                borderRadius: '6px',
                                                                color: 'var(--text-primary)',
                                                                fontSize: '0.85rem',
                                                                maxWidth: '200px',
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                                                    <textarea
                                                        value={newCommentText}
                                                        onChange={(e) => setNewCommentText(e.target.value)}
                                                        placeholder="Digite uma mensagem ou observação..."
                                                        style={{
                                                            flex: 1,
                                                            minHeight: '60px',
                                                            padding: '0.5rem 0.75rem',
                                                            background: 'var(--bg-elevated)',
                                                            border: '1px solid var(--border-default)',
                                                            borderRadius: '6px',
                                                            color: 'var(--text-primary)',
                                                            fontSize: '0.85rem',
                                                            lineHeight: 1.4,
                                                            resize: 'vertical',
                                                        }}
                                                    />
                                                    <button
                                                        onClick={postComment}
                                                        style={{
                                                            padding: '0.5rem 1.25rem',
                                                            background: 'var(--gradient-brand)',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            fontSize: '0.85rem',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            height: '38px',
                                                        }}
                                                    >
                                                        Enviar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderTop: '1px solid var(--border-subtle)',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '0.75rem',
                            background: 'var(--bg-surface)',
                        }}>
                            <button
                                onClick={() => setIsAnalysisModalOpen(false)}
                                style={{
                                    padding: '0.5rem 1.25rem',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                }}
                            >
                                Fechar
                            </button>
                            <button
                                onClick={saveAnalysisData}
                                disabled={isAnalysisSaving}
                                style={{
                                    padding: '0.5rem 1.5rem',
                                    background: 'var(--gradient-brand)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: 'var(--shadow-button)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                {isAnalysisSaving ? 'Salvando...' : 'Salvar Análise'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            </div>
        </div>
    );
};

const getComparisonPeriods = (comparePeriod: string) => {
    if (!comparePeriod || comparePeriod === 'none') return null;
    switch (comparePeriod) {
        case 'tri1_vs_tri2':
            return {
                labelA: '1º Tri',
                labelB: '2º Tri',
                monthsA: [0, 1, 2],
                monthsB: [3, 4, 5],
                monthLabelsA: ['Jan', 'Fev', 'Mar'],
                monthLabelsB: ['Abr', 'Mai', 'Jun']
            };
        case 'tri1_vs_tri3':
            return {
                labelA: '1º Tri',
                labelB: '3º Tri',
                monthsA: [0, 1, 2],
                monthsB: [6, 7, 8],
                monthLabelsA: ['Jan', 'Fev', 'Mar'],
                monthLabelsB: ['Jul', 'Ago', 'Set']
            };
        case 'tri1_vs_tri4':
            return {
                labelA: '1º Tri',
                labelB: '4º Tri',
                monthsA: [0, 1, 2],
                monthsB: [9, 10, 11],
                monthLabelsA: ['Jan', 'Fev', 'Mar'],
                monthLabelsB: ['Out', 'Nov', 'Dez']
            };
        case 'tri2_vs_tri3':
            return {
                labelA: '2º Tri',
                labelB: '3º Tri',
                monthsA: [3, 4, 5],
                monthsB: [6, 7, 8],
                monthLabelsA: ['Abr', 'Mai', 'Jun'],
                monthLabelsB: ['Jul', 'Ago', 'Set']
            };
        case 'tri2_vs_tri4':
            return {
                labelA: '2º Tri',
                labelB: '4º Tri',
                monthsA: [3, 4, 5],
                monthsB: [9, 10, 11],
                monthLabelsA: ['Abr', 'Mai', 'Jun'],
                monthLabelsB: ['Out', 'Nov', 'Dez']
            };
        case 'tri3_vs_tri4':
            return {
                labelA: '3º Tri',
                labelB: '4º Tri',
                monthsA: [6, 7, 8],
                monthsB: [9, 10, 11],
                monthLabelsA: ['Jul', 'Ago', 'Set'],
                monthLabelsB: ['Out', 'Nov', 'Dez']
            };
        case 'semestre1_vs_semestre2':
            return {
                labelA: '1º Sem',
                labelB: '2º Sem',
                monthsA: [0, 1, 2, 3, 4, 5],
                monthsB: [6, 7, 8, 9, 10, 11],
                monthLabelsA: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                monthLabelsB: ['Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
            };
        default:
            return null;
    }
};

const DetailedChartCard = ({ chart, onEdit, onDelete, onOpenAnalysis, mainMonth, year, viewMode, categories, companies }: { chart: any, onEdit: (c: any) => void, onDelete: (id: string) => void, onOpenAnalysis: (c: any) => void, mainMonth: number, year: number, viewMode: 'caixa' | 'competencia', categories: any[], companies: any[] }) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [chartViewMode, setChartViewMode] = useState<'monthly' | 'accumulated'>('monthly');
    const [activeAnalysis, setActiveAnalysis] = useState<any | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; items: { label: string; value: string; color?: string }[] } | null>(null);
    const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            try {
                let dimension = 'none';
                let startM = 0;
                let endM = 11;
                if (chart.chartType && chart.chartType.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(chart.chartType);
                        dimension = parsed.dimension || 'none';
                        startM = parsed.startMonth !== undefined ? parsed.startMonth : 0;
                        endM = parsed.endMonth !== undefined ? parsed.endMonth : 11;
                    } catch (e) {}
                }
                const res = await fetch(`/api/kpi/detailed-chart-data?categoryId=${chart.categoryId}&filterTenantId=${chart.filterTenantId}&filterCCId=${chart.filterCCId || 'ALL'}&year=${year}&viewMode=${viewMode}&dimension=${dimension}&startMonth=${startM}&endMonth=${endM}`);
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
    }, [chart.categoryId, chart.filterTenantId, chart.filterCCId, year, viewMode, chart.chartType]);

    useEffect(() => {
        let active = true;
        const loadAnalysis = async () => {
            const tenantId = chart.filterTenantId === 'ALL' ? (companies?.[0]?.id || '') : chart.filterTenantId;
            if (!tenantId || !chart.categoryId) return;
            try {
                const res = await fetch(`/api/kpi/analysis?tenantId=${tenantId}&categoryId=${chart.categoryId}&month=${mainMonth}&year=${year}`);
                const json = await res.json();
                if (json.success && active) {
                    setActiveAnalysis(json.data || null);
                }
            } catch (err) {
                console.error(err);
            }
        };
        loadAnalysis();
        return () => { active = false; };
    }, [chart.filterTenantId, chart.categoryId, mainMonth, year, companies]);

    const processedData = useMemo(() => {
        let comparePeriod = 'none';
        if (chart.chartType && chart.chartType.startsWith('{')) {
            try {
                const parsed = JSON.parse(chart.chartType);
                comparePeriod = parsed.comparePeriod || 'none';
            } catch (e) {}
        }

        const isRatio = chart.categoryId && chart.categoryId.includes('|');

        if (comparePeriod !== 'none') {
            const compInfo = getComparisonPeriods(comparePeriod);
            if (compInfo) {
                const { monthsA, monthsB } = compInfo;
                const currentMonthIdx = new Date().getMonth();
                
                let sumBudgetA = 0;
                let sumRealizedA = 0;
                let sumCompareBudgetA = 0;
                let sumCompareRealizedA = 0;
                let sumRevenueRealizedA = 0;
                let sumRevenueBudgetA = 0;

                let sumBudgetB = 0;
                let sumRealizedB = 0;
                let sumCompareBudgetB = 0;
                let sumCompareRealizedB = 0;
                let sumRevenueRealizedB = 0;
                let sumRevenueBudgetB = 0;

                // Accumulate Period A
                for (let i = 0; i < monthsA.length; i++) {
                    const idxA = monthsA[i];
                    const mA = data[idxA] || { budget: 0, realized: 0, compareBudget: 0, compareRealized: 0, pctOfRevenue: 0, pctOfRevenueBudget: 0 };
                    
                    const revBudgetA = mA.pctOfRevenueBudget > 0 ? (mA.budget / (mA.pctOfRevenueBudget / 100)) : 0;
                    sumBudgetA += mA.budget;
                    sumRevenueBudgetA += revBudgetA;
                    sumCompareBudgetA += mA.compareBudget || 0;

                    if (idxA <= currentMonthIdx) {
                        const revRealizedA = mA.pctOfRevenue > 0 ? (mA.realized / (mA.pctOfRevenue / 100)) : 0;
                        sumRealizedA += mA.realized;
                        sumRevenueRealizedA += revRealizedA;
                        sumCompareRealizedA += mA.compareRealized || 0;
                    }
                }

                // Accumulate Period B
                for (let i = 0; i < monthsB.length; i++) {
                    const idxB = monthsB[i];
                    const mB = data[idxB] || { budget: 0, realized: 0, compareBudget: 0, compareRealized: 0, pctOfRevenue: 0, pctOfRevenueBudget: 0 };
                    
                    const revBudgetB = mB.pctOfRevenueBudget > 0 ? (mB.budget / (mB.pctOfRevenueBudget / 100)) : 0;
                    sumBudgetB += mB.budget;
                    sumRevenueBudgetB += revBudgetB;
                    sumCompareBudgetB += mB.compareBudget || 0;

                    if (idxB <= currentMonthIdx) {
                        const revRealizedB = mB.pctOfRevenue > 0 ? (mB.realized / (mB.pctOfRevenue / 100)) : 0;
                        sumRealizedB += mB.realized;
                        sumRevenueRealizedB += revRealizedB;
                        sumCompareRealizedB += mB.compareRealized || 0;
                    }
                }

                let atA = 0;
                if (isRatio) {
                    atA = sumRealizedA !== 0 ? (sumCompareRealizedA / sumRealizedA) * 100 : 0;
                } else {
                    if (sumBudgetA > 0) atA = (sumRealizedA / sumBudgetA) * 100;
                    else if (sumBudgetA < 0) atA = (1 + (sumBudgetA - sumRealizedA) / sumBudgetA) * 100;
                    else atA = sumRealizedA >= 0 ? 100 : 0;
                }

                let atB = 0;
                if (isRatio) {
                    atB = sumRealizedB !== 0 ? (sumCompareRealizedB / sumRealizedB) * 100 : 0;
                } else {
                    if (sumBudgetB > 0) atB = (sumRealizedB / sumBudgetB) * 100;
                    else if (sumBudgetB < 0) atB = (1 + (sumBudgetB - sumRealizedB) / sumBudgetB) * 100;
                    else atB = sumRealizedB >= 0 ? 100 : 0;
                }

                const pctA = sumRevenueRealizedA > 0 ? (sumRealizedA / sumRevenueRealizedA) * 100 : 0;
                const pctBudgetA = sumRevenueBudgetA > 0 ? (sumBudgetA / sumRevenueBudgetA) * 100 : 0;
                const pctB = sumRevenueRealizedB > 0 ? (sumRealizedB / sumRevenueRealizedB) * 100 : 0;
                const pctBudgetB = sumRevenueBudgetB > 0 ? (sumBudgetB / sumRevenueBudgetB) * 100 : 0;

                return [{
                    month: 1,
                    labelA: compInfo.labelA,
                    labelB: compInfo.labelB,
                    budget: sumBudgetA,
                    realized: sumRealizedA,
                    compareBudget: sumCompareBudgetA,
                    compareRealized: sumCompareRealizedA,
                    atingido: atA,
                    pctOfRevenue: pctA,
                    pctOfRevenueBudget: pctBudgetA,
                    
                    budgetB: sumBudgetB,
                    realizedB: sumRealizedB,
                    compareBudgetB: sumCompareBudgetB,
                    compareRealizedB: sumCompareRealizedB,
                    atingidoB: atB,
                    pctOfRevenueB: pctB,
                    pctOfRevenueBudgetB: pctBudgetB
                }];
            }
        }

        if (chartViewMode === 'monthly') return data;

        let accBudget = 0;
        let accRealized = 0;
        let accCompareBudget = 0;
        let accCompareRealized = 0;
        let accRevenueRealized = 0;
        let accRevenueBudget = 0;

        return data.map((m) => {
            accBudget += m.budget;
            accRealized += m.realized;
            
            if (isRatio) {
                accCompareBudget += m.compareBudget || 0;
                accCompareRealized += m.compareRealized || 0;
            }

            const mRevenueRealized = m.pctOfRevenue > 0 ? (m.realized / (m.pctOfRevenue / 100)) : 0;
            accRevenueRealized += mRevenueRealized;

            const mRevenueBudget = m.pctOfRevenueBudget > 0 ? (m.budget / (m.pctOfRevenueBudget / 100)) : 0;
            accRevenueBudget += mRevenueBudget;

            let accAtingido = 0;
            if (isRatio) {
                accAtingido = accRealized !== 0 ? (accCompareRealized / accRealized) * 100 : 0;
            } else {
                if (accBudget > 0) {
                    accAtingido = (accRealized / accBudget) * 100;
                } else if (accBudget < 0) {
                    accAtingido = (1 + (accBudget - accRealized) / accBudget) * 100;
                } else {
                    accAtingido = accRealized >= 0 ? 100 : 0;
                }
            }

            const accPctOfRevenue = accRevenueRealized > 0 ? (accRealized / accRevenueRealized) * 100 : 0;
            const accPctOfRevenueBudget = accRevenueBudget > 0 ? (accBudget / accRevenueBudget) * 100 : 0;

            const res: any = {
                ...m,
                budget: accBudget,
                realized: accRealized,
                atingido: accAtingido,
                pctOfRevenue: accPctOfRevenue,
                pctOfRevenueBudget: accPctOfRevenueBudget
            };

            if (isRatio) {
                res.compareBudget = accCompareBudget;
                res.compareRealized = accCompareRealized;
            }

            return res;
        });
    }, [data, chartViewMode, chart.categoryId, chart.chartType]);

    const getChartCategoryLabel = (categoriesStr: string): string => {
        if (!categoriesStr) return 'Sem contas';
        if (categoriesStr.includes('|')) {
            const [base, compare] = categoriesStr.split('|');
            return `${getChartCategoryLabel(base)} / ${getChartCategoryLabel(compare)}`;
        }
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
            if (syntheticLabels[id]) return syntheticLabels[id];
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

    // Define legend items
    const legendItems: { key: string; label: string; color: string }[] = [];
    let isMixed = false;
    let bMode = 'bar';
    let rMode = 'bar';
    let atMode = 'none';
    let pctMode = 'none';
    let comparePeriod = 'none';

    if (chart.chartType && chart.chartType.startsWith('{')) {
        try {
            const parsed = JSON.parse(chart.chartType);
            isMixed = parsed.mode === 'MIXED';
            bMode = parsed.config?.budget || 'bar';
            rMode = parsed.config?.realized || 'bar';
            atMode = parsed.config?.atingido || 'none';
            pctMode = parsed.config?.pctOfRevenue || 'none';
            comparePeriod = parsed.comparePeriod || 'none';
        } catch (e) {}
    }

    const isRatioChart = !!(chart.categoryId && chart.categoryId.includes('|') && chart.categoryId.split('|')[1]);
    const compInfo = getComparisonPeriods(comparePeriod);
    const isConsolidatedCompare = !!(compInfo && processedData && processedData.length === 1);

    if (isConsolidatedCompare) {
        if (isRatioChart) {
            const [baseId, compareId] = chart.categoryId.split('|');
            const baseLabel = getChartCategoryLabel(baseId);
            const compareLabel = getChartCategoryLabel(compareId);
            if (!chart.onlyRealized) {
                legendItems.push({ key: 'budget', label: `${baseLabel} (Orçado)`, color: '#cbd5e1' });
                legendItems.push({ key: 'compareBudget', label: `${compareLabel} (Orçado)`, color: '#cbd5e1' });
            }
            legendItems.push({ key: 'realized', label: `${baseLabel} (Realizado)`, color: chart.chartColor || '#6366f1' });
            legendItems.push({ key: 'compareRealized', label: `${compareLabel} (Realizado)`, color: '#818cf8' });
        } else {
            if (!chart.onlyRealized) legendItems.push({ key: 'budget', label: 'Orçado', color: '#cbd5e1' });
            legendItems.push({ key: 'realized', label: 'Realizado', color: chart.chartColor || '#6366f1' });
        }
    } else if (compInfo) {
        const { labelA, labelB } = compInfo;
        if (isRatioChart) {
            const [baseId, compareId] = chart.categoryId.split('|');
            const baseLabel = getChartCategoryLabel(baseId);
            const compareLabel = getChartCategoryLabel(compareId);

            if (isMixed) {
                if (bMode !== 'none' && !chart.onlyRealized) legendItems.push({ key: 'budget', label: `${baseLabel} (${labelA} - Orçado)`, color: '#cbd5e1' });
                if (rMode !== 'none') legendItems.push({ key: 'realized', label: `${baseLabel} (${labelA} - Realizado)`, color: chart.chartColor || '#6366f1' });
                if (bMode !== 'none' && !chart.onlyRealized) legendItems.push({ key: 'budgetB', label: `${baseLabel} (${labelB} - Orçado)`, color: '#fed7aa' });
                if (rMode !== 'none') legendItems.push({ key: 'realizedB', label: `${baseLabel} (${labelB} - Realizado)`, color: '#10b981' });

                if (bMode !== 'none' && !chart.onlyRealized) legendItems.push({ key: 'compareBudget', label: `${compareLabel} (${labelA} - Orçado)`, color: '#e2e8f0' });
                if (rMode !== 'none') legendItems.push({ key: 'compareRealized', label: `${compareLabel} (${labelA} - Realizado)`, color: '#818cf8' });
                if (bMode !== 'none' && !chart.onlyRealized) legendItems.push({ key: 'compareBudgetB', label: `${compareLabel} (${labelB} - Orçado)`, color: '#ffedd5' });
                if (rMode !== 'none') legendItems.push({ key: 'compareRealizedB', label: `${compareLabel} (${labelB} - Realizado)`, color: '#f97316' });

                if (atMode !== 'none') legendItems.push({ key: 'atingido', label: `% Razão (${labelA})`, color: '#a855f7' });
                if (atMode !== 'none') legendItems.push({ key: 'atingidoB', label: `% Razão (${labelB})`, color: '#ec4899' });
            } else {
                if (!chart.onlyRealized) legendItems.push({ key: 'budget', label: `${baseLabel} (${labelA} - Orçado)`, color: '#cbd5e1' });
                legendItems.push({ key: 'realized', label: `${baseLabel} (${labelA} - Realizado)`, color: chart.chartColor || '#6366f1' });
                if (!chart.onlyRealized) legendItems.push({ key: 'budgetB', label: `${baseLabel} (${labelB} - Orçado)`, color: '#fed7aa' });
                legendItems.push({ key: 'realizedB', label: `${baseLabel} (${labelB} - Realizado)`, color: '#10b981' });

                if (!chart.onlyRealized) legendItems.push({ key: 'compareBudget', label: `${compareLabel} (${labelA} - Orçado)`, color: '#e2e8f0' });
                legendItems.push({ key: 'compareRealized', label: `${compareLabel} (${labelA} - Realizado)`, color: '#818cf8' });
                if (!chart.onlyRealized) legendItems.push({ key: 'compareBudgetB', label: `${compareLabel} (${labelB} - Orçado)`, color: '#ffedd5' });
                legendItems.push({ key: 'compareRealizedB', label: `${compareLabel} (${labelB} - Realizado)`, color: '#f97316' });
            }
        } else {
            if (isMixed) {
                if (bMode !== 'none' && !chart.onlyRealized) legendItems.push({ key: 'budget', label: `${labelA} - Orçado`, color: '#cbd5e1' });
                if (rMode !== 'none') legendItems.push({ key: 'realized', label: `${labelA} - Realizado`, color: chart.chartColor || '#6366f1' });
                if (bMode !== 'none' && !chart.onlyRealized) legendItems.push({ key: 'budgetB', label: `${labelB} - Orçado`, color: '#fed7aa' });
                if (rMode !== 'none') legendItems.push({ key: 'realizedB', label: `${labelB} - Realizado`, color: '#10b981' });

                if (atMode !== 'none') legendItems.push({ key: 'atingido', label: `${labelA} - Atingido`, color: '#10b981' });
                if (atMode !== 'none') legendItems.push({ key: 'atingidoB', label: `${labelB} - Atingido`, color: '#a855f7' });

                if (pctMode !== 'none') {
                    if (!chart.onlyRealized) legendItems.push({ key: 'pctOfRevenueBudget', label: `${labelA} - % s/ Rec. (Orçado)`, color: '#fed7aa' });
                    legendItems.push({ key: 'pctOfRevenue', label: `${labelA} - % s/ Rec. (Realizado)`, color: '#f59e0b' });
                    if (!chart.onlyRealized) legendItems.push({ key: 'pctOfRevenueBudgetB', label: `${labelB} - % s/ Rec. (Orçado)`, color: '#a7f3d0' });
                    legendItems.push({ key: 'pctOfRevenueB', label: `${labelB} - % s/ Rec. (Realizado)`, color: '#34d399' });
                }
            } else {
                if (!chart.onlyRealized) legendItems.push({ key: 'budget', label: `${labelA} - Orçado`, color: '#cbd5e1' });
                legendItems.push({ key: 'realized', label: `${labelA} - Realizado`, color: chart.chartColor || '#6366f1' });
                if (!chart.onlyRealized) legendItems.push({ key: 'budgetB', label: `${labelB} - Orçado`, color: '#fed7aa' });
                legendItems.push({ key: 'realizedB', label: `${labelB} - Realizado`, color: '#10b981' });
            }
        }
    } else {
        if (isRatioChart) {
            const [baseId, compareId] = chart.categoryId.split('|');
            const baseLabel = getChartCategoryLabel(baseId);
            const compareLabel = getChartCategoryLabel(compareId);

            if (isMixed) {
                if (bMode !== 'none' && !chart.onlyRealized) legendItems.push({ key: 'budget', label: `${baseLabel} (Orçado)`, color: '#cbd5e1' });
                if (rMode !== 'none') legendItems.push({ key: 'realized', label: `${baseLabel} (Realizado)`, color: chart.chartColor || '#6366f1' });
                if (bMode !== 'none' && !chart.onlyRealized) legendItems.push({ key: 'compareBudget', label: `${compareLabel} (Orçado)`, color: '#fed7aa' });
                if (rMode !== 'none') legendItems.push({ key: 'compareRealized', label: `${compareLabel} (Realizado)`, color: '#f97316' });
                if (atMode !== 'none') legendItems.push({ key: 'atingido', label: `% ${compareLabel} / ${baseLabel}`, color: '#10b981' });
            } else {
                if (!chart.onlyRealized) legendItems.push({ key: 'budget', label: `${baseLabel} (Orçado)`, color: '#cbd5e1' });
                legendItems.push({ key: 'realized', label: `${baseLabel} (Realizado)`, color: chart.chartColor || '#6366f1' });
                if (!chart.onlyRealized) legendItems.push({ key: 'compareBudget', label: `${compareLabel} (Orçado)`, color: '#fed7aa' });
                legendItems.push({ key: 'compareRealized', label: `${compareLabel} (Realizado)`, color: '#f97316' });
            }
        } else {
            if (isMixed) {
                if (bMode !== 'none' && !chart.onlyRealized) legendItems.push({ key: 'budget', label: 'Orçado', color: '#cbd5e1' });
                if (rMode !== 'none') legendItems.push({ key: 'realized', label: 'Realizado', color: chart.chartColor || '#6366f1' });
                if (atMode !== 'none') legendItems.push({ key: 'atingido', label: 'Atingido', color: '#10b981' });
                if (pctMode !== 'none') {
                    if (!chart.onlyRealized) legendItems.push({ key: 'pctOfRevenueBudget', label: '% s/ Receita (Orçado)', color: '#fed7aa' });
                    legendItems.push({ key: 'pctOfRevenue', label: '% s/ Receita (Realizado)', color: '#f59e0b' });
                }
            } else {
                if (!chart.onlyRealized) legendItems.push({ key: 'budget', label: 'Orçado', color: 'var(--border-strong)' });
                legendItems.push({ key: 'realized', label: 'Realizado', color: chart.chartColor || '#6366f1' });
            }
        }
    }

    return (
        <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)', width: '100%', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
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
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'center' }}>
                    {/* Mensal / Acumulado Toggle */}
                    <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '2px', borderRadius: '6px' }}>
                        <button
                            onClick={() => setChartViewMode('monthly')}
                            style={{
                                padding: '0.25rem 0.55rem',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: chartViewMode === 'monthly' ? 'var(--accent-indigo)' : 'transparent',
                                color: chartViewMode === 'monthly' ? '#ffffff' : 'var(--text-secondary)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            Mensal
                        </button>
                        <button
                            onClick={() => setChartViewMode('accumulated')}
                            style={{
                                padding: '0.25rem 0.55rem',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: chartViewMode === 'accumulated' ? 'var(--accent-indigo)' : 'transparent',
                                color: chartViewMode === 'accumulated' ? '#ffffff' : 'var(--text-secondary)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            Acumulado
                        </button>
                    </div>

                    <button 
                        onClick={() => onOpenAnalysis(chart)}
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-indigo)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                        📝 Analisar Desvio
                    </button>
                    <button 
                        onClick={() => onEdit(chart)}
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                        ⚙️ Configurar
                    </button>
                    <button 
                        onClick={() => onDelete(chart.id)}
                        style={{ background: '#fef2f2', border: 'none', borderRadius: '6px', padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', cursor: 'pointer' }}
                    >
                        🗑️ Excluir
                    </button>
                </div>
            </div>

            {/* Interactive Legend */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', margin: '0.2rem 0', flexWrap: 'wrap' }}>
                {legendItems.map(item => {
                    const isHidden = hiddenSeries[item.key];
                    return (
                        <div 
                            key={item.key}
                            onClick={() => setHiddenSeries(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.35rem', 
                                cursor: 'pointer', 
                                fontSize: '0.75rem', 
                                fontWeight: 700,
                                userSelect: 'none',
                                opacity: isHidden ? 0.4 : 1,
                                transition: 'opacity 0.2s'
                            }}
                        >
                            <span style={{ 
                                display: 'inline-block', 
                                width: '12px', 
                                height: '12px', 
                                borderRadius: '3px', 
                                backgroundColor: item.color,
                                border: '1px solid rgba(0,0,0,0.1)'
                            }} />
                            <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                        </div>
                    );
                })}
            </div>

            <div style={{ width: '100%', position: 'relative' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '180px', width: '100%' }}>
                        <div style={{ border: '2.5px solid #f3f3f3', borderTop: '2.5px solid #3b82f6', borderRadius: '50%', width: '22px', height: '22px', animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : (
                    renderDetailedChart(
                        chart.chartType, 
                        processedData, 
                        !!chart.onlyRealized, 
                        !!chart.showAtingido, 
                        !!chart.pctOfRevenue, 
                        mainMonth, 
                        chart.chartColor, 
                        undefined, 
                        chart.year, 
                        setTooltip, 
                        hiddenSeries,
                        chart.categoryId && chart.categoryId.includes('|') ? getChartCategoryLabel(chart.categoryId.split('|')[0]) : undefined,
                        chart.categoryId && chart.categoryId.includes('|') ? getChartCategoryLabel(chart.categoryId.split('|')[1]) : undefined
                    )
                )}
            </div>

            {/* Display Monthly Analysis Text */}
            {activeAnalysis && (activeAnalysis.deviationReport || activeAnalysis.analysisPerformed) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.75rem 1.0rem', background: 'var(--bg-elevated)', borderLeft: `4px solid ${chart.chartColor || '#6366f1'}`, borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', flex: 1, lineHeight: '1.4' }}>
                            {activeAnalysis.deviationReport && (
                                <div style={{ marginBottom: '0.4rem' }}>
                                    <strong>⚠️ Relato de Desvio ({['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][mainMonth - 1]}):</strong> {activeAnalysis.deviationReport}
                                </div>
                            )}
                            {activeAnalysis.analysisPerformed && (
                                <div>
                                    <strong>🔍 Análise Causa Raiz:</strong> {activeAnalysis.analysisPerformed}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => onOpenAnalysis(chart)}
                            style={{ background: 'none', border: 'none', color: chart.chartColor || '#6366f1', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '2px', alignSelf: 'flex-start', flexShrink: 0 }}
                        >
                            ✏️ Editar Análise
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '0.4rem 0.75rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px dashed var(--border-default)' }}>
                    <button
                        onClick={() => onOpenAnalysis(chart)}
                        style={{ background: 'none', border: 'none', color: chart.chartColor || '#6366f1', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: 0.7 }}
                    >
                        📝 Escrever Análise de Desvio
                    </button>
                </div>
            )}

            {/* Custom Fixed Tooltip Rendering */}
            {mounted && typeof document !== 'undefined' && tooltip && tooltip.items.length > 0 && createPortal(
                (() => {
                    const tipW = 200;
                    const tipH = 32 + tooltip.items.length * 22;
                    const safeLeft = Math.min(tooltip.x + 15, window.innerWidth - tipW - 10);
                    let safeTop = tooltip.y + 15;
                    if (tooltip.y + tipH + 20 > window.innerHeight) {
                        safeTop = tooltip.y - tipH - 10; // flip above cursor
                        if (safeTop < 10) safeTop = 10; // clamp to top edge
                    }
                    return (
                        <div style={{
                            position: 'fixed',
                            left: safeLeft,
                            top: safeTop,
                            backgroundColor: 'rgba(15, 23, 42, 0.97)',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '0.55rem 0.75rem',
                            boxShadow: '0 10px 20px -3px rgba(0,0,0,0.4)',
                            zIndex: 99999,
                            pointerEvents: 'none',
                            color: '#f8fafc',
                            fontSize: '0.75rem',
                            minWidth: '160px',
                            fontFamily: 'inherit'
                        }}>
                            <div style={{ fontWeight: 800, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '4px', marginBottom: '4px', color: '#cbd5e1' }}>
                                {tooltip.title}
                            </div>
                            {tooltip.items.map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.25rem', marginTop: '3px', alignItems: 'center' }}>
                                    <span style={{ color: 'rgba(241,245,249,0.8)', fontWeight: 500 }}>{item.label}</span>
                                    <span style={{ fontWeight: 800, color: item.color || '#fff' }}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                    );
                })(),
                document.body
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
    year: number = 2026,
    onHover?: (tooltipData: { x: number; y: number; title: string; items: { label: string; value: string; color?: string }[] } | null) => void,
    hiddenSeries: Record<string, boolean> = {},
    baseLabel?: string,
    compareLabel?: string
) => {
    if (!data || data.length === 0) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px dashed var(--border-default)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Carregando dados do gráfico...
            </div>
        );
    }

    const isRatioChart = !!(baseLabel && compareLabel);

    let chartMode = type;
    let config = mixedConfig;
    let comparePeriod = 'none';
    let dimension = 'none';
    let startMonth = 0;
    let endMonth = 11;
    if (type && type.startsWith('{')) {
        try {
            const parsed = JSON.parse(type);
            chartMode = parsed.mode || 'MIXED';
            config = parsed.config;
            comparePeriod = parsed.comparePeriod || 'none';
            dimension = parsed.dimension || 'none';
            startMonth = parsed.startMonth !== undefined ? parsed.startMonth : 0;
            endMonth = parsed.endMonth !== undefined ? parsed.endMonth : 11;
        } catch (e) {
            chartMode = 'VERTICAL_BAR';
        }
    }

    const formatVal = (val: number) => {
        if (pctOfRevenue) return `${val.toFixed(1)}%`;
        if (val === 0) return 'R$ 0';
        const absVal = Math.abs(val);
        let formatted = '';
        if (absVal < 1_000_000) {
            formatted = (absVal / 1000).toFixed(1) + 'k';
        } else {
            formatted = (absVal / 1_000_000).toFixed(2) + 'M';
        }
        return `${val < 0 ? '-' : ''}R$ ${formatted}`;
    };

    const compInfo = getComparisonPeriods(comparePeriod);

    const currentMonthIdx = new Date().getMonth();
    const hasNegative = data.some(m => 
        m.budget < 0 || 
        m.realized < 0 || 
        (m.budgetB !== undefined && m.budgetB < 0) || 
        (m.realizedB !== undefined && m.realizedB < 0) ||
        (m.compareBudget !== undefined && m.compareBudget < 0) ||
        (m.compareRealized !== undefined && m.compareRealized < 0) ||
        (m.compareBudgetB !== undefined && m.compareBudgetB < 0) ||
        (m.compareRealizedB !== undefined && m.compareRealizedB < 0)
    );

    const hideBudget = !!hiddenSeries.budget || !!hiddenSeries.pctOfRevenueBudget || onlyRealized;
    const hideRealized = !!hiddenSeries.realized || !!hiddenSeries.pctOfRevenue;
    const hideBudgetB = !!hiddenSeries.budgetB || !!hiddenSeries.pctOfRevenueBudgetB || onlyRealized;
    const hideRealizedB = !!hiddenSeries.realizedB || !!hiddenSeries.pctOfRevenueB;
    const hideCompareBudget = !!hiddenSeries.compareBudget || onlyRealized;
    const hideCompareRealized = !!hiddenSeries.compareRealized;
    const hideCompareBudgetB = !!hiddenSeries.compareBudgetB || onlyRealized;
    const hideCompareRealizedB = !!hiddenSeries.compareRealizedB;

    const isRealizedVisible = (key: string, idx: number) => {
        if (key.toLowerCase().includes('budget')) return true;
        if (!compInfo) {
            return idx <= currentMonthIdx;
        }
        const isB = key.endsWith('B');
        const calIdx = isB ? compInfo.monthsB[idx] : compInfo.monthsA[idx];
        return calIdx <= currentMonthIdx;
    };

    const getVal = (key: string, m: any) => {
        if (key === 'budget') return pctOfRevenue ? (m.pctOfRevenueBudget || 0) : m.budget;
        if (key === 'realized') return pctOfRevenue ? (m.pctOfRevenue || 0) : m.realized;
        if (key === 'budgetB') return pctOfRevenue ? (m.pctOfRevenueBudgetB || 0) : m.budgetB;
        if (key === 'realizedB') return pctOfRevenue ? (m.pctOfRevenueB || 0) : m.realizedB;
        if (key === 'compareBudget') return m.compareBudget || 0;
        if (key === 'compareRealized') return m.compareRealized || 0;
        if (key === 'compareBudgetB') return m.compareBudgetB || 0;
        if (key === 'compareRealizedB') return m.compareRealizedB || 0;
        return 0;
    };
    
    const getLineVal = (key: string, m: any) => getVal(key, m);

    let maxVal = 1;
    if (compInfo) {
        maxVal = Math.max(...data.map((m) => Math.max(
            hideBudget ? 0 : Math.abs(pctOfRevenue ? m.pctOfRevenueBudget : m.budget),
            !hideRealized ? Math.abs(pctOfRevenue ? m.pctOfRevenue : m.realized) : 0,
            hideBudgetB ? 0 : Math.abs(pctOfRevenue ? m.pctOfRevenueBudgetB : m.budgetB),
            !hideRealizedB ? Math.abs(pctOfRevenue ? m.pctOfRevenueB : m.realizedB) : 0,
            isRatioChart && !hideCompareBudget ? Math.abs(m.compareBudget || 0) : 0,
            isRatioChart && !hideCompareRealized ? Math.abs(m.compareRealized || 0) : 0,
            isRatioChart && !hideCompareBudgetB ? Math.abs(m.compareBudgetB || 0) : 0,
            isRatioChart && !hideCompareRealizedB ? Math.abs(m.compareRealizedB || 0) : 0
        ))) || 1;
    } else {
        maxVal = Math.max(...data.map((m, idx) => Math.max(
            hideBudget ? 0 : Math.abs(pctOfRevenue ? (m.pctOfRevenueBudget || 0) : m.budget),
            (!hideRealized && idx <= currentMonthIdx) ? Math.abs(pctOfRevenue ? (m.pctOfRevenue || 0) : m.realized) : 0,
            isRatioChart && !hideCompareBudget ? Math.abs(m.compareBudget || 0) : 0,
            isRatioChart && !hideCompareRealized && (idx <= currentMonthIdx) ? Math.abs(m.compareRealized || 0) : 0
        ))) || 1;
    }

    const getGrowthIndicator = () => {
        if (!compInfo || !data || data.length === 0) return null;
        const m = data[0];
        if (isRatioChart) {
            const valA = m.atingido || 0;
            const valB = m.atingidoB || 0;
            const diff = valB - valA;
            const isGrowth = diff >= 0;
            const sign = diff >= 0 ? '+' : '';
            const text = `${sign}${diff.toFixed(1)} p.p.`;
            return { text, isGrowth };
        } else {
            const valA = m.realized || 0;
            const valB = m.realizedB || 0;
            if (valA === 0) {
                if (valB === 0) return { text: '0.0%', isGrowth: true };
                return { text: valB > 0 ? '+100.0%' : '-100.0%', isGrowth: valB > 0 };
            }
            const pct = ((valB - valA) / Math.abs(valA)) * 100;
            const sign = pct >= 0 ? '+' : '';
            const text = `${sign}${pct.toFixed(1)}%`;
            return { text, isGrowth: pct >= 0 };
        }
    };
    const growth = getGrowthIndicator();

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
                } else if (absVal < 1_000_000) {
                    formatted = (absVal / 1000).toFixed(1) + 'k';
                } else {
                    formatted = (absVal / 1_000_000).toFixed(2) + 'M';
                }
                return `${val < 0 ? '-' : ''}R$ ${formatted}${isDaily ? '/d' : ''}`;
            };

            const compareActive = compInfo !== null;

            const bMode = (compareActive && data.length === 1) ? 'bar' : (hideBudget ? 'none' : (config?.budget || 'bar'));
            const rMode = (compareActive && data.length === 1) ? 'bar' : (hideRealized ? 'none' : (config?.realized || 'bar'));
            const atMode = (compareActive && data.length === 1) ? 'none' : (hiddenSeries.atingido ? 'none' : (config?.atingido || 'none'));
            const pctMode = (compareActive && data.length === 1) ? 'none' : (hiddenSeries.pctOfRevenue ? 'none' : (config?.pctOfRevenue || 'none'));

            const hasDailyActive = isDailyMode(bMode) || isDailyMode(rMode);

            let maxAbs = 1;
            data.forEach((m, idx) => {
                if (bMode !== 'none') {
                    const bValA = getAbsValue(m.budget, bMode, idx);
                    maxAbs = Math.max(maxAbs, Math.abs(bValA));
                    if (compareActive) {
                        const bValB = getAbsValue(m.budgetB || 0, bMode, idx);
                        maxAbs = Math.max(maxAbs, Math.abs(bValB));
                    }
                    if (isRatioChart) {
                        const cbValA = getAbsValue(m.compareBudget || 0, bMode, idx);
                        maxAbs = Math.max(maxAbs, Math.abs(cbValA));
                        if (compareActive) {
                            const cbValB = getAbsValue(m.compareBudgetB || 0, bMode, idx);
                            maxAbs = Math.max(maxAbs, Math.abs(cbValB));
                        }
                    }
                }
                if (rMode !== 'none') {
                    if (isRealizedVisible('realized', idx)) {
                        const rValA = getAbsValue(m.realized, rMode, idx);
                        maxAbs = Math.max(maxAbs, Math.abs(rValA));
                    }
                    if (compareActive && isRealizedVisible('realizedB', idx)) {
                        const rValB = getAbsValue(m.realizedB || 0, rMode, idx);
                        maxAbs = Math.max(maxAbs, Math.abs(rValB));
                    }
                    if (isRatioChart) {
                        if (isRealizedVisible('compareRealized', idx)) {
                            const crValA = getAbsValue(m.compareRealized || 0, rMode, idx);
                            maxAbs = Math.max(maxAbs, Math.abs(crValA));
                        }
                        if (compareActive && isRealizedVisible('compareRealizedB', idx)) {
                            const crValB = getAbsValue(m.compareRealizedB || 0, rMode, idx);
                            maxAbs = Math.max(maxAbs, Math.abs(crValB));
                        }
                    }
                }
            });
            const scaleMaxAbs = maxAbs * 1.20;

            let maxPct = 5;
            data.forEach((m, idx) => {
                if (atMode !== 'none') {
                    if (isRealizedVisible('realized', idx)) {
                        maxPct = Math.max(maxPct, Math.abs(m.atingido));
                    }
                    if (compareActive && isRealizedVisible('realizedB', idx)) {
                        maxPct = Math.max(maxPct, Math.abs(m.atingidoB || 0));
                    }
                }
                if (pctMode !== 'none') {
                    if (isRealizedVisible('realized', idx)) {
                        maxPct = Math.max(maxPct, Math.abs(m.pctOfRevenue || 0));
                    }
                    if (compareActive && isRealizedVisible('realizedB', idx)) {
                        maxPct = Math.max(maxPct, Math.abs(m.pctOfRevenueB || 0));
                    }
                    if (!onlyRealized) {
                        maxPct = Math.max(
                            maxPct, 
                            Math.abs(m.pctOfRevenueBudget || 0),
                            compareActive ? Math.abs(m.pctOfRevenueBudgetB || 0) : 0
                        );
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
            const numTicks = data.length;
            const stepX = compareActive ? (numTicks > 1 ? (1114 - 80) / (numTicks - 1) : 1034) : 94;
            const getX = (idx: number) => {
                if (compareActive && data.length === 1) return 600;
                return startX + idx * stepX;
            };

            const renderLineSeries = (key: string, strokeColor: string, isDash: boolean = false) => {
                const points: { x: number; y: number; val: number }[] = [];
                const isBudget = key.toLowerCase().includes('budget');
                const mode = isBudget ? bMode : rMode;
                const showLabel = isBudget 
                    ? config?.showBudgetLabels !== 'false' 
                    : config?.showRealizedLabels !== 'false';
                
                data.forEach((m, monthIdx) => {
                    const val = m[key] || 0;
                    if (isBudget || isRealizedVisible(key, monthIdx)) {
                        const valScaled = getAbsValue(val, mode, monthIdx);
                        points.push({
                            x: getX(monthIdx),
                            y: getYAbs(valScaled),
                            val: valScaled
                        });
                    }
                });

                if (points.length === 0) return null;

                let pathD = `M ${points[0].x} ${points[0].y}`;
                for (let i = 1; i < points.length; i++) {
                    pathD += ` L ${points[i].x} ${points[i].y}`;
                }

                return (
                    <g key={`${key}-line`}>
                        <path 
                            d={pathD} 
                            fill="none" 
                            stroke={strokeColor} 
                            strokeWidth="2.5" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeDasharray={isDash ? '4 4' : undefined}
                        />
                        {points.map((p, idx) => (
                            <g key={idx}>
                                <circle cx={p.x} cy={p.y} r="4.5" fill="#ffffff" stroke={strokeColor} strokeWidth="2.5" />
                                {showLabel && p.val !== 0 && (
                                    <text 
                                        x={p.x} 
                                        y={p.y - 10} 
                                        textAnchor="middle" 
                                        fill="var(--text-secondary)" 
                                        fontSize="9px" 
                                        fontWeight="700"
                                        style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                    >
                                        {formatAbs(p.val, isDailyMode(mode))}
                                    </text>
                                )}
                            </g>
                        ))}
                    </g>
                );
            };

            // RENDER BARS (bar, diarias_bar)
            const activeBarKeys: string[] = [];
            if (compareActive) {
                if (isRatioChart) {
                    if (!hideBudget && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('budget');
                    if (!hideCompareBudget && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('compareBudget');
                    if (!hideBudgetB && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('budgetB');
                    if (!hideCompareBudgetB && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('compareBudgetB');
                    if (!hideRealized && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('realized');
                    if (!hideCompareRealized && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('compareRealized');
                    if (!hideRealizedB && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('realizedB');
                    if (!hideCompareRealizedB && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('compareRealizedB');
                } else {
                    if (!hideBudget && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('budget');
                    if (!hideRealized && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('realized');
                    if (!hideBudgetB && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('budgetB');
                    if (!hideRealizedB && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('realizedB');
                }
            } else {
                if (isRatioChart) {
                    if (!hideBudget && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('budget', 'compareBudget');
                    if (!hideRealized && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('realized', 'compareRealized');
                } else {
                    if (!hideBudget && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('budget');
                    if (!hideRealized && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('realized');
                }
            }

            const renderedBars = data.map((m, monthIdx) => {
                const xCenter = getX(monthIdx);
                const numBars = activeBarKeys.length;
                if (numBars === 0) return null;

                const groupWidth = compareActive ? (data.length === 1 ? 320 : stepX * 0.75) : 76;
                const spacing = 4;
                const barWidth = numBars > 0 
                    ? Math.min(48, Math.max(8, (groupWidth - (numBars - 1) * spacing) / numBars))
                    : 0;
                
                const extraGroupGap = (compareActive && data.length === 1 && numBars >= 4) ? 20 : 0;
                const actualGroupWidth = numBars * barWidth + (numBars - 1) * spacing + extraGroupGap;
                const startBarX = xCenter - (actualGroupWidth / 2);

                return activeBarKeys.map((key, keyIdx) => {
                    const isBudget = key.toLowerCase().includes('budget');
                    const mode = isBudget ? bMode : rMode;
                    const val = m[key] || 0;
                    const valScaled = getAbsValue(val, mode, monthIdx);

                    const extraGap = (compareActive && data.length === 1 && keyIdx >= 2) ? 20 : 0;
                    const barX = startBarX + keyIdx * (barWidth + spacing) + extraGap;
                    const isPositive = valScaled >= 0;
                    const hVal = Math.max(2, Math.abs(getYAbs(valScaled) - yBaseline));
                    const yVal = isPositive ? yBaseline - hVal : yBaseline;

                    let fill = '#cbd5e1';
                    if (compareActive && data.length === 1 && !isRatioChart) {
                        if (isBudget) fill = '#cbd5e1';
                        else fill = valScaled >= 0 ? chartColor : 'var(--accent-red)';
                    } else {
                        if (key === 'budget') fill = 'var(--border-strong)';
                        else if (key === 'realized') fill = valScaled >= 0 ? chartColor : 'var(--accent-red)';
                        else if (key === 'compareBudget') fill = '#e2e8f0';
                        else if (key === 'compareRealized') fill = valScaled >= 0 ? '#818cf8' : 'var(--accent-red)';
                        else if (key === 'budgetB') fill = '#fed7aa';
                        else if (key === 'realizedB') fill = valScaled >= 0 ? '#10b981' : 'var(--accent-red)';
                        else if (key === 'compareBudgetB') fill = '#ffedd5';
                        else if (key === 'compareRealizedB') fill = valScaled >= 0 ? '#f97316' : 'var(--accent-red)';
                    }

                    const shouldShow = isBudget || isRealizedVisible(key, monthIdx);

                    const showLabel = isBudget 
                        ? config?.showBudgetLabels !== 'false' 
                        : config?.showRealizedLabels !== 'false';

                    return (
                        <g key={`${monthIdx}-${key}`}>
                            {shouldShow && valScaled !== 0 && (
                                <>
                                    <rect 
                                        x={barX} 
                                        y={yVal} 
                                        width={barWidth} 
                                        height={hVal} 
                                        fill={fill} 
                                        rx="3"
                                    />
                                    {showLabel && (
                                        <text 
                                            x={barX + barWidth / 2} 
                                            y={isPositive ? yVal - 7 : yVal + hVal + 14} 
                                            textAnchor="middle" 
                                            fill="var(--text-secondary)" 
                                            fontSize="9px" 
                                            fontWeight="700"
                                            style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                        >
                                            {formatAbs(valScaled, isDailyMode(mode))}
                                        </text>
                                    )}
                                </>
                            )}
                        </g>
                    );
                });
            });

            // RENDER LEFT AXIS LINES (line_val, diarias_line)
            const leftLines: JSX.Element[] = [];

            if (compareActive) {
                if (isRatioChart) {
                    if (!hideBudget && (bMode === 'line_val' || bMode === 'diarias_line')) {
                        const l = renderLineSeries('budget', 'var(--text-muted)', true);
                        if (l) leftLines.push(l);
                        const lc = renderLineSeries('compareBudget', '#fed7aa', true);
                        if (lc) leftLines.push(lc);
                        
                        const lb = renderLineSeries('budgetB', '#fed7aa', true);
                        if (lb) leftLines.push(lb);
                        const lbc = renderLineSeries('compareBudgetB', '#ffedd5', true);
                        if (lbc) leftLines.push(lbc);
                    }
                    if (!hideRealized && (rMode === 'line_val' || rMode === 'diarias_line')) {
                        const l = renderLineSeries('realized', chartColor, false);
                        if (l) leftLines.push(l);
                        const lc = renderLineSeries('compareRealized', '#818cf8', false);
                        if (lc) leftLines.push(lc);
                        
                        const lb = renderLineSeries('realizedB', '#10b981', true);
                        if (lb) leftLines.push(lb);
                        const lbc = renderLineSeries('compareRealizedB', '#f97316', true);
                        if (lbc) leftLines.push(lbc);
                    }
                } else {
                    if (!hideBudget && (bMode === 'line_val' || bMode === 'diarias_line')) {
                        const l = renderLineSeries('budget', 'var(--text-muted)', true);
                        if (l) leftLines.push(l);
                        const lb = renderLineSeries('budgetB', '#fed7aa', true);
                        if (lb) leftLines.push(lb);
                    }
                    if (!hideRealized && (rMode === 'line_val' || rMode === 'diarias_line')) {
                        const l = renderLineSeries('realized', chartColor, false);
                        if (l) leftLines.push(l);
                        const lb = renderLineSeries('realizedB', '#10b981', true);
                        if (lb) leftLines.push(lb);
                    }
                }
            } else {
                if (isRatioChart) {
                    if (!hideBudget && (bMode === 'line_val' || bMode === 'diarias_line')) {
                        const l = renderLineSeries('budget', 'var(--text-muted)', true);
                        if (l) leftLines.push(l);
                        const lc = renderLineSeries('compareBudget', '#fed7aa', true);
                        if (lc) leftLines.push(lc);
                    }
                    if (!hideRealized && (rMode === 'line_val' || rMode === 'diarias_line')) {
                        const l = renderLineSeries('realized', chartColor);
                        if (l) leftLines.push(l);
                        const lc = renderLineSeries('compareRealized', '#f97316');
                        if (lc) leftLines.push(lc);
                    }
                } else {
                    if (!hideBudget && (bMode === 'line_val' || bMode === 'diarias_line')) {
                        const l = renderLineSeries('budget', 'var(--text-muted)', true);
                        if (l) leftLines.push(l);
                    }
                    if (!hideRealized && (rMode === 'line_val' || rMode === 'diarias_line')) {
                        const l = renderLineSeries('realized', chartColor);
                        if (l) leftLines.push(l);
                    }
                }
            }

            // RENDER RIGHT AXIS LINES (% lines)
            const rightLines: JSX.Element[] = [];

            if (atMode === 'line_atingido') {
                const renderAtingidoLine = (key: string, strokeColor: string, isB: boolean) => {
                    const points: { x: number; y: number; val: number }[] = [];
                    data.forEach((m, monthIdx) => {
                        if (isRealizedVisible(isB ? 'realizedB' : 'realized', monthIdx)) {
                            points.push({
                                x: getX(monthIdx),
                                y: getYPct(m[key]),
                                val: m[key]
                            });
                        }
                    });

                    if (points.length === 0) return null;

                    let pathD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                    }

                    return (
                        <g key={`${key}-line`}>
                            <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={isB ? '4 4' : undefined} />
                            {points.map((p, idx) => (
                                <g key={idx}>
                                    <circle cx={p.x} cy={p.y} r="4.5" fill={strokeColor} stroke="var(--bg-surface)" strokeWidth="1.5" />
                                    {config?.showAtingidoLabels !== 'false' && (
                                        <text 
                                            x={p.x} 
                                            y={p.y - 10} 
                                            textAnchor="middle" 
                                            fill={strokeColor} 
                                            fontSize="9px" 
                                            fontWeight="800"
                                            style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                        >
                                            {p.val.toFixed(1)}%
                                        </text>
                                    )}
                                </g>
                            ))}
                        </g>
                    );
                };

                const lA = renderAtingidoLine('atingido', '#10b981', false);
                if (lA) rightLines.push(lA);
                if (compareActive) {
                    const lB = renderAtingidoLine('atingidoB', '#ec4899', true);
                    if (lB) rightLines.push(lB);
                }
            }

            if (pctMode === 'line_revenue') {
                const renderPctRevenueLine = (key: string, strokeColor: string, isDash: boolean, isB: boolean, isBudget: boolean) => {
                    const points: { x: number; y: number; val: number }[] = [];
                    data.forEach((m, monthIdx) => {
                        const checkKey = isB ? (isBudget ? 'budgetB' : 'realizedB') : (isBudget ? 'budget' : 'realized');
                        if (isBudget || isRealizedVisible(checkKey, monthIdx)) {
                            points.push({
                                x: getX(monthIdx),
                                y: getYPct(m[key] || 0),
                                val: m[key] || 0
                            });
                        }
                    });

                    if (points.length === 0) return null;

                    let pathD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                    }

                    return (
                        <g key={`${key}-line`}>
                            <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeDasharray={isDash ? "4 4" : undefined} strokeLinecap="round" strokeLinejoin="round" />
                            {points.map((p, idx) => (
                                <g key={idx}>
                                    <circle cx={p.x} cy={p.y} r="4.5" fill={strokeColor} stroke="var(--bg-surface)" strokeWidth="1.5" />
                                    {config?.showPctOfRevenueLabels !== 'false' && p.val !== 0 && (
                                        <text 
                                            x={p.x} 
                                            y={p.y - 10} 
                                            textAnchor="middle" 
                                            fill={strokeColor} 
                                            fontSize="9px" 
                                            fontWeight="800"
                                            style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                        >
                                            {p.val.toFixed(1)}%
                                        </text>
                                    )}
                                </g>
                            ))}
                        </g>
                    );
                };

                if (compareActive) {
                    // Period A
                    if (!onlyRealized) {
                        const lA_B = renderPctRevenueLine('pctOfRevenueBudget', '#fed7aa', true, false, true);
                        if (lA_B) rightLines.push(lA_B);
                    }
                    const lA_R = renderPctRevenueLine('pctOfRevenue', '#f59e0b', false, false, false);
                    if (lA_R) rightLines.push(lA_R);
                    
                    // Period B
                    if (!onlyRealized) {
                        const lB_B = renderPctRevenueLine('pctOfRevenueBudgetB', '#a7f3d0', true, true, true);
                        if (lB_B) rightLines.push(lB_B);
                    }
                    const lB_R = renderPctRevenueLine('pctOfRevenueB', '#34d399', true, true, false);
                    if (lB_R) rightLines.push(lB_R);
                } else {
                    if (!onlyRealized) {
                        const l = renderPctRevenueLine('pctOfRevenueBudget', '#fed7aa', true, false, true);
                        if (l) rightLines.push(l);
                    }
                    const l = renderPctRevenueLine('pctOfRevenue', '#f59e0b', false, false, false);
                    if (l) rightLines.push(l);
                }
            }

            return (
                <svg viewBox="-70 0 1290 260" width="100%" height="100%" style={{ overflow: 'visible' }}>
                    {growth && (
                        <g transform="translate(600, 20)">
                            <rect x="-60" y="-12" width="120" height="24" rx="12" fill={growth.isGrowth ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'} stroke={growth.isGrowth ? '#10b981' : '#ef4444'} strokeWidth="1" />
                            <text textAnchor="middle" y="4" fill={growth.isGrowth ? '#10b981' : '#ef4444'} fontSize="11px" fontWeight="800">
                                {growth.text}
                            </text>
                        </g>
                    )}
                    {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, gridIdx) => {
                        const yGrid = yBaseline - ratio * 170;
                        return (
                            <line key={gridIdx} x1="40" y1={yGrid} x2="1160" y2={yGrid}
                                stroke={ratio === 0 ? 'var(--border-default)' : 'var(--border-subtle)'}
                                strokeWidth={ratio === 0 ? 1 : 0.5}
                                strokeDasharray={ratio === 0 ? undefined : '3 3'}
                            />
                        );
                    })}

                    <line x1="40" y1="0" x2="40" y2={yBaseline} stroke="var(--border-default)" strokeWidth="1" />
                    <line x1="1160" y1="0" x2="1160" y2={yBaseline} stroke="var(--border-default)" strokeWidth="1" />
                    <line x1="40" y1={yBaseline} x2="1160" y2={yBaseline} stroke="var(--border-default)" strokeWidth="1" />

                    {renderedBars}
                    {leftLines}
                    {rightLines}

                    {[0.25, 0.5, 0.75, 1.0].map((ratio, gridIdx) => {
                        const yGrid = yBaseline - ratio * 170;
                        return (
                            <g key={`label-${gridIdx}`}>
                                <text x="32" y={yGrid + 4} textAnchor="end" fill="var(--text-muted)" fontSize="11px" fontWeight="600"
                                    style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                                    {formatAbs(ratio * scaleMaxAbs, hasDailyActive)}
                                </text>
                                <text x="1168" y={yGrid + 4} textAnchor="start" fill="var(--text-muted)" fontSize="11px" fontWeight="600"
                                    style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                                    {(ratio * scaleMaxPct).toFixed(0)}%
                                </text>
                            </g>
                        );
                    })}

                    {data.map((m, idx) => (
                        <text key={idx} x={getX(idx)} y={yBaseline + 20} textAnchor="middle" fill="var(--text-secondary)" fontSize="13px" fontWeight="800">
                            {compareActive ? `${m.labelA} / ${m.labelB}` : ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                        </text>
                    ))}

                    {onHover && data.map((m, idx) => (
                        <rect
                            key={`hover-${idx}`}
                            x={getX(idx) - stepX / 2}
                            y={0}
                            width={stepX}
                            height={yBaseline + 30}
                            fill="transparent"
                            style={{ cursor: 'pointer' }}
                            onMouseMove={(e) => {
                                const items = [];
                                if (compareActive) {
                                    const { labelA, labelB } = compInfo;
                                    // Period A
                                    items.push({ label: `--- ${labelA} ---`, value: '', color: 'transparent' });
                                    if (bMode !== 'none' && !hideBudget) {
                                        items.push({ 
                                            label: isRatioChart ? `${baseLabel || 'Base'} (Orçado)` : 'Orçado', 
                                            value: formatAbs(getAbsValue(m.budget, bMode, idx), isDailyMode(bMode)), 
                                            color: 'var(--text-muted)' 
                                        });
                                        if (isRatioChart && !hideCompareBudget) {
                                            items.push({ 
                                                label: `${compareLabel || 'Comp'} (Orçado)`, 
                                                value: formatAbs(getAbsValue(m.compareBudget, bMode, idx), isDailyMode(bMode)), 
                                                color: '#fed7aa' 
                                            });
                                        }
                                    }
                                    if (rMode !== 'none' && !hideRealized && isRealizedVisible('realized', idx)) {
                                        items.push({ 
                                            label: isRatioChart ? `${baseLabel || 'Base'} (Realizado)` : 'Realizado', 
                                            value: formatAbs(getAbsValue(m.realized, rMode, idx), isDailyMode(rMode)), 
                                            color: chartColor 
                                        });
                                        if (isRatioChart && !hideCompareRealized && isRealizedVisible('compareRealized', idx)) {
                                            items.push({ 
                                                label: `${compareLabel || 'Comp'} (Realizado)`, 
                                                value: formatAbs(getAbsValue(m.compareRealized, rMode, idx), isDailyMode(rMode)), 
                                                color: '#818cf8' 
                                            });
                                        }
                                    }
                                    if (atMode !== 'none' && isRealizedVisible('realized', idx)) {
                                        items.push({ 
                                            label: isRatioChart ? 'Razão %' : 'Atingido', 
                                            value: `${m.atingido.toFixed(1)}%`, 
                                            color: '#10b981' 
                                        });
                                    }
                                    if (pctMode !== 'none') {
                                        if (!onlyRealized) {
                                            items.push({ 
                                                label: '% s/ Receita (Orçado)', 
                                                value: `${(m.pctOfRevenueBudget || 0).toFixed(1)}%`, 
                                                color: '#fed7aa' 
                                            });
                                        }
                                        if (isRealizedVisible('realized', idx)) {
                                            items.push({ 
                                                label: '% s/ Receita (Realizado)', 
                                                value: `${(m.pctOfRevenue || 0).toFixed(1)}%`, 
                                                color: '#f59e0b' 
                                            });
                                        }
                                    }

                                    // Period B
                                    items.push({ label: `--- ${labelB} ---`, value: '', color: 'transparent' });
                                    if (bMode !== 'none' && !hideBudgetB) {
                                        items.push({ 
                                            label: isRatioChart ? `${baseLabel || 'Base'} (Orçado)` : 'Orçado', 
                                            value: formatAbs(getAbsValue(m.budgetB, bMode, idx), isDailyMode(bMode)), 
                                            color: '#fed7aa' 
                                        });
                                        if (isRatioChart && !hideCompareBudgetB) {
                                            items.push({ 
                                                label: `${compareLabel || 'Comp'} (Orçado)`, 
                                                value: formatAbs(getAbsValue(m.compareBudgetB, bMode, idx), isDailyMode(bMode)), 
                                                color: '#ffedd5' 
                                            });
                                        }
                                    }
                                    if (rMode !== 'none' && !hideRealizedB && isRealizedVisible('realizedB', idx)) {
                                        items.push({ 
                                            label: isRatioChart ? `${baseLabel || 'Base'} (Realizado)` : 'Realizado', 
                                            value: formatAbs(getAbsValue(m.realizedB, rMode, idx), isDailyMode(rMode)), 
                                            color: '#10b981' 
                                        });
                                        if (isRatioChart && !hideCompareRealizedB && isRealizedVisible('compareRealizedB', idx)) {
                                            items.push({ 
                                                label: `${compareLabel || 'Comp'} (Realizado)`, 
                                                value: formatAbs(getAbsValue(m.compareRealizedB, rMode, idx), isDailyMode(rMode)), 
                                                color: '#f97316' 
                                            });
                                        }
                                    }
                                    if (atMode !== 'none' && isRealizedVisible('realizedB', idx)) {
                                        items.push({ 
                                            label: isRatioChart ? 'Razão %' : 'Atingido', 
                                            value: `${(m.atingidoB || 0).toFixed(1)}%`, 
                                            color: '#ec4899' 
                                        });
                                    }
                                    if (pctMode !== 'none') {
                                        if (!onlyRealized) {
                                            items.push({ 
                                                label: '% s/ Receita (Orçado)', 
                                                value: `${(m.pctOfRevenueBudgetB || 0).toFixed(1)}%`, 
                                                color: '#a7f3d0' 
                                            });
                                        }
                                        if (isRealizedVisible('realizedB', idx)) {
                                            items.push({ 
                                                label: '% s/ Receita (Realizado)', 
                                                value: `${(m.pctOfRevenueB || 0).toFixed(1)}%`, 
                                                color: '#34d399' 
                                            });
                                        }
                                    }
                                } else {
                                    if (bMode !== 'none' && !hideBudget) {
                                        const label = isRatioChart ? `${baseLabel || 'Base'} (Orçado)` : 'Orçado';
                                        items.push({ 
                                            label, 
                                            value: formatAbs(getAbsValue(m.budget, bMode, idx), isDailyMode(bMode)), 
                                            color: 'var(--text-muted)' 
                                        });
                                    }
                                    if (rMode !== 'none' && !hideRealized && idx <= currentMonthIdx) {
                                        const label = isRatioChart ? `${baseLabel || 'Base'} (Realizado)` : 'Realizado';
                                        items.push({ 
                                            label, 
                                            value: formatAbs(getAbsValue(m.realized, rMode, idx), isDailyMode(rMode)), 
                                            color: chartColor 
                                        });
                                    }
                                    if (isRatioChart) {
                                        if (bMode !== 'none' && !hideCompareBudget) {
                                            items.push({ 
                                                label: `${compareLabel || 'Comp'} (Orçado)`, 
                                                value: formatAbs(getAbsValue(m.compareBudget, bMode, idx), isDailyMode(bMode)), 
                                                color: '#fed7aa' 
                                            });
                                        }
                                        if (rMode !== 'none' && !hideCompareRealized && idx <= currentMonthIdx) {
                                            items.push({ 
                                                label: `${compareLabel || 'Comp'} (Realizado)`, 
                                                value: formatAbs(getAbsValue(m.compareRealized, rMode, idx), isDailyMode(rMode)), 
                                                color: '#f97316' 
                                            });
                                        }
                                    }
                                    if (atMode !== 'none' && idx <= currentMonthIdx) {
                                        items.push({ 
                                            label: isRatioChart ? 'Razão %' : 'Atingido', 
                                            value: `${m.atingido.toFixed(1)}%`, 
                                            color: '#10b981' 
                                        });
                                    }
                                    if (pctMode !== 'none') {
                                        if (!onlyRealized && !hideBudget) {
                                            items.push({ 
                                                label: '% s/ Receita (Orçado)', 
                                                value: `${(m.pctOfRevenueBudget || 0).toFixed(1)}%`, 
                                                color: '#fed7aa' 
                                            });
                                        }
                                        if (!hideRealized && idx <= currentMonthIdx) {
                                            items.push({ 
                                                label: '% s/ Receita (Realizado)', 
                                                value: `${(m.pctOfRevenue || 0).toFixed(1)}%`, 
                                                color: '#f59e0b' 
                                            });
                                        }
                                    }
                                }

                                onHover({
                                    x: e.clientX,
                                    y: e.clientY,
                                    title: compareActive
                                        ? `${m.labelA} vs ${m.labelB} de ${year}`
                                        : `${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][idx]} de ${year}`,
                                    items
                                });
                            }}
                            onMouseLeave={() => onHover(null)}
                        />
                        )
                    )}
                </svg>
            );
        }

        case 'VERTICAL_BAR': {
            const yBaseline = hasNegative ? 130 : 210;
            const maxBarHeight = hasNegative ? 100 : 165;
            const scaleMaxVal = maxVal * 1.20;

            const compareActive = compInfo !== null;
            const numTicks = data.length;
            const stepX = compareActive ? (1060 / numTicks) : 94;
            const startX = 80;
            const getX = (idx: number) => {
                if (compareActive && data.length === 1) return 600 - stepX / 2;
                return startX + idx * stepX;
            };

            const activeBarKeys: string[] = [];
            if (compareActive) {
                if (isRatioChart) {
                    if (!hideBudget) activeBarKeys.push('budget');
                    if (!hideCompareBudget) activeBarKeys.push('compareBudget');
                    if (!hideBudgetB) activeBarKeys.push('budgetB');
                    if (!hideCompareBudgetB) activeBarKeys.push('compareBudgetB');
                    if (!hideRealized) activeBarKeys.push('realized');
                    if (!hideCompareRealized) activeBarKeys.push('compareRealized');
                    if (!hideRealizedB) activeBarKeys.push('realizedB');
                    if (!hideCompareRealizedB) activeBarKeys.push('compareRealizedB');
                } else {
                    if (!hideBudget) activeBarKeys.push('budget');
                    if (!hideRealized) activeBarKeys.push('realized');
                    if (!hideBudgetB) activeBarKeys.push('budgetB');
                    if (!hideRealizedB) activeBarKeys.push('realizedB');
                }
            } else {
                if (isRatioChart) {
                    if (!hideBudget) activeBarKeys.push('budget');
                    if (!hideCompareBudget) activeBarKeys.push('compareBudget');
                    if (!hideRealized) activeBarKeys.push('realized');
                    if (!hideCompareRealized) activeBarKeys.push('compareRealized');
                } else {
                    if (!hideBudget) activeBarKeys.push('budget');
                    if (!hideRealized) activeBarKeys.push('realized');
                }
            }

            const renderedBars = data.map((m, idx) => {
                const xCenter = getX(idx);
                const numBars = activeBarKeys.length;
                if (numBars === 0) return null;

                const groupWidth = compareActive ? (data.length === 1 ? 320 : stepX * 0.75) : 76;
                const spacing = 4;
                const barWidth = numBars > 0 
                    ? Math.min(48, Math.max(8, (groupWidth - (numBars - 1) * spacing) / numBars))
                    : 0;
                
                const extraGroupGap = (compareActive && data.length === 1 && numBars >= 4) ? 20 : 0;
                const actualGroupWidth = numBars * barWidth + (numBars - 1) * spacing + extraGroupGap;
                const startBarX = xCenter + (stepX - actualGroupWidth) / 2;

                return activeBarKeys.map((key, keyIdx) => {
                    const isRealized = !key.toLowerCase().includes('budget');
                    if (isRealized && !isRealizedVisible(key, idx)) return null;

                    const val = getVal(key, m);
                    if (val === 0) return null;

                    const extraGap = (compareActive && data.length === 1 && keyIdx >= 2) ? 20 : 0;
                    const barX = startBarX + keyIdx * (barWidth + spacing) + extraGap;
                    const isPositive = val >= 0;
                    const hVal = Math.max(2, (Math.abs(val) / scaleMaxVal) * maxBarHeight);
                    const yVal = isPositive ? yBaseline - hVal : yBaseline;

                    let fill = '#cbd5e1';
                    if (compareActive && data.length === 1 && !isRatioChart) {
                        const isBudget = !isRealized;
                        if (isBudget) fill = '#cbd5e1';
                        else fill = val >= 0 ? chartColor : 'var(--accent-red)';
                    } else {
                        if (key === 'budget') fill = 'var(--border-strong)';
                        else if (key === 'realized') fill = val >= 0 ? chartColor : 'var(--accent-red)';
                        else if (key === 'compareBudget') fill = '#e2e8f0';
                        else if (key === 'compareRealized') fill = val >= 0 ? '#818cf8' : 'var(--accent-red)';
                        else if (key === 'budgetB') fill = '#fed7aa';
                        else if (key === 'realizedB') fill = val >= 0 ? '#10b981' : 'var(--accent-red)';
                        else if (key === 'compareBudgetB') fill = '#ffedd5';
                        else if (key === 'compareRealizedB') fill = val >= 0 ? '#f97316' : 'var(--accent-red)';
                    }

                    const labelY = isPositive ? yVal - 8 : yVal + hVal + 17;
                    const labelColor = isRealized ? (val >= 0 ? chartColor : '#7f1d1d') : 'var(--text-secondary)';

                    return (
                        <g key={`${idx}-${key}`}>
                            <rect 
                                x={barX} 
                                y={yVal} 
                                width={barWidth} 
                                height={hVal} 
                                fill={fill} 
                                rx="3" 
                            />
                            <text 
                                x={barX + barWidth / 2} 
                                y={labelY} 
                                textAnchor="middle" 
                                fill={labelColor} 
                                fontSize="11px" 
                                fontWeight="700"
                                style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                            >
                                {formatVal(val)}
                            </text>
                        </g>
                    );
                });
            });

            return (
                <svg viewBox="-70 0 1270 260" width="100%" height="100%" style={{ overflow: 'visible', maxHeight: '250px' }}>
                    {growth && (
                        <g transform="translate(600, 20)">
                            <rect x="-60" y="-12" width="120" height="24" rx="12" fill={growth.isGrowth ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'} stroke={growth.isGrowth ? '#10b981' : '#ef4444'} strokeWidth="1" />
                            <text textAnchor="middle" y="4" fill={growth.isGrowth ? '#10b981' : '#ef4444'} fontSize="11px" fontWeight="800">
                                {growth.text}
                            </text>
                        </g>
                    )}
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

                    <text x="75" y={hasNegative ? 74 : 54} textAnchor="end" fill="var(--text-muted)" fontSize="12px" fontWeight="700"
                        style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(scaleMaxVal)}</text>
                    <text x="75" y={yBaseline + 4} textAnchor="end" fill="var(--text-muted)" fontSize="12px" fontWeight="700"
                        style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(0)}</text>
                    {hasNegative && (
                        <text x="75" y="194" textAnchor="end" fill="var(--text-muted)" fontSize="12px" fontWeight="700"
                            style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(-scaleMaxVal)}</text>
                    )}

                    {renderedBars}

                    {data.map((m, idx) => (
                        <text key={idx} x={getX(idx) + stepX / 2} y="242" textAnchor="middle" fill="var(--text-muted)" fontSize="13px" fontWeight="700">
                            {compareActive ? `${m.labelA} / ${m.labelB}` : ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                        </text>
                    ))}

                    {/* Hover tooltip zones */}
                    {onHover && data.map((m, idx) => {
                        const xBase = getX(idx);
                        return (
                            <rect
                                key={`hover-${idx}`}
                                x={xBase}
                                y={0}
                                width={stepX}
                                height={yBaseline + 30}
                                fill="transparent"
                                style={{ cursor: 'pointer' }}
                                onMouseMove={(e) => {
                                    const items = [];
                                    if (compareActive) {
                                        const { labelA, labelB } = compInfo;
                                        // Period A
                                        items.push({ label: `--- ${labelA} ---`, value: '', color: 'transparent' });
                                        if (!hideBudget) {
                                            items.push({ label: isRatioChart ? `${baseLabel || 'Base'} (Orçado)` : 'Orçado', value: formatVal(getVal('budget', m)), color: '#cbd5e1' });
                                            if (isRatioChart && !hideCompareBudget) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Orçado)`, value: formatVal(getVal('compareBudget', m)), color: '#cbd5e1' });
                                            }
                                        }
                                        if (!hideRealized && isRealizedVisible('realized', idx)) {
                                            items.push({ label: isRatioChart ? `${baseLabel || 'Base'} (Realizado)` : 'Realizado', value: formatVal(getVal('realized', m)), color: chartColor });
                                            if (isRatioChart && !hideCompareRealized) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Realizado)`, value: formatVal(getVal('compareRealized', m)), color: chartColor });
                                            }
                                        }
                                        // Period B
                                        items.push({ label: `--- ${labelB} ---`, value: '', color: 'transparent' });
                                        if (!hideBudgetB) {
                                            items.push({ label: isRatioChart ? `${baseLabel || 'Base'} (Orçado)` : 'Orçado', value: formatVal(getVal('budgetB', m)), color: '#fed7aa' });
                                            if (isRatioChart && !hideCompareBudgetB) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Orçado)`, value: formatVal(getVal('compareBudgetB', m)), color: '#fed7aa' });
                                            }
                                        }
                                        if (!hideRealizedB && isRealizedVisible('realizedB', idx)) {
                                            items.push({ label: isRatioChart ? `${baseLabel || 'Base'} (Realizado)` : 'Realizado', value: formatVal(getVal('realizedB', m)), color: '#10b981' });
                                            if (isRatioChart && !hideCompareRealizedB) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Realizado)`, value: formatVal(getVal('compareRealizedB', m)), color: '#10b981' });
                                            }
                                        }
                                    } else {
                                        if (!hideBudget) {
                                            const valB = pctOfRevenue ? (m.pctOfRevenueBudget || 0) : m.budget;
                                            items.push({ label: 'Orçado', value: formatVal(valB), color: '#cbd5e1' });
                                            if (isRatioChart && !hideCompareBudget) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Orçado)`, value: formatVal(m.compareBudget || 0), color: '#fed7aa' });
                                            }
                                        }
                                        if (!hideRealized && idx <= currentMonthIdx) {
                                            const valR = pctOfRevenue ? (m.pctOfRevenue || 0) : m.realized;
                                            items.push({ label: 'Realizado', value: formatVal(valR), color: chartColor });
                                            if (isRatioChart && !hideCompareRealized) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Realizado)`, value: formatVal(m.compareRealized || 0), color: '#f97316' });
                                            }
                                        }
                                    }

                                    onHover({
                                        x: e.clientX,
                                        y: e.clientY,
                                        title: compareActive
                                            ? `${m.labelA} vs ${m.labelB} de ${year}`
                                            : `${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][idx]} de ${year}`,
                                        items
                                    });
                                }}
                                onMouseLeave={() => onHover(null)}
                            />
                        );
                    })}
                </svg>
            );
        }

        case 'LINE':
        case 'LINE_MARKERS': {
            const yBaseline = hasNegative ? 130 : 210;
            const maxLineHeight = hasNegative ? 100 : 165;
            const scaleMaxVal = maxVal * 1.20;

            const compareActive = compInfo !== null;
            const numTicks = data.length;
            const stepX = compareActive ? (numTicks > 1 ? 1060 / (numTicks - 1) : 1060) : 94;
            const startX = 80;
            const getX = (idx: number) => {
                if (compareActive && data.length === 1) return 600;
                return startX + idx * stepX;
            };

            interface LineSeries {
                key: string;
                strokeColor: string;
                isDash: boolean;
                isRealized: boolean;
                label: string;
                markerColor: string;
            }

            const seriesList: LineSeries[] = [];
            if (compareActive) {
                if (isRatioChart) {
                    if (!hideBudget) {
                        seriesList.push({ key: 'budget', strokeColor: 'var(--text-muted)', isDash: true, isRealized: false, label: `${baseLabel || 'Base'} (Orçado)`, markerColor: 'var(--text-muted)' });
                    }
                    if (!hideCompareBudget) {
                        seriesList.push({ key: 'compareBudget', strokeColor: '#fed7aa', isDash: true, isRealized: false, label: `${compareLabel || 'Comp'} (Orçado)`, markerColor: '#fed7aa' });
                    }
                    if (!hideBudgetB) {
                        seriesList.push({ key: 'budgetB', strokeColor: '#fed7aa', isDash: true, isRealized: false, label: `${baseLabel || 'Base'} (Orçado) B`, markerColor: '#fed7aa' });
                    }
                    if (!hideCompareBudgetB) {
                        seriesList.push({ key: 'compareBudgetB', strokeColor: '#ffedd5', isDash: true, isRealized: false, label: `${compareLabel || 'Comp'} (Orçado) B`, markerColor: '#ffedd5' });
                    }
                    if (!hideRealized) {
                        seriesList.push({ key: 'realized', strokeColor: chartColor, isDash: false, isRealized: true, label: `${baseLabel || 'Base'} (Realizado)`, markerColor: chartColor });
                    }
                    if (!hideCompareRealized) {
                        seriesList.push({ key: 'compareRealized', strokeColor: '#818cf8', isDash: false, isRealized: true, label: `${compareLabel || 'Comp'} (Realizado)`, markerColor: '#818cf8' });
                    }
                    if (!hideRealizedB) {
                        seriesList.push({ key: 'realizedB', strokeColor: '#10b981', isDash: true, isRealized: true, label: `${baseLabel || 'Base'} (Realizado) B`, markerColor: '#10b981' });
                    }
                    if (!hideCompareRealizedB) {
                        seriesList.push({ key: 'compareRealizedB', strokeColor: '#f97316', isDash: true, isRealized: true, label: `${compareLabel || 'Comp'} (Realizado) B`, markerColor: '#f97316' });
                    }
                } else {
                    if (!hideBudget) {
                        seriesList.push({ key: 'budget', strokeColor: 'var(--text-muted)', isDash: true, isRealized: false, label: 'Orçado', markerColor: 'var(--text-muted)' });
                    }
                    if (!hideBudgetB) {
                        seriesList.push({ key: 'budgetB', strokeColor: '#fed7aa', isDash: true, isRealized: false, label: 'Orçado B', markerColor: '#fed7aa' });
                    }
                    if (!hideRealized) {
                        seriesList.push({ key: 'realized', strokeColor: chartColor, isDash: false, isRealized: true, label: 'Realizado', markerColor: chartColor });
                    }
                    if (!hideRealizedB) {
                        seriesList.push({ key: 'realizedB', strokeColor: '#10b981', isDash: true, isRealized: true, label: 'Realizado B', markerColor: '#10b981' });
                    }
                }
            } else {
                if (isRatioChart) {
                    if (!hideBudget) {
                        seriesList.push({ key: 'budget', strokeColor: 'var(--text-muted)', isDash: true, isRealized: false, label: `${baseLabel || 'Base'} (Orçado)`, markerColor: 'var(--text-muted)' });
                    }
                    if (!hideCompareBudget) {
                        seriesList.push({ key: 'compareBudget', strokeColor: '#fed7aa', isDash: true, isRealized: false, label: `${compareLabel || 'Comp'} (Orçado)`, markerColor: '#fed7aa' });
                    }
                    if (!hideRealized) {
                        seriesList.push({ key: 'realized', strokeColor: chartColor, isDash: false, isRealized: true, label: `${baseLabel || 'Base'} (Realizado)`, markerColor: chartColor });
                    }
                    if (!hideCompareRealized) {
                        seriesList.push({ key: 'compareRealized', strokeColor: '#f97316', isDash: false, isRealized: true, label: `${compareLabel || 'Comp'} (Realizado)`, markerColor: '#f97316' });
                    }
                } else {
                    if (!hideBudget) {
                        seriesList.push({ key: 'budget', strokeColor: 'var(--text-muted)', isDash: true, isRealized: false, label: 'Orçado', markerColor: 'var(--text-muted)' });
                    }
                    if (!hideRealized) {
                        seriesList.push({ key: 'realized', strokeColor: chartColor, isDash: false, isRealized: true, label: 'Realizado', markerColor: chartColor });
                    }
                }
            }

            const pathsAndMarkers = seriesList.map((series) => {
                const points: { x: number; y: number; val: number }[] = [];
                let pathD = '';

                data.forEach((m, idx) => {
                    if (series.isRealized && !isRealizedVisible(series.key, idx)) {
                        return;
                    }
                    const val = getLineVal(series.key, m);
                    const x = getX(idx);
                    const y = yBaseline - (val / scaleMaxVal) * maxLineHeight;
                    points.push({ x, y, val });
                    pathD += (pathD === '' ? 'M' : 'L') + ` ${x} ${y}`;
                });

                if (points.length === 0) return null;

                return (
                    <g key={series.key}>
                        {pathD && (
                            <path 
                                d={pathD} 
                                fill="none" 
                                stroke={series.strokeColor} 
                                strokeWidth={series.isRealized ? "3" : "2.5"} 
                                strokeDasharray={series.isDash ? "4 4" : undefined} 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                            />
                        )}
                        {chartMode === 'LINE_MARKERS' && points.map((p, pIdx) => (
                            <g key={pIdx}>
                                <circle 
                                    cx={p.x} 
                                    cy={p.y} 
                                    r={series.isRealized ? "5" : "4"} 
                                    fill={series.markerColor} 
                                    stroke="var(--bg-surface)" 
                                    strokeWidth={series.isRealized ? "2" : "1.5"} 
                                />
                                {p.val !== 0 && (
                                    <text 
                                        x={p.x} 
                                        y={p.y - 12} 
                                        textAnchor="middle" 
                                        fill={series.isRealized ? series.strokeColor : "var(--text-secondary)"} 
                                        fontSize="11px" 
                                        fontWeight={series.isRealized ? "800" : "700"}
                                        style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                    >
                                        {formatVal(p.val)}
                                    </text>
                                )}
                            </g>
                        ))}
                    </g>
                );
            });

            return (
                <svg viewBox="-70 0 1270 260" width="100%" height="100%" style={{ overflow: 'visible', maxHeight: '250px' }}>
                    {growth && (
                        <g transform="translate(600, 20)">
                            <rect x="-60" y="-12" width="120" height="24" rx="12" fill={growth.isGrowth ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'} stroke={growth.isGrowth ? '#10b981' : '#ef4444'} strokeWidth="1" />
                            <text textAnchor="middle" y="4" fill={growth.isGrowth ? '#10b981' : '#ef4444'} fontSize="11px" fontWeight="800">
                                {growth.text}
                            </text>
                        </g>
                    )}
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

                    <text x="75" y={hasNegative ? 74 : 54} textAnchor="end" fill="var(--text-muted)" fontSize="12px" fontWeight="700"
                        style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(scaleMaxVal)}</text>
                    <text x="75" y={yBaseline + 4} textAnchor="end" fill="var(--text-muted)" fontSize="12px" fontWeight="700"
                        style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(0)}</text>
                    {hasNegative && (
                        <text x="75" y="194" textAnchor="end" fill="var(--text-muted)" fontSize="12px" fontWeight="700"
                            style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(-scaleMaxVal)}</text>
                    )}

                    {pathsAndMarkers}

                    {data.map((m, idx) => (
                        <text key={idx} x={getX(idx)} y="242" textAnchor="middle" fill="var(--text-muted)" fontSize="13px" fontWeight="700">
                            {compareActive ? `${m.labelA} / ${m.labelB}` : ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                        </text>
                    ))}

                    {/* Hover tooltip zones */}
                    {onHover && data.map((m, idx) => {
                        const xCenter = getX(idx);
                        const stepWidth = compareActive ? stepX : 94;
                        const xLeft = xCenter - stepWidth / 2;
                        return (
                            <rect
                                key={`hover-${idx}`}
                                x={xLeft}
                                y={0}
                                width={stepWidth}
                                height={yBaseline + 30}
                                fill="transparent"
                                style={{ cursor: 'pointer' }}
                                onMouseMove={(e) => {
                                    const items = [];
                                    if (compareActive) {
                                        const { labelA, labelB } = compInfo;
                                        // Period A
                                        items.push({ label: `--- ${labelA} ---`, value: '', color: 'transparent' });
                                        if (!hideBudget) {
                                            items.push({ label: isRatioChart ? `${baseLabel || 'Base'} (Orçado)` : 'Orçado', value: formatVal(getVal('budget', m)), color: 'var(--text-muted)' });
                                            if (isRatioChart && !hideCompareBudget) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Orçado)`, value: formatVal(getVal('compareBudget', m)), color: '#fed7aa' });
                                            }
                                        }
                                        if (!hideRealized && isRealizedVisible('realized', idx)) {
                                            items.push({ label: isRatioChart ? `${baseLabel || 'Base'} (Realizado)` : 'Realizado', value: formatVal(getVal('realized', m)), color: chartColor });
                                            if (isRatioChart && !hideCompareRealized) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Realizado)`, value: formatVal(getVal('compareRealized', m)), color: '#818cf8' });
                                            }
                                        }
                                        // Period B
                                        items.push({ label: `--- ${labelB} ---`, value: '', color: 'transparent' });
                                        if (!hideBudgetB) {
                                            items.push({ label: isRatioChart ? `${baseLabel || 'Base'} (Orçado)` : 'Orçado', value: formatVal(getVal('budgetB', m)), color: '#fed7aa' });
                                            if (isRatioChart && !hideCompareBudgetB) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Orçado)`, value: formatVal(getVal('compareBudgetB', m)), color: '#ffedd5' });
                                            }
                                        }
                                        if (!hideRealizedB && isRealizedVisible('realizedB', idx)) {
                                            items.push({ label: isRatioChart ? `${baseLabel || 'Base'} (Realizado)` : 'Realizado', value: formatVal(getVal('realizedB', m)), color: '#10b981' });
                                            if (isRatioChart && !hideCompareRealizedB) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Realizado)`, value: formatVal(getVal('compareRealizedB', m)), color: '#f97316' });
                                            }
                                        }
                                    } else {
                                        if (!hideBudget) {
                                            const valB = pctOfRevenue ? (m.pctOfRevenueBudget || 0) : m.budget;
                                            items.push({ label: 'Orçado', value: formatVal(valB), color: 'var(--text-muted)' });
                                            if (isRatioChart && !hideCompareBudget) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Orçado)`, value: formatVal(m.compareBudget || 0), color: '#fed7aa' });
                                            }
                                        }
                                        if (!hideRealized && idx <= currentMonthIdx) {
                                            const valR = pctOfRevenue ? (m.pctOfRevenue || 0) : m.realized;
                                            items.push({ label: 'Realizado', value: formatVal(valR), color: chartColor });
                                            if (isRatioChart) {
                                                items.push({ label: `${compareLabel || 'Comp'} (Realizado)`, value: formatVal(m.compareRealized || 0), color: '#f97316' });
                                            }
                                        }
                                    }

                                    onHover({
                                        x: e.clientX,
                                        y: e.clientY,
                                        title: compareActive
                                            ? `${m.labelA} vs ${m.labelB} de ${year}`
                                            : `${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][idx]} de ${year}`,
                                        items
                                    });
                                }}
                                onMouseLeave={() => onHover(null)}
                            />
                        );
                    })}
                </svg>
            );
        }

        case 'PIE':
        case 'DONUT': {
            if (hideRealized) return null;
            
            const isDimensional = dimension !== 'none';
            
            const totalRealizedSum = isDimensional
                ? data.reduce((acc, slice) => acc + Math.max(0, slice.realized || 0), 0)
                : data.reduce((acc, m, idx) => acc + (idx + 1 <= currentMonthIdx + 1 ? Math.max(0, m.realized) : 0), 0);
            
            if (totalRealizedSum <= 0) {
                return (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px dashed var(--border-default)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-red)' }}>
                        ⚠️ Sem dados positivos de Realizado para exibir em Pizza.
                    </div>
                );
            }

            const cx = 250;
            const cy = 130;
            const R = 70;
            let cumulativeAngleSlices = 0;
            let cumulativeAngleLabels = 0;

            return (
                <svg viewBox="0 0 500 260" width="100%" height="100%" style={{ overflow: 'visible' }}>
                    {data.map((m, idx) => {
                        const val = isDimensional ? Math.max(0, m.realized || 0) : (idx + 1 <= currentMonthIdx + 1 ? Math.max(0, m.realized) : 0);
                        if (val === 0) return null;

                        const percentage = (val / totalRealizedSum) * 100;
                        const angle = (val / totalRealizedSum) * 360;

                        const radStart = (cumulativeAngleSlices - 90) * Math.PI / 180;
                        const radEnd = (cumulativeAngleSlices + angle - 90) * Math.PI / 180;

                        const x1 = cx + R * Math.cos(radStart);
                        const y1 = cy + R * Math.sin(radStart);
                        const x2 = cx + R * Math.cos(radEnd);
                        const y2 = cy + R * Math.sin(radEnd);

                        const largeArc = angle > 180 ? 1 : 0;
                        const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                        cumulativeAngleSlices += angle;
                        const sliceOpacity = 1 - (idx * 0.05);

                        const labelText = (isDimensional ? m.label : ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][idx]) || '';

                        return (
                            <path 
                                key={idx} 
                                d={pathData} 
                                fill={chartColor} 
                                fillOpacity={sliceOpacity}
                                stroke="var(--bg-surface)" 
                                strokeWidth="1.5"
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.fillOpacity = String(Math.max(0.2, sliceOpacity - 0.15));
                                }}
                                onMouseMove={(e) => {
                                    if (onHover) {
                                        onHover({
                                            x: e.clientX,
                                            y: e.clientY,
                                            title: isDimensional ? `${labelText} (${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][startMonth]} - ${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][endMonth]})` : `${labelText} de ${year}`,
                                            items: [
                                                { label: 'Realizado', value: formatVal(val), color: chartColor },
                                                { label: 'Proporção', value: `${percentage.toFixed(1)}%`, color: '#f59e0b' }
                                            ]
                                        });
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.fillOpacity = String(sliceOpacity);
                                    if (onHover) onHover(null);
                                }}
                                style={{ transition: 'fill-opacity 0.2s', cursor: 'pointer' }}
                            />
                        );
                    })}

                    {(chartMode === 'DONUT' || type === 'DONUT') && (
                        <>
                            <circle cx={cx} cy={cy} r="44" fill="var(--bg-surface)" />
                            <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="9px" fontWeight="700" textTransform="uppercase" letterSpacing="0.05em">Total Realiz.</text>
                            <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text-primary)" fontSize="13px" fontWeight="700">{formatVal(totalRealizedSum)}</text>
                        </>
                    )}

                    {data.map((m, idx) => {
                        const val = isDimensional ? Math.max(0, m.realized || 0) : (idx + 1 <= currentMonthIdx + 1 ? Math.max(0, m.realized) : 0);
                        if (val === 0) return null;

                        const percentage = (val / totalRealizedSum) * 100;
                        const angle = (val / totalRealizedSum) * 360;
                        const midAngle = cumulativeAngleLabels + angle / 2;
                        const radMid = (midAngle - 90) * Math.PI / 180;
                        cumulativeAngleLabels += angle;

                        if (percentage < 3) return null;

                        const textAnchor = Math.cos(radMid) > 0.05 ? 'start' : (Math.cos(radMid) < -0.05 ? 'end' : 'middle');
                        const labelR = textAnchor === 'middle' ? R + 22 : R + 14;
                        const tx = cx + labelR * Math.cos(radMid);
                        const ty = cy + labelR * Math.sin(radMid);
                        
                        const sx = cx + R * Math.cos(radMid);
                        const sy = cy + R * Math.sin(radMid);
                        const ex = cx + (R + 6) * Math.cos(radMid);
                        const ey = cy + (R + 6) * Math.sin(radMid);

                        const labelText = (isDimensional ? m.label : ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][idx]) || '';
                        const displayLabel = labelText.length > 20 ? labelText.substring(0, 18) + '..' : labelText;

                        return (
                            <g key={`lbl-grp-${idx}`}>
                                <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="var(--border-strong)" strokeWidth="0.8" />
                                <text x={tx} y={ty} textAnchor={textAnchor} fill="var(--text-secondary)" fontSize="12px" fontWeight="700" style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                                    <tspan x={tx} dy="-2">{displayLabel}</tspan>
                                    <tspan x={tx} dy="12" fill="var(--text-muted)" fontSize="10px" fontWeight="500">{formatVal(val)} ({percentage.toFixed(1)}%)</tspan>
                                </text>
                            </g>
                        );
                    })}
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
                <svg 
                    viewBox="0 0 400 230" 
                    width="100%" 
                    height="220px" 
                    style={{ overflow: 'visible' }}
                    onMouseMove={(e) => {
                        if (onHover) {
                            onHover({
                                x: e.clientX,
                                y: e.clientY,
                                title: `Atingimento de Meta - ${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][mainMonth - 1]}`,
                                items: [
                                    { label: 'Atingido', value: `${atingido.toFixed(1)}%`, color: chartColor },
                                    { label: 'Orçado', value: formatVal(pctOfRevenue ? mData.pctOfRevenue : mData.budget), color: '#cbd5e1' },
                                    { label: 'Realizado', value: formatVal(pctOfRevenue ? mData.pctOfRevenue : mData.realized), color: chartColor }
                                ]
                            });
                        }
                    }}
                    onMouseLeave={() => {
                        if (onHover) onHover(null);
                    }}
                >
                    <path d={getArcPath(cx, cy, R, 0, 63)} fill="none" stroke="var(--accent-red)" strokeWidth="22" strokeLinecap="butt" />
                    <path d={getArcPath(cx, cy, R, 63, 85.5)} fill="none" stroke="#f59e0b" strokeWidth="22" strokeLinecap="butt" />
                    <path d={getArcPath(cx, cy, R, 85.5, 99)} fill="none" stroke="var(--accent-green)" strokeWidth="22" strokeLinecap="butt" />
                    <path d={getArcPath(cx, cy, R, 99, 180)} fill="none" stroke="var(--accent-blue)" strokeWidth="22" strokeLinecap="butt" />

                    <text x={cx - R - 15} y={cy + 6} textAnchor="middle" fill="var(--text-muted)" fontSize="12.5px" fontWeight="800">0%</text>
                    <text x={cx} y={cy - R - 12} textAnchor="middle" fill="var(--text-muted)" fontSize="12.5px" fontWeight="800">100%</text>
                    <text x={cx + R + 18} y={cy + 6} textAnchor="middle" fill="var(--text-muted)" fontSize="12.5px" fontWeight="800">200%+</text>

                    <polygon points={`${cx - 2},${cy} ${needleX},${needleY} ${cx + 2},${cy}`} fill="var(--text-primary)" />
                    <circle cx={cx} cy={cy} r="8.5" fill="var(--text-primary)" stroke="var(--bg-surface)" strokeWidth="2" />

                    <text x={cx} y={cy + 32} textAnchor="middle" fill={chartColor} fontSize="18px" fontWeight="800">
                        {atingido.toFixed(1)}% Atingido
                    </text>
                    <text x={cx} y={cy + 52} textAnchor="middle" fill="var(--text-secondary)" fontSize="12.5px" fontWeight="700">
                        No mês de {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][mainMonth - 1]}
                    </text>
                </svg>
            );
        }

        default:
            return null;
    }
};
