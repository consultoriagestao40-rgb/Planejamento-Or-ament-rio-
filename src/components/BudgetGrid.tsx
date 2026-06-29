'use client';
// V47.130 - Hierarchical Indentation Fix (Recursive Leveling + Deep Padding)

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MONTHS, MOCK_COST_CENTERS } from '@/lib/mock-data';
import { ExcelPasteModal } from '@/components/ExcelPasteModal';

// Robust normalization for names (Accents, [INATIVO], Code prefixes)
const normalizeName = (name: string) => 
    (name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/^\[INATIVO\]\s*/i, '')
        .replace(/^[0-9.]+\s*-\s*/, '')
        .toUpperCase().trim();

interface BudgetGridProps {
    refreshKey?: number;
    isExternalLoading?: boolean;
    showAV: boolean;
    setShowAV: (val: boolean) => void;
    showAH: boolean;
    setShowAH: (val: boolean) => void;
    showAH_MoM: boolean;
    setShowAH_MoM: (val: boolean) => void;
    showAR: boolean;
    setShowAR: (val: boolean) => void;
    userRole: 'MASTER' | 'GESTOR';
    setUserRole: (val: 'MASTER' | 'GESTOR') => void;
    companies: any[];
    externalYear?: number;
    searchQuery?: string;
    activeTab?: 'visao' | 'graficos' | 'kpi';
}

const MONTH_ABBRS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface CategoryNode {
    id: string;
    name: string;
    parentId: string | null;
    children: CategoryNode[];
    level: number;
    type?: string;
    code?: string;
    isSynthetic?: boolean;
    tenantId?: string;
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
    'synth-3.10': '03.10 Custos Transferidos',
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
    'synth-6.8': '06.8 PDD',
    'synth-6.9': '06.9 Dividas'
};

export default function BudgetGrid({
    refreshKey = 0,
    isExternalLoading = false,
    showAV,
    setShowAV,
    showAH,
    setShowAH,
    showAH_MoM,
    setShowAH_MoM,
    showAR,
    setShowAR,
    userRole,
    setUserRole,
    companies = [],
    externalYear = new Date().getFullYear(),
    searchQuery = '',
    activeTab = 'visao'
}: BudgetGridProps) {
    const [internalRefresh, setInternalRefresh] = useState(0);
    const triggerRefresh = () => setInternalRefresh((prev: number) => prev + 1);

    const [budgetValues, setBudgetValues] = useState<Record<string, { amount: number, radarAmount: number | null, isLocked: boolean, observation?: string | null, compositionItems?: any[] }>>({});
    const [isCCLocked, setIsCCLocked] = useState(false);
    const [radarLocks, setRadarLocks] = useState<any[]>([]);
    const [realizedValues, setRealizedValues] = useState<Record<string, number>>({});
    const [contractsData, setContractsData] = useState<{ name: string; value: number; percentage: number; monthlyValues?: Record<number, number> }[]>([]);
    const [contractsMarginData, setContractsMarginData] = useState<{ id: string; name: string; realizedValue: number; budgetValue: number; realizedPercent: number; budgetPercent: number }[]>([]);
    const [contractsLoading, setContractsLoading] = useState(false);
    const [contractsMarginTooltip, setContractsMarginTooltip] = useState<{
        x: number;
        y: number;
        title: string;
        budget: string;
        realized: string;
        achievement: string;
        type: 'absolute' | 'percentage';
    } | null>(null);
    const [contractsMarginHoveredIndex, setContractsMarginHoveredIndex] = useState<number | null>(null);
    const [contractsMarginHoveredChart, setContractsMarginHoveredChart] = useState<'absolute' | 'percentage' | null>(null);

    const calculateAtingimento = (budget: number, realized: number) => {
        if (budget > 0) return `${((realized / budget) * 100).toFixed(0)}%`;
        if (budget < 0) return `${((1 + (budget - realized) / budget) * 100).toFixed(0)}%`;
        return realized >= 0 ? '100%' : '0%';
    };

    const [selectedContractsMonth, setSelectedContractsMonth] = useState<string>('accumulated');
    const [monthlyBudgets, setMonthlyBudgets] = useState<Record<number, number>>({});
    const [contractsAnnualTotal, setContractsAnnualTotal] = useState<number>(0);

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); // New state for main groups

    const [loading, setLoading] = useState(true);
    const [selectedCompany, setSelectedCompany] = useState<string[]>(['DEFAULT']);
    const [pendingCompany, setPendingCompany] = useState<string[]>(['DEFAULT']);
    const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
    const [selectedCostCenter, setSelectedCostCenter] = useState<string[]>(['DEFAULT']);
    const [pendingCostCenter, setPendingCostCenter] = useState<string[]>(['DEFAULT']);
    const [costCenterDropdownOpen, setCostCenterDropdownOpen] = useState(false);
    const [companySearch, setCompanySearch] = useState('');
    const [costCenterSearch, setCostCenterSearch] = useState('');
    const [selectedYear, setSelectedYear] = useState(externalYear);
    const currentMonthIdx = 5; // Junho (0-indexed)
    const [startMonth, setStartMonth] = useState<number>(0);
    const [endMonth, setEndMonth] = useState<number>(5);
    const periodLabel = `(${MONTH_ABBRS[startMonth]}-${MONTH_ABBRS[endMonth]})`;
    const [selectedPeriodOption, setSelectedPeriodOption] = useState<string>('1_semestre');
    const [viewMode, setViewMode] = useState<'caixa' | 'competencia'>('competencia');
    const [viewPeriod, setViewPeriod] = useState<'month' | 'quarter'>('month');
    const [faturamentoViewMode, setFaturamentoViewMode] = useState<'mensal' | 'acumulado'>('mensal');
    const [tributosViewMode, setTributosViewMode] = useState<'mensal' | 'acumulado'>('mensal');
    const [resultadoViewMode, setResultadoViewMode] = useState<'mensal' | 'acumulado'>('mensal');
    const [csvViewMode, setCsvViewMode] = useState<'mensal' | 'acumulado'>('mensal');
    const [mbViewMode, setMbViewMode] = useState<'mensal' | 'acumulado'>('mensal');
    const [doViewMode, setDoViewMode] = useState<'mensal' | 'acumulado'>('mensal');
    const [mcViewMode, setMcViewMode] = useState<'mensal' | 'acumulado'>('mensal');
    const [daViewMode, setDaViewMode] = useState<'mensal' | 'acumulado'>('mensal');
    const [ebitdaViewMode, setEbitdaViewMode] = useState<'mensal' | 'acumulado'>('mensal');
    const [dfViewMode, setDfViewMode] = useState<'mensal' | 'acumulado'>('mensal');

    const [fatVisible, setFatVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: false, realizedRate: false });
    const [tribVisible, setTribVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: true, realizedRate: true });
    const [resVisible, setResVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: true, realizedRate: true });
    const [csvVisible, setCsvVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: true, realizedRate: true });
    const [mbVisible, setMbVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: true, realizedRate: true });
    const [doVisible, setDoVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: true, realizedRate: true });
    const [mcVisible, setMcVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: true, realizedRate: true });
    const [daVisible, setDaVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: true, realizedRate: true });
    const [ebitdaVisible, setEbitdaVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: true, realizedRate: true });
    const [dfVisible, setDfVisible] = useState({ budget: true, realized: true, atingido: true, budgetRate: true, realizedRate: true });

    // Sync selectedYear with externalYear
    useEffect(() => {
        setSelectedYear(externalYear);
    }, [externalYear]);

    const handlePeriodOptionChange = (option: string) => {
        setSelectedPeriodOption(option);
        switch (option) {
            case 'mes_atual':
                setStartMonth(5);
                setEndMonth(5);
                break;
            case '1_tri':
                setStartMonth(0);
                setEndMonth(2);
                break;
            case '2_tri':
                setStartMonth(3);
                setEndMonth(5);
                break;
            case '3_tri':
                setStartMonth(6);
                setEndMonth(8);
                break;
            case '4_tri':
                setStartMonth(9);
                setEndMonth(11);
                break;
            case '1_semestre':
                setStartMonth(0);
                setEndMonth(5);
                break;
            case '2_semestre':
                setStartMonth(6);
                setEndMonth(11);
                break;
            case 'ano_todo':
                setStartMonth(0);
                setEndMonth(11);
                break;
            case 'personalizado':
                // Mantém startMonth e endMonth atuais
                break;
        }
    };

    const handleStartMonthChange = (val: number) => {
        setStartMonth(val);
        if (val > endMonth) {
            setEndMonth(val);
        }
    };

    const handleEndMonthChange = (val: number) => {
        setEndMonth(val);
        if (val < startMonth) {
            setStartMonth(val);
        }
    };

    // --- Transaction Drill-down State ---
    const [selectedCell, setSelectedCell] = useState<{ categoryId: string, month: number, categoryName: string } | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [transactionModalStep, setTransactionModalStep] = useState<'company' | 'costcenter' | 'transactions'>('company');
    const [transactionSelectedCompany, setTransactionSelectedCompany] = useState<string | null>(null);
    const [transactionSelectedCostCenter, setTransactionSelectedCostCenter] = useState<string | null>(null);

    // --- Managerial Reclassification State ---
    const [reclassifyingTx, setReclassifyingTx] = useState<any | null>(null);
    const [targetReclassCategoryId, setTargetReclassCategoryId] = useState<string>('');
    const [targetReclassMonth, setTargetReclassMonth] = useState<number>(0);
    const [targetReclassYear, setTargetReclassYear] = useState<number>(2026);
    const [isReclassifying, setIsReclassifying] = useState<boolean>(false);
    const [isReclassCategoryDropdownOpen, setIsReclassCategoryDropdownOpen] = useState<boolean>(false);
    const [reclassCategorySearch, setReclassCategorySearch] = useState<string>('');
    const [reclassReason, setReclassReason] = useState<string>('');
    const [targetReclassTenantId, setTargetReclassTenantId] = useState<string>('');
    const [reclassAmount, setReclassAmount] = useState<string>('');

    // --- Transfer Modal State ---
    const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
    const [transferSourceTenantId, setTransferSourceTenantId] = useState<string>('');
    const [transferTargetTenantId, setTransferTargetTenantId] = useState<string>('');
    const [transferAmount, setTransferAmount] = useState<string>('');
    const [transferReason, setTransferReason] = useState<string>('');
    const [transferMonth, setTransferMonth] = useState<number>(1);
    const [transferYear, setTransferYear] = useState<number>(2026);
    const [isTransferring, setIsTransferring] = useState<boolean>(false);


    // --- Budget Modal State ---
    const [budgetModal, setBudgetModal] = useState<{ categoryId: string, fullNodeId: string, categoryName: string, startMonth: number, type: 'budget' | 'radar' } | null>(null);
    const [modalValues, setModalValues] = useState<string[]>(new Array(12).fill(''));
    const [lockedMonths, setLockedMonths] = useState<boolean[]>(new Array(12).fill(false));
    const [activeMonth, setActiveMonth] = useState<number>(0);
    const [isSavingBudget, setIsSavingBudget] = useState(false);
    const [modalObservation, setModalObservation] = useState<string>('');
    const [modalCompositionRows, setModalCompositionRows] = useState<{ id: string; description: string; values: string[] }[]>([]);
    const [initialCompositionRows, setInitialCompositionRows] = useState<{ id: string; description: string; values: string[] }[]>([]);
    // --- Budget Drill-Down State ---
    const [budgetDrillModal, setBudgetDrillModal] = useState<{ categoryId: string, categoryName: string, month: number, entries: any[], loading: boolean, drillStep: 'company' | 'costcenter' | 'detail', drillCompany: string | null, drillCC: string | null } | null>(null);

    // --- Excel Import State ---
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);

    // --- Deviation Analysis & Actions State ---
    const [deviations, setDeviations] = useState<any[]>([]);
    const [isDeviationModalOpen, setIsDeviationModalOpen] = useState(false);
    const [usersList, setUsersList] = useState<any[]>([]);
    const [isSavingDeviation, setIsSavingDeviation] = useState(false);
    const [activeDeviationNode, setActiveDeviationNode] = useState<CategoryNode | null>(null);
    const [deviationType, setDeviationType] = useState('Desvios de orçamento');
    const [deviationDescription, setDeviationDescription] = useState('');
    const [deviationCorrectionAction, setDeviationCorrectionAction] = useState('');
    const [deviationResponsibleId, setDeviationResponsibleId] = useState('');
    const [deviationDueDate, setDeviationDueDate] = useState('');
    const [deviationMonth, setDeviationMonth] = useState<number>(6); // June (1-indexed)

    const fetchDeviations = useCallback(async () => {
        const activeTenantId = selectedCompany.includes('DEFAULT') ? companies?.[0]?.id : selectedCompany[0];
        if (!activeTenantId) return;
        try {
            const devsRes = await fetch(`/api/deviations?tenantId=${activeTenantId}&year=${selectedYear}&t=${Date.now()}`);
            if (devsRes.ok) {
                const d = await devsRes.json();
                if (d.success) {
                    setDeviations(d.data || []);
                }
            }
        } catch (e) {
            console.error("fetchDeviations error:", e);
        }
    }, [selectedCompany, companies, selectedYear]);

    const fetchUsers = useCallback(async () => {
        const activeTenantId = selectedCompany.includes('DEFAULT') ? companies?.[0]?.id : selectedCompany[0];
        if (!activeTenantId) return;
        try {
            const usersRes = await fetch(`/api/users/list?tenantId=${activeTenantId}&t=${Date.now()}`);
            if (usersRes.ok) {
                const u = await usersRes.json();
                if (u.success) {
                    setUsersList(u.data || []);
                }
            }
        } catch (e) {
            console.error("fetchUsers error:", e);
        }
    }, [selectedCompany, companies]);

    const handleSaveDeviation = async () => {
        const activeTenantId = selectedCompany.includes('DEFAULT') ? companies?.[0]?.id : selectedCompany[0];
        if (!activeTenantId || !activeDeviationNode) return;
        if (!deviationDescription.trim() || !deviationCorrectionAction.trim()) {
            alert("Por favor, preencha a descrição e a ação corretiva.");
            return;
        }

        setIsSavingDeviation(true);
        try {
            const res = await fetch('/api/deviations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: activeTenantId,
                    categoryId: activeDeviationNode.id,
                    month: deviationMonth,
                    year: selectedYear,
                    deviationType,
                    description: deviationDescription,
                    correctionAction: deviationCorrectionAction,
                    responsibleId: deviationResponsibleId || null,
                    dueDate: deviationDueDate || null
                })
            });
            const data = await res.json();
            if (data.success) {
                setDeviationDescription('');
                setDeviationCorrectionAction('');
                setDeviationResponsibleId('');
                setDeviationDueDate('');
                await fetchDeviations();
                alert("Desvio cadastrado com sucesso!");
            } else {
                alert(`Erro ao cadastrar desvio: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Erro ao salvar desvio.");
        } finally {
            setIsSavingDeviation(false);
        }
    };

    const handleToggleResolveDeviation = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch('/api/deviations/resolve', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    isResolved: !currentStatus,
                    resolvedBy: 'Usuário'
                })
            });
            const data = await res.json();
            if (data.success) {
                await fetchDeviations();
            } else {
                alert(`Erro ao alterar status: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Erro ao alterar status do desvio.");
        }
    };

    const handleDeleteDeviation = async (id: string) => {
        if (!confirm("Deseja realmente excluir este desvio?")) return;
        try {
            const res = await fetch(`/api/deviations?id=${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                await fetchDeviations();
            } else {
                alert(`Erro ao excluir desvio: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Erro ao excluir desvio.");
        }
    };

    // --- DRE Group Card Collapse States ---
    const [isReceitasExpanded, setIsReceitasExpanded] = useState(true);
    const [isCustosExpanded, setIsCustosExpanded] = useState(true);
    const [isResultadosExpanded, setIsResultadosExpanded] = useState(true);

    const highlightedMonth = -1; // Desativar destaque de mês vigente

    const headerScrollRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);



    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollButtonsState = () => {
        const container = bodyScrollRef.current;
        if (container) {
            const { scrollLeft, scrollWidth, clientWidth } = container;
            setCanScrollLeft(scrollLeft > 2);
            setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
        }
    };

    const handleScrollSync = () => {
        if (bodyScrollRef.current && headerScrollRef.current) {
            headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
        }
        updateScrollButtonsState();
    };

    // Initialize and listen for resize and content changes
    useEffect(() => {
        // Run check initially and with small delay to ensure rendering finished
        updateScrollButtonsState();
        const timer = setTimeout(updateScrollButtonsState, 200);
        
        let observer: MutationObserver | null = null;
        if (bodyScrollRef.current) {
            observer = new MutationObserver(() => {
                updateScrollButtonsState();
            });
            observer.observe(bodyScrollRef.current, { childList: true, subtree: true, attributes: true });
        }

        window.addEventListener('resize', updateScrollButtonsState);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateScrollButtonsState);
            if (observer) {
                observer.disconnect();
            }
        };
    }, [loading, isExternalLoading]);

    const scrollGrid = (direction: 'left' | 'right') => {
        const container = bodyScrollRef.current;
        if (container) {
            const scrollAmount = 400; // Scroll 400px per click
            const target = container.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
            container.scrollTo({
                left: target,
                behavior: 'smooth'
            });
        }
    };

    // --- Realized Justification State ---
    const [justificationModal, setJustificationModal] = useState<{ categoryId: string, month: number, categoryName: string, tenantId: string, costCenterId: string | null } | null>(null);
    const [justificationHistory, setJustificationHistory] = useState<any[]>([]);
    const [loadingJustification, setLoadingJustification] = useState(false);
    const [newJustification, setNewJustification] = useState('');
    const [isSavingJustification, setIsSavingJustification] = useState(false);
    const [hasJustificationMap, setHasJustificationMap] = useState<Record<string, boolean>>({});
    const [transactionBudgets, setTransactionBudgets] = useState<Record<string, { total: number, costCenters: Record<string, number> }>>({});

    const evaluateFormula = (formula: string): number => {
        if (!formula.startsWith('=')) {
            // Remove thousand dots and replace decimal comma with dot for proper parseFloat
            // Standard Brazilian input: 1.900,00 -> 1900.00
            const clean = formula.replace(/\.(?=\d{3}(,|$))/g, '').replace(',', '.');
            const val = parseFloat(clean);
            return isNaN(val) ? 0 : val;
        }
        try {
            // Basic math parser (Safe eval replacement)
            const expression = formula.substring(1).replace(/,/g, '.').replace(/[^-+*/().0-9]/g, '');
            const result = new Function(`return ${expression}`)();
            return typeof result === 'number' && isFinite(result) ? result : 0;
        } catch (e) {
            console.error("Math eval error:", e);
            return 0;
        }
    };

    const handleCellClick = async (categoryId: string, month: number, categoryName: string) => {
        setSelectedCell({ categoryId, month, categoryName });
        setTransactionModalStep('company');
        setTransactionSelectedCompany(null);
        setTransactionSelectedCostCenter(null);
        setLoadingTransactions(true);
        setTransactions([]);
        setTransactionBudgets({});
        try {
            const companyParam = selectedCompany.includes('DEFAULT') ? 'ALL' : selectedCompany.join(',');
            const [transRes, budgetRes] = await Promise.all([
                fetch(`/api/transactions?categoryId=${categoryId}&month=${month}&year=${selectedYear}&costCenterId=${selectedCostCenter.join(',')}&tenantId=${companyParam}&viewMode=${viewMode}&t=${Date.now()}`),
                fetch(`/api/budgets?categoryId=${categoryId}&month=${month + 1}&year=${selectedYear}&tenantId=${companyParam}&detail=true&t=${Date.now()}`)
            ]);

            const [transData, budgetData] = await Promise.all([
                transRes.json(),
                budgetRes.json()
            ]);

            if (transData.success) {
                setTransactions(transData.transactions);
            }

            if (budgetData.success) {
                const bMap: Record<string, { total: number, costCenters: Record<string, number> }> = {};
                const targetMonth = month + 1;
                
                const processedKeys = new Set<string>();
                budgetData.data.forEach((b: any) => {
                    if (b.month === targetMonth) {
                        // v66.25: Key by tenantId for bulletproof match
                        const tId = b.tenantId || 'Geral';
                        
                        const cc = costCenters.find((c: any) => c.id === b.costCenterId || (c.id && c.id.includes(':' + b.costCenterId)));
                        const rawCCId = cc ? cc.id : (b.costCenterId || 'Geral');

                        const normCatName = normalizeName(b.category?.name || '');
                        const dedupKey = `${tId}-${rawCCId}-${normCatName}`;
                        
                        if (processedKeys.has(dedupKey)) return;
                        processedKeys.add(dedupKey);

                        if (!bMap[tId]) {
                            bMap[tId] = { total: 0, costCenters: {} };
                        }
                        
                        bMap[tId].total += (b.amount || 0);
                        bMap[tId].costCenters[rawCCId] = (bMap[tId].costCenters[rawCCId] || 0) + (b.amount || 0);
                    }
                });
                setTransactionBudgets(bMap);
            }
        } catch (error) {
            console.error("Failed to fetch drill-down data", error);
        } finally {
            setLoadingTransactions(false);
        }
    };

    const handleJustificationClick = async (categoryId: string, month: number, categoryName: string) => {
        const tenantId = selectedCompany.includes('DEFAULT') ? companies[0]?.id : selectedCompany[0];
        const isConsolidated = selectedCostCenter.length > 1 || selectedCostCenter.includes('DEFAULT');
        const ccParam = isConsolidated ? 'ALL' : selectedCostCenter[0];
        
        setJustificationModal({ 
            categoryId, 
            month, 
            categoryName, 
            tenantId, 
            costCenterId: ccParam 
        });
        setLoadingJustification(true);
        setJustificationHistory([]);
        try {
            const res = await fetch(`/api/realized/justifications?tenantId=${tenantId}&categoryId=${categoryId}&costCenterId=${ccParam}&month=${month + 1}&year=${selectedYear}&viewMode=${viewMode}`);
            const data = await res.json();
            if (data.success) {
                setJustificationHistory(data.justifications);
            }
        } catch (e) {
            console.error("Justification fetch error", e);
        } finally {
            setLoadingJustification(false);
        }
    };

    const saveJustification = async () => {
        if (!justificationModal || !newJustification.trim()) return;
        setIsSavingJustification(true);
        try {
            const userName = localStorage.getItem('userName') || (userRole === 'MASTER' ? 'Master Admin' : 'Gestor');
            const res = await fetch('/api/realized/justifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: justificationModal.tenantId,
                    categoryId: justificationModal.categoryId,
                    costCenterId: justificationModal.costCenterId || 'DEFAULT',
                    month: justificationModal.month + 1,
                    year: selectedYear,
                    viewMode,
                    content: newJustification,
                    userName
                })
            });
            const data = await res.json();
            if (data.success) {
                setJustificationHistory([data.justification, ...justificationHistory]);
                setNewJustification('');
                setHasJustificationMap(prev => ({ ...prev, [`${justificationModal.categoryId}-${justificationModal.month}`]: true }));
            }
        } catch (e) {
            alert("Erro ao salvar justificativa");
        } finally {
            setIsSavingJustification(false);
        }
    };

    const closeModal = () => {
        setSelectedCell(null);
        setTransactions([]);
        setTransactionModalStep('company');
        setTransactionSelectedCompany(null);
        setTransactionSelectedCostCenter(null);
        setReclassifyingTx(null);
        setTargetReclassCategoryId('');
        setTargetReclassMonth(0);
        setTargetReclassYear(2026);
        setIsReclassifying(false);
        setIsReclassCategoryDropdownOpen(false);
        setReclassCategorySearch('');
        setReclassReason('');
        setTargetReclassTenantId('');
        setReclassAmount('');
    };

    const handleConfirmTransfer = async () => {
        if (!transferSourceTenantId || !transferTargetTenantId || !transferAmount || !transferMonth || !transferYear) {
            alert("Por favor, preencha todos os campos obrigatórios.");
            return;
        }

        let cleanAmount = transferAmount;
        if (cleanAmount.includes(',') && cleanAmount.includes('.')) {
            cleanAmount = cleanAmount.replace(/\./g, '');
        }
        const parsedValue = cleanAmount.replace(/[^\d,.-]/g, '').replace(',', '.');
        const numericAmount = parseFloat(parsedValue);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            alert("Por favor, insira um valor válido e maior que zero.");
            return;
        }

        if (transferSourceTenantId === transferTargetTenantId) {
            alert("A empresa de origem e destino devem ser diferentes.");
            return;
        }

        setIsTransferring(true);
        try {
            const res = await fetch('/api/realized/transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceTenantId: transferSourceTenantId,
                    targetTenantId: transferTargetTenantId,
                    amount: numericAmount,
                    month: transferMonth,
                    year: transferYear,
                    description: transferReason,
                    viewMode
                })
            });
            const data = await res.json();
            if (data.success) {
                setIsTransferModalOpen(false);
                setTransferAmount('');
                setTransferReason('');
                setInternalRefresh(prev => prev + 1);
                if (selectedCell) {
                    await handleCellClick(selectedCell.categoryId, selectedCell.month, selectedCell.categoryName);
                }
            } else {
                alert("Erro ao realizar transferência: " + (data.error || "Erro desconhecido"));
            }
        } catch (err: any) {
            console.error("Transfer error:", err);
            alert("Erro ao realizar transferência.");
        } finally {
            setIsTransferring(false);
        }
    };

    const handleReclassifyConfirm = async (tx: any) => {
        if (!targetReclassCategoryId) return;
        setIsReclassifying(true);
        
        // Processa o valor parcial digitado pelo usuário
        let cleanAmount = reclassAmount.trim();
        if (cleanAmount.includes(',') && cleanAmount.includes('.')) {
            cleanAmount = cleanAmount.replace(/\./g, '');
        }
        const parsedValue = cleanAmount.replace(/[^\d,.-]/g, '').replace(',', '.');
        const numericAmount = parseFloat(parsedValue);

        const totalTxValue = Math.abs(parseFloat(tx.value) || 0);

        if (isNaN(numericAmount) || numericAmount <= 0) {
            alert("Por favor, insira um valor válido e maior que zero para a reclassificação.");
            setIsReclassifying(false);
            return;
        }

        if (numericAmount > totalTxValue) {
            alert(`O valor da reclassificação (R$ ${numericAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) não pode ser maior que o valor total da transação (R$ ${totalTxValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`);
            setIsReclassifying(false);
            return;
        }

        const isPartial = numericAmount < totalTxValue;
        const partialLabel = isPartial ? ' | Parcial' : '';
        
        const tenantId = tx.tenantId || (selectedCompany.includes('DEFAULT') ? companies[0]?.id : selectedCompany[0]);
        
        const sourceCompanyObj = companies.find((c: any) => c.id === tenantId);
        const targetCompanyObj = companies.find((c: any) => c.id === targetReclassTenantId);

        const sourceCompanyName = sourceCompanyObj?.name || '';
        const targetCompanyName = targetCompanyObj?.name || '';

        const deText = sourceCompanyName ? `${sourceCompanyName} - ${selectedCell?.categoryName || ''}` : (selectedCell?.categoryName || '');
        const paraText = targetCompanyName ? `${targetCompanyName} - ${categories.find((c: any) => c.id === targetReclassCategoryId)?.name || targetReclassCategoryId}` : (categories.find((c: any) => c.id === targetReclassCategoryId)?.name || targetReclassCategoryId);
        
        const sourceMonth = selectedCell?.month !== undefined ? selectedCell.month + 1 : 1;
        const sourceYear = selectedYear;
        const reasonText = reclassReason.trim();

        try {
            const res = await fetch('/api/realized/adjustments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceTransactionId: tx.id,
                    tenantId,
                    targetTenantId: targetReclassTenantId,
                    sourceCategoryId: tx.categoryId || selectedCell?.categoryId,
                    targetCategoryId: targetReclassCategoryId,
                    costCenterId: tx.costCenterId || 'Geral',
                    month: sourceMonth,
                    year: sourceYear,
                    targetMonth: targetReclassMonth,
                    targetYear: targetReclassYear,
                    amount: numericAmount,
                    description: reasonText
                         ? `${tx.description || ''}${partialLabel} | De: ${deText} (${sourceMonth}/${sourceYear}) para: ${paraText} (${targetReclassMonth}/${targetReclassYear}) | Motivo: ${reasonText}`
                         : `${tx.description || ''}${partialLabel} | De: ${deText} (${sourceMonth}/${sourceYear}) para: ${paraText} (${targetReclassMonth}/${targetReclassYear})`,
                    date: tx.date || tx.data,
                    viewMode
                })
            });
            const data = await res.json();
            if (data.success) {
                setReclassifyingTx(null);
                setTargetReclassCategoryId('');
                setTargetReclassMonth(0);
                setTargetReclassYear(2026);
                setIsReclassCategoryDropdownOpen(false);
                setReclassCategorySearch('');
                setReclassReason('');
                setTargetReclassTenantId('');
                setReclassAmount('');
                setInternalRefresh(prev => prev + 1);
                if (selectedCell) {
                    await handleCellClick(selectedCell.categoryId, selectedCell.month, selectedCell.categoryName);
                }
            } else {
                alert("Erro ao reclassificar transação: " + (data.error || "Erro desconhecido"));
            }
        } catch (err: any) {
            console.error("Reclassify error:", err);
            alert("Erro ao reclassificar transação.");
        } finally {
            setIsReclassifying(false);
        }
    };

    const handleUndoReclassify = async (tx: any) => {
        setIsReclassifying(true);
        try {
            const tenantId = tx.tenantId || (selectedCompany.includes('DEFAULT') ? companies[0]?.id : selectedCompany[0]);
            
            // Extract original source ID if it's an adjustment entry itself
            let sourceId = tx.id;
            if (tx.externalId?.startsWith('adj-neg-') || tx.externalId?.startsWith('adj-pos-')) {
                const parts = tx.externalId.split('-');
                if (parts.length >= 3) {
                    sourceId = parts.slice(2, parts.length - 1).join('-');
                }
            }

            const res = await fetch(`/api/realized/adjustments?sourceTransactionId=${sourceId}&viewMode=${viewMode}&tenantId=${tenantId}&externalId=${tx.externalId || ''}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setInternalRefresh(prev => prev + 1);
                if (selectedCell) {
                    await handleCellClick(selectedCell.categoryId, selectedCell.month, selectedCell.categoryName);
                }
            } else {
                alert("Erro ao desfazer reclassificação: " + (data.error || "Erro desconhecido"));
            }
        } catch (err: any) {
            console.error("Undo reclassify error:", err);
            alert("Erro ao desfazer reclassificação.");
        } finally {
            setIsReclassifying(false);
        }
    };

    const handleUndoTransfer = async (tx: any) => {
        setIsReclassifying(true);
        try {
            let transferUuid = '';
            if (tx.externalId?.startsWith('transf-out-')) {
                transferUuid = tx.externalId.replace('transf-out-', '');
            } else if (tx.externalId?.startsWith('transf-in-')) {
                transferUuid = tx.externalId.replace('transf-in-', '');
            }

            if (!transferUuid) {
                alert("Não foi possível identificar o ID da transferência.");
                return;
            }

            const res = await fetch(`/api/realized/transfers?transferUuid=${transferUuid}&viewMode=${viewMode}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setInternalRefresh(prev => prev + 1);
                if (selectedCell) {
                    await handleCellClick(selectedCell.categoryId, selectedCell.month, selectedCell.categoryName);
                }
            } else {
                alert("Erro ao desfazer transferência: " + (data.error || "Erro desconhecido"));
            }
        } catch (err: any) {
            console.error("Undo transfer error:", err);
            alert("Erro ao desfazer transferência.");
        } finally {
            setIsReclassifying(false);
        }
    };


    // --- Aggregation logic for drill-down ---
    const groupedByCompany = useMemo(() => {
        if (!transactions || transactions.length === 0) return [];
        // Map by tenantId to avoid name mismatches
        const records = new Map<string, { name: string, total: number, tenantId: string }>();
        transactions.forEach((tx: any) => {
            const tId = tx.tenantId || 'Geral';
            const tName = tx.tenantName || 'Geral';
            const current = records.get(tId) || { name: tName, total: 0, tenantId: tId };
            current.total += (parseFloat(tx.value) || 0);
            records.set(tId, current);
        });
        return Array.from(records.values()).sort((a, b) => b.total - a.total);
    }, [transactions]);

    const groupedByCostCenter = useMemo(() => {
        if (!transactions || transactions.length === 0 || !transactionSelectedCompany) return [];
        const filtered = transactions.filter((tx: any) => (tx.tenantName || 'Geral') === transactionSelectedCompany);
        const records = new Map<string, { name: string, total: number, costCenterId: string }>();
        filtered.forEach((tx: any) => {
            const ccId = tx.costCenterId || 'Geral';
            const ccName = (tx.costCenters && tx.costCenters.length > 0) ? tx.costCenters[0].nome : 'Geral';
            const current = records.get(ccId) || { name: ccName, total: 0, costCenterId: ccId };
            current.total += (parseFloat(tx.value) || 0);
            records.set(ccId, current);
        });
        return Array.from(records.values()).sort((a, b) => b.total - a.total);
    }, [transactions, transactionSelectedCompany]);

    const finalTransactions = useMemo(() => {
        if (!transactions || transactions.length === 0 || !transactionSelectedCompany || !transactionSelectedCostCenter) return [];
        return transactions.filter((tx: any) => {
            // Ocultar estornos negativos para não duplicar visualmente a transação no modal
            if (tx.externalId?.startsWith('adj-neg-')) return false;

            return (tx.tenantName || 'Geral') === transactionSelectedCompany &&
                ((tx.costCenters && tx.costCenters.length > 0) ? tx.costCenters[0].nome : 'Geral') === transactionSelectedCostCenter;
        });
    }, [transactions, transactionSelectedCompany, transactionSelectedCostCenter]);

    const [categories, setCategories] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>(MOCK_COST_CENTERS);
    const [error, setError] = useState<string | null>(null);

    // --- Indicator Analysis State ---
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    // --- Detailed Analysis Custom Charts State ---
    const [activeModalTab, setActiveModalTab] = useState<'deviation' | 'detailed'>('deviation');
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
    const [analysisId, setAnalysisId] = useState<string | null>(null);
    const [analysisSelectedTenant, setAnalysisSelectedTenant] = useState<string>('');
    const [analysisSelectedMonth, setAnalysisSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
    const [analysisSelectedCategory, setAnalysisSelectedCategory] = useState<string>('');
    const [analysisCategorySearch, setAnalysisCategorySearch] = useState<string>('');
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const [deviationReport, setDeviationReport] = useState<string>('');
    const [analysisPerformed, setAnalysisPerformed] = useState<string>('');
    const [analysisActions, setAnalysisActions] = useState<{ id?: string; description: string; dueDate: string; isDone?: boolean }[]>([]);
    const [analysisComments, setAnalysisComments] = useState<{ id: string; userName: string; content: string; createdAt: string }[]>([]);
    const [newCommentText, setNewCommentText] = useState<string>('');
    const [newCommentUser, setNewCommentUser] = useState<string>('Gestor');
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
    const [isAnalysisSaving, setIsAnalysisSaving] = useState(false);

    // Quick Category State
    const [isQuickCategoryFormOpen, setIsQuickCategoryFormOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryType, setNewCategoryType] = useState('EXPENSE');
    const [newCategoryGroup, setNewCategoryGroup] = useState('04. DESPESAS');
    const [isCategoryRegistering, setIsCategoryRegistering] = useState(false);

    const selectedCategoryName = useMemo(() => {
        const found = categories.find((cat: any) => cat.id === analysisSelectedCategory);
        return found ? found.name : 'Selecione uma conta...';
    }, [categories, analysisSelectedCategory]);

    const loadAnalysisData = async (tenantId: string, categoryId: string, month: number, year: number) => {
        if (!tenantId || !categoryId || !month || !year) return;
        setIsAnalysisLoading(true);
        try {
            const res = await fetch(`/api/kpi/analysis?tenantId=${tenantId}&categoryId=${categoryId}&month=${month}&year=${year}`);
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

    useEffect(() => {
        if (isAnalysisModalOpen && analysisSelectedTenant && analysisSelectedCategory) {
            loadAnalysisData(analysisSelectedTenant, analysisSelectedCategory, analysisSelectedMonth, selectedYear);
        }
    }, [isAnalysisModalOpen, analysisSelectedTenant, analysisSelectedCategory, analysisSelectedMonth, selectedYear]);

    const saveAnalysisData = async () => {
        if (!analysisSelectedTenant || !analysisSelectedCategory || !analysisSelectedMonth) {
            alert('Por favor, selecione a empresa, a categoria e o mês.');
            return;
        }
        setIsAnalysisSaving(true);
        try {
            const res = await fetch('/api/kpi/analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: analysisSelectedTenant,
                    categoryId: analysisSelectedCategory,
                    month: analysisSelectedMonth,
                    year: selectedYear,
                    deviationReport,
                    analysisPerformed,
                    actions: analysisActions
                })
            });
            const result = await res.json();
            if (result.success) {
                triggerRefresh();
                setAnalysisId(result.data.id);
                setAnalysisActions(result.data.actions || []);
                alert('Análise do indicador salva com sucesso!');
            } else {
                alert(`Erro ao salvar análise: ${result.error}`);
            }
        } catch (e) {
            alert('Erro ao conectar ao servidor para salvar a análise.');
        } finally {
            setIsAnalysisSaving(false);
        }
    };

    const postComment = async () => {
        if (!analysisId) {
            alert('Por favor, salve a análise primeiro para poder adicionar comentários.');
            return;
        }
        if (!newCommentText.trim()) return;
        try {
            const res = await fetch('/api/kpi/analysis/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    analysisId,
                    userName: newCommentUser.trim() || 'Gestor',
                    content: newCommentText.trim()
                })
            });
            const result = await res.json();
            if (result.success) {
                setAnalysisComments(prev => [...prev, result.data]);
                setNewCommentText('');
            } else {
                alert(`Erro ao adicionar comentário: ${result.error}`);
            }
        } catch (e) {
            alert('Erro ao conectar ao servidor para adicionar comentário.');
        }
    };

    // --- Detailed Analysis Custom Charts Functions ---
    const fetchDetailedAnalyses = async () => {
        if (!analysisSelectedTenant || !analysisSelectedMonth || !selectedYear) return;
        setLoadingDetailed(true);
        try {
            const res = await fetch(`/api/kpi/detailed-analysis?tenantId=${analysisSelectedTenant}&month=${analysisSelectedMonth}&year=${selectedYear}`);
            const json = await res.json();
            if (json.success) {
                setDetailedAnalyses(json.data || []);
            }
        } catch (err) {
            console.error('Error fetching detailed analyses:', err);
        } finally {
            setLoadingDetailed(false);
        }
    };

    const fetchChartData = async (catId: string, tenId: string, ccId: string) => {
        if (!catId || !tenId) return;
        setLoadingPreviewData(true);
        try {
            const res = await fetch(`/api/kpi/detailed-chart-data?categoryId=${catId}&filterTenantId=${tenId}&filterCCId=${ccId}&year=${selectedYear}&viewMode=${viewMode}`);
            const json = await res.json();
            if (json.success) {
                setChartPreviewData(json.data || []);
            }
        } catch (err) {
            console.error('Error fetching chart preview data:', err);
        } finally {
            setLoadingPreviewData(false);
        }
    };

    const saveDetailedAnalysis = async () => {
        if (!analysisSelectedTenant || !analysisSelectedMonth || !selectedYear) {
            alert('Parâmetros de contexto ausentes.');
            return;
        }
        if (!chartCategory || !chartTenant || !chartType) {
            alert('Por favor, configure os campos obrigatórios do gráfico (Conta, Empresa e Tipo).');
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
                    month: analysisSelectedMonth,
                    year: selectedYear,
                    categoryId: chartCategory,
                    filterTenantId: chartTenant,
                    filterCCId: chartCC,
                    chartType,
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
        setChartCategory(analysisSelectedCategory);
        setChartCategorySearch('');
        setChartTenant(analysisSelectedTenant || 'ALL');
        setChartCC('ALL');
        setChartType('VERTICAL_BAR');
        setChartOnlyRealized(false);
        setChartShowAtingido(false);
        setChartPctOfRevenue(false);
        setChartColor('#6366f1');
        setChartAnalysisText('');
        
        if (!analysisSelectedTenant && tenants.length > 0) {
            setAnalysisSelectedTenant(tenants[0].id);
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
        setChartType(chart.chartType);
        setChartOnlyRealized(!!chart.onlyRealized);
        setChartShowAtingido(!!chart.showAtingido);
        setChartPctOfRevenue(!!chart.pctOfRevenue);
        setChartColor(chart.chartColor || '#6366f1');
        setAnalysisSelectedTenant(chart.tenantId);
        setChartAnalysisText(chart.analysisText || '');
        setChartPreviewData([]);
        setIsEditingChart(true);
    };

    // Reactively fetch detailed analysis list when main modal context changes
    useEffect(() => {
        if (isAnalysisModalOpen && activeModalTab === 'detailed') {
            fetchDetailedAnalyses();
        }
    }, [isAnalysisModalOpen, activeModalTab, analysisSelectedTenant, analysisSelectedMonth, selectedYear]);

    // Reactively fetch preview chart data during editing
    useEffect(() => {
        if (isEditingChart && chartCategory && chartTenant) {
            fetchChartData(chartCategory, chartTenant, chartCC);
        }
    }, [isEditingChart, chartCategory, chartTenant, chartCC, selectedYear, viewMode]);

    // Mapear seleção de categorias se o Tenant de contexto for alterado
    useEffect(() => {
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
            
            const foundInNewTenant = categories.find((c: any) => 
                c.tenantId === analysisSelectedTenant && 
                normalize(c.name) === normalize(item!.name)
            );
            return foundInNewTenant ? foundInNewTenant.id : null;
        }).filter(Boolean);

        const joined = newIds.join(',');
        if (joined !== chartCategory) {
            setChartCategory(joined);
        }
    }, [analysisSelectedTenant, categories, chartCategory]);

    const DetailedChartCard = ({ chart, onEdit, onDelete, mainMonth, year, viewMode, categories }: { chart: any, onEdit: (c: any) => void, onDelete: (id: string) => void, mainMonth: number, year: number, viewMode: 'caixa' | 'competencia', categories: any[] }) => {
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

        const getChartCategoryLabel = (id: string) => {
            const dreLabels: Record<string, string> = {
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
            };
            if (dreLabels[id]) return dreLabels[id];
            if (syntheticLabels[id]) return syntheticLabels[id];
            const cleanId = id.includes(':') ? id.split(':').pop()! : id;
            const found = categories.find((cat: any) => {
                const cleanCatId = cat.id.includes(':') ? cat.id.split(':').pop()! : cat.id;
                return cleanCatId === cleanId;
            });
            return found ? found.name : id;
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
            return chart.categoryId.split(',').map(x => x.trim()).filter(Boolean).map(getChartCategoryLabel).join(' + ');
        };

        const getChartTypeName = (typeStr: string) => {
            if (typeStr && typeStr.startsWith('{')) {
                return 'Gráfico Combinado (Eixo Duplo)';
            }
            const chartTypeNameMap: Record<string, string> = {
                VERTICAL_BAR: 'Barras Vertical',
                HORIZONTAL_BAR: 'Barras Horizontal',
                LINE: 'Linha',
                LINE_MARKERS: 'Linha com Marcadores',
                PIE: 'Pizza',
                DONUT: 'Rosca',
                GAUGE: 'Velocímetro'
            };
            return chartTypeNameMap[typeStr] || typeStr;
        };

        return (
            <div className="glass-card" style={{ padding: '1.25rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                    <div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            📊 {getChartHeaderTitle(chart)} ({getChartTypeName(chart.chartType)})
                        </h4>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>
                            Filtros: {chart.filterTenantId === 'ALL' ? 'Grupo JVS' : (companies.find((c: any) => c.id === chart.filterTenantId)?.name || 'Empresa Única')} 
                            {chart.filterCCId && chart.filterCCId !== 'ALL' ? ` | Centro de Custo: ${chart.filterCCId}` : ' | Todos Centros de Custo'}
                            {chart.pctOfRevenue ? ' | % sobre Receita' : ''}
                            {chart.onlyRealized ? ' | Somente Realizado' : ''}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                        onClick={() => onEdit(chart)}
                        style={{ background: (chart.chartColor || '#2563eb') + '15', border: 'none', borderRadius: '6px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: chart.chartColor || '#2563eb', cursor: 'pointer' }}
                    >
                        ✏️ Editar
                    </button>
                    <button 
                        onClick={() => onDelete(chart.id)}
                        style={{ background: '#fef2f2', border: 'none', borderRadius: '6px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', cursor: 'pointer' }}
                    >
                        🗑️ Excluir
                    </button>
                </div>
            </div>

            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '180px', width: '100%' }}>
                        <div style={{ border: '2.5px solid #f3f3f3', borderTop: '2.5px solid #3b82f6', borderRadius: '50%', width: '22px', height: '22px', animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : (
                    renderDetailedChart(chart.chartType, data, !!chart.onlyRealized, !!chart.showAtingido, !!chart.pctOfRevenue, mainMonth, chart.chartColor, undefined, chart.year)
                )}
            </div>

            {chart.analysisText && (
                <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderLeft: `3.5px solid ${chart.chartColor || '#3b82f6'}`, borderRadius: '4px', fontSize: '0.75rem', color: '#334155', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                    <strong>Análise Histórica:</strong> {chart.analysisText}
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
        chartColor: string = '#3b82f6',
        mixedConfig?: Record<string, 'bar' | 'line_val' | 'diarias_bar' | 'diarias_line' | 'line_atingido' | 'line_revenue'>,
        year: number = 2026
    ) => {
        if (!data || data.length === 0) {
            return (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
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

                // Detect if it is the new format (uses global keys 'budget' and/or 'realized')
                const isNewFormat = config && ('budget' in config || 'realized' in config);

                const getAbsValueNew = (val: number, mode: string, mIdx: number) => {
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

                if (isNewFormat) {
                    const bMode = config?.budget || 'bar';
                    const rMode = config?.realized || 'bar';
                    const atMode = config?.atingido || 'none';
                    const pctMode = config?.pctOfRevenue || 'none';

                    const hasDailyActive = isDailyMode(bMode) || isDailyMode(rMode);

                    let maxAbs = 1;
                    data.forEach((m, idx) => {
                        if (bMode !== 'none') {
                            const bVal = getAbsValueNew(m.budget, bMode, idx);
                            maxAbs = Math.max(maxAbs, Math.abs(bVal));
                        }
                        if (rMode !== 'none' && idx + 1 <= currentMonthIdx + 1) {
                            const rVal = getAbsValueNew(m.realized, rMode, idx);
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
                            const valScaled = getAbsValueNew(val, mode, monthIdx);

                            const barX = startBarX + keyIdx * (barWidth + 4);
                            const yVal = getYAbs(valScaled);
                            const hVal = Math.max(2, yBaseline - yVal);

                            if (key === 'budget') {
                                return (
                                    <g key={`${monthIdx}-budget`}>
                                        {!onlyRealized && valScaled > 0 && (
                                            <>
                                                <rect 
                                                    x={barX} 
                                                    y={yVal} 
                                                    width={barWidth} 
                                                    height={hVal} 
                                                    fill="#cbd5e1" 
                                                    rx="3"
                                                />
                                                <text 
                                                    x={barX + barWidth / 2} 
                                                    y={yVal - 7} 
                                                    textAnchor="middle" 
                                                    fill="#64748b" 
                                                    fontSize="11.5px" 
                                                    fontWeight="700"
                                                >
                                                    {formatAbs(valScaled, isDailyMode(bMode))}
                                                </text>
                                            </>
                                        )}
                                    </g>
                                );
                            } else {
                                return (
                                    <g key={`${monthIdx}-realized`}>
                                        {monthIdx + 1 <= currentMonthIdx + 1 && valScaled > 0 && (
                                            <>
                                                <rect 
                                                    x={barX} 
                                                    y={yVal} 
                                                    width={barWidth} 
                                                    height={hVal} 
                                                    fill={chartColor} 
                                                    rx="3"
                                                />
                                                <text 
                                                    x={barX + barWidth / 2} 
                                                    y={yVal - 7} 
                                                    textAnchor="middle" 
                                                    fill="#475569" 
                                                    fontSize="11.5px" 
                                                    fontWeight="700"
                                                >
                                                    {formatAbs(valScaled, isDailyMode(rMode))}
                                                </text>
                                            </>
                                        )}
                                    </g>
                                );
                            }
                        });
                    });

                    // Lines
                    const leftLines: JSX.Element[] = [];
                    if (bMode === 'line_val' || bMode === 'diarias_line') {
                        const points: { x: number; y: number; val: number }[] = [];
                        data.forEach((m, monthIdx) => {
                            const valScaled = getAbsValueNew(m.budget, bMode, monthIdx);
                            points.push({ x: getX(monthIdx), y: getYAbs(valScaled), val: valScaled });
                        });
                        let pathD = `M ${points[0].x} ${points[0].y}`;
                        for (let i = 1; i < points.length; i++) pathD += ` L ${points[i].x} ${points[i].y}`;
                        leftLines.push(
                            <g key="budget-line">
                                <path d={pathD} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
                                {points.map((p, idx) => (
                                    <circle key={idx} cx={p.x} cy={p.y} r="3.5" fill="#94a3b8" stroke="#ffffff" strokeWidth="1" />
                                ))}
                            </g>
                        );
                    }
                    if (rMode === 'line_val' || rMode === 'diarias_line') {
                        const points: { x: number; y: number; val: number }[] = [];
                        data.forEach((m, monthIdx) => {
                            if (monthIdx + 1 <= currentMonthIdx + 1) {
                                const valScaled = getAbsValueNew(m.realized, rMode, monthIdx);
                                points.push({ x: getX(monthIdx), y: getYAbs(valScaled), val: valScaled });
                            }
                        });
                        if (points.length > 0) {
                            let pathD = `M ${points[0].x} ${points[0].y}`;
                            for (let i = 1; i < points.length; i++) pathD += ` L ${points[i].x} ${points[i].y}`;
                            leftLines.push(
                                <g key="realized-line">
                                    <path d={pathD} fill="none" stroke={chartColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    {points.map((p, idx) => (
                                        <g key={idx}>
                                            <circle cx={p.x} cy={p.y} r="4.5" fill={chartColor} stroke="#ffffff" strokeWidth="1.5" />
                                            <text x={p.x} y={p.y - 11} textAnchor="middle" fill={chartColor} fontSize="12px" fontWeight="800">
                                                {formatAbs(p.val, isDailyMode(rMode))}
                                            </text>
                                        </g>
                                    ))}
                                </g>
                            );
                        }
                    }

                    const rightLines: JSX.Element[] = [];
                    if (atMode === 'line_atingido') {
                        const points: { x: number; y: number; val: number }[] = [];
                        data.forEach((m, monthIdx) => {
                            if (monthIdx + 1 <= currentMonthIdx + 1) {
                                points.push({ x: getX(monthIdx), y: getYPct(m.atingido), val: m.atingido });
                            }
                        });
                        if (points.length > 0) {
                            let pathD = `M ${points[0].x} ${points[0].y}`;
                            for (let i = 1; i < points.length; i++) pathD += ` L ${points[i].x} ${points[i].y}`;
                            const lineColor = '#10b981';
                            rightLines.push(
                                <g key="atingido-line">
                                    <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    {points.map((p, idx) => (
                                        <g key={idx}>
                                            <circle cx={p.x} cy={p.y} r="4.5" fill={lineColor} stroke="#ffffff" strokeWidth="1.5" />
                                            <text x={p.x} y={p.y - 11} textAnchor="middle" fill={lineColor} fontSize="12px" fontWeight="800">
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
                                points.push({ x: getX(monthIdx), y: getYPct(m.pctOfRevenue), val: m.pctOfRevenue });
                            }
                        });
                        if (points.length > 0) {
                            let pathD = `M ${points[0].x} ${points[0].y}`;
                            for (let i = 1; i < points.length; i++) pathD += ` L ${points[i].x} ${points[i].y}`;
                            const lineColor = '#f59e0b';
                            rightLines.push(
                                <g key="revenue-line">
                                    <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    {points.map((p, idx) => (
                                        <g key={idx}>
                                            <circle cx={p.x} cy={p.y} r="4.5" fill={lineColor} stroke="#ffffff" strokeWidth="1.5" />
                                            <text x={p.x} y={p.y - 11} textAnchor="middle" fill={lineColor} fontSize="12px" fontWeight="800">
                                                {p.val.toFixed(1)}%
                                            </text>
                                        </g>
                                    ))}
                                </g>
                            );
                        }
                    }

                    return (
                        <svg viewBox="-70 0 1290 260" width="100%" height="auto" style={{ overflow: 'visible' }}>
                            {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, gridIdx) => {
                                const yGrid = yBaseline - ratio * 170;
                                return (
                                    <g key={gridIdx}>
                                        <line x1="40" y1={yGrid} x2="1160" y2={yGrid} stroke="#f1f5f9" strokeWidth="0.5" strokeDasharray="3 3" />
                                        <text x="32" y={yGrid + 4} textAnchor="end" fill="#94a3b8" fontSize="12px" fontWeight="600"
                                            style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>
                                            {formatAbs(ratio * scaleMaxAbs, hasDailyActive)}
                                        </text>
                                        <text x="1168" y={yGrid + 4} textAnchor="start" fill="#94a3b8" fontSize="12px" fontWeight="600"
                                            style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>
                                            {(ratio * scaleMaxPct).toFixed(0)}%
                                        </text>
                                    </g>
                                );
                            })}

                            <line x1="40" y1={yBaseline} x2="1160" y2={yBaseline} stroke="#cbd5e1" strokeWidth="1" />

                            {renderedBars}
                            {leftLines}
                            {rightLines}

                            {data.map((m, idx) => (
                                <text key={idx} x={getX(idx)} y={yBaseline + 20} textAnchor="middle" fill="#475569" fontSize="13px" fontWeight="800">
                                    {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                                </text>
                            ))}
                        </svg>
                    );
                }

                const getAbsValue = (m: any, k: string, field: 'budget' | 'realized', mIdx: number) => {
                    const vals = m.breakdown?.[k] || { budget: 0, realized: 0 };
                    const rawVal = vals[field] || 0;
                    const mode = config?.[k] || 'bar';
                    if (mode === 'diarias_bar' || mode === 'diarias_line') {
                        const days = getDaysInMonth(mIdx + 1);
                        return rawVal / days;
                    }
                    return rawVal;
                };

                const isDailyKey = (k: string) => {
                    const mode = config?.[k];
                    return mode === 'diarias_bar' || mode === 'diarias_line';
                };

                const leftKeys = Object.keys(config || {}).filter(k => 
                    ['bar', 'line_val', 'diarias_bar', 'diarias_line'].includes(config?.[k] || 'bar')
                );
                const activeLeftKeys = leftKeys.length === 0 && Object.keys(config || {}).length === 0 
                    ? Object.keys(config || {}) 
                    : leftKeys;

                const hasDailyActive = activeLeftKeys.some(isDailyKey);

                let maxAbs = 1;
                data.forEach((m, idx) => {
                    activeLeftKeys.forEach(k => {
                        const rVal = (idx + 1 <= currentMonthIdx + 1) ? Math.abs(getAbsValue(m, k, 'realized', idx)) : 0;
                        const bVal = onlyRealized ? 0 : Math.abs(getAbsValue(m, k, 'budget', idx));
                        maxAbs = Math.max(maxAbs, rVal, bVal);
                    });
                });
                const scaleMaxAbs = maxAbs * 1.20;

                const rightKeys = Object.keys(config || {}).filter(k => 
                    ['line_atingido', 'line_revenue'].includes(config?.[k])
                );
                
                let maxPct = 5;
                data.forEach((m, idx) => {
                    rightKeys.forEach(k => {
                        const vals = m.breakdown?.[k] || { atingido: 0, pctOfRevenue: 0 };
                        const typeMode = config?.[k];
                        const val = typeMode === 'line_atingido' ? vals.atingido : vals.pctOfRevenue;
                        if (idx + 1 <= currentMonthIdx + 1) {
                            maxPct = Math.max(maxPct, Math.abs(val));
                        }
                    });
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
                const barKeys = Object.keys(config || {}).filter(k => 
                    config?.[k] === 'bar' || config?.[k] === 'diarias_bar'
                );
                const activeBarKeys = barKeys.length === 0 && Object.keys(config || {}).length === 0 
                    ? Object.keys(config || {}) 
                    : barKeys;

                const renderedBars = data.map((m, monthIdx) => {
                    const xCenter = getX(monthIdx);
                    const numBars = activeBarKeys.length;
                    if (numBars === 0) return null;

                    const groupWidth = 76;
                    const barWidth = Math.max(16, (groupWidth / numBars) - 4);
                    const startBarX = xCenter - (groupWidth / 2);

                    return activeBarKeys.map((k, keyIdx) => {
                        const valR = getAbsValue(m, k, 'realized', monthIdx);
                        const valB = getAbsValue(m, k, 'budget', monthIdx);

                        const barX = startBarX + keyIdx * (barWidth + 4);
                        const yR = getYAbs(valR);
                        const hR = Math.max(2, yBaseline - yR);

                        const yB = getYAbs(valB);
                        const hB = Math.max(2, yBaseline - yB);

                        const barOpacity = 1 - (keyIdx * 0.25);
                        const isDaily = isDailyKey(k);

                        return (
                            <g key={`${monthIdx}-${k}`}>
                                {!onlyRealized && valB > 0 && (
                                    <rect 
                                        x={barX} 
                                        y={yB} 
                                        width={barWidth} 
                                        height={hB} 
                                        fill="none" 
                                        stroke="#94a3b8" 
                                        strokeWidth="1" 
                                        strokeDasharray="2 2" 
                                        rx="2"
                                    />
                                )}
                                {monthIdx + 1 <= currentMonthIdx + 1 && valR > 0 && (
                                    <>
                                        <rect 
                                            x={barX} 
                                            y={yR} 
                                            width={barWidth} 
                                            height={hR} 
                                            fill={chartColor} 
                                            fillOpacity={barOpacity}
                                            rx="2"
                                        />
                                        <text 
                                            x={barX + barWidth / 2} 
                                            y={yR - 7} 
                                            textAnchor="middle" 
                                            fill="#475569" 
                                            fontSize="11.5px" 
                                            fontWeight="700"
                                        >
                                            {formatAbs(valR, isDaily)}
                                        </text>
                                    </>
                                )}
                            </g>
                        );
                    });
                });

                // RENDER LEFT AXIS LINES (line_val, diarias_line)
                const leftLineKeys = Object.keys(config || {}).filter(k => 
                    config?.[k] === 'line_val' || config?.[k] === 'diarias_line'
                );
                const renderedLeftLines = leftLineKeys.map((k, keyIdx) => {
                    const points: { x: number; y: number; val: number }[] = [];
                    data.forEach((m, monthIdx) => {
                        const val = getAbsValue(m, k, 'realized', monthIdx);
                        if (monthIdx + 1 <= currentMonthIdx + 1) {
                            points.push({
                                x: getX(monthIdx),
                                y: getYAbs(val),
                                val
                            });
                        }
                    });

                    if (points.length === 0) return null;

                    let pathD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                    }

                    const lineColor = keyIdx === 0 ? '#3b82f6' : '#06b6d4';
                    const isDaily = isDailyKey(k);

                    return (
                        <g key={`left-line-${k}`}>
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
                                        stroke="#ffffff" 
                                        strokeWidth="1.5" 
                                    />
                                    <text 
                                        x={p.x} 
                                        y={p.y - 11} 
                                        textAnchor="middle" 
                                        fill={lineColor} 
                                        fontSize="12px" 
                                        fontWeight="800"
                                    >
                                        {formatAbs(p.val, isDaily)}
                                    </text>
                                </g>
                            ))}
                        </g>
                    );
                });

                // RENDER RIGHT AXIS LINES (% lines)
                const renderedRightLines = rightKeys.map((k, keyIdx) => {
                    const points: { x: number; y: number; val: number }[] = [];
                    data.forEach((m, monthIdx) => {
                        const vals = m.breakdown?.[k] || { atingido: 0, pctOfRevenue: 0 };
                        const typeMode = config?.[k];
                        const val = typeMode === 'line_atingido' ? vals.atingido : vals.pctOfRevenue;
                        
                        if (monthIdx + 1 <= currentMonthIdx + 1) {
                            points.push({
                                x: getX(monthIdx),
                                y: getYPct(val),
                                val
                            });
                        }
                    });

                    if (points.length === 0) return null;

                    let pathD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                    }

                    const lineColor = keyIdx === 0 ? '#10b981' : '#f59e0b';

                    return (
                        <g key={`right-line-${k}`}>
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
                                        stroke="#ffffff" 
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
                });

                return (
                    <svg viewBox="-70 0 1290 260" width="100%" height="auto" style={{ overflow: 'visible' }}>
                        {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, gridIdx) => {
                            const yGrid = yBaseline - ratio * 170;
                            return (
                                <g key={gridIdx}>
                                    <line x1="40" y1={yGrid} x2="1160" y2={yGrid} stroke="#f1f5f9" strokeWidth="0.5" strokeDasharray="3 3" />
                                    <text x="32" y={yGrid + 3} textAnchor="end" fill="#94a3b8" fontSize="7.5px" fontWeight="600"
                                        style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>
                                        {formatAbs(ratio * scaleMaxAbs, hasDailyActive)}
                                    </text>
                                    <text x="1168" y={yGrid + 3} textAnchor="start" fill="#94a3b8" fontSize="7.5px" fontWeight="600"
                                        style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>
                                        {(ratio * scaleMaxPct).toFixed(0)}%
                                    </text>
                                </g>
                            );
                        })}

                        <line x1="40" y1={yBaseline} x2="1160" y2={yBaseline} stroke="#cbd5e1" strokeWidth="1" />

                        {renderedBars}
                        {renderedLeftLines}
                        {renderedRightLines}

                        {data.map((m, idx) => (
                            <text 
                                key={idx} 
                                x={getX(idx)} 
                                y={yBaseline + 18} 
                                textAnchor="middle" 
                                fill="#475569" 
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

                return (
                    <svg viewBox="-70 0 1270 260" width="100%" height="auto" style={{ overflow: 'visible', maxHeight: '250px' }}>
                        {hasNegative ? (
                            <>
                                <line x1="80" y1="130" x2="1140" y2="130" stroke="#475569" strokeWidth="1.5" />
                                <line x1="80" y1="70" x2="1140" y2="70" stroke="#f1f5f9" strokeDasharray="3 3" />
                                <line x1="80" y1="190" x2="1140" y2="190" stroke="#f1f5f9" strokeDasharray="3 3" />
                            </>
                        ) : (
                            <>
                                <line x1="80" y1="210" x2="1140" y2="210" stroke="#cbd5e1" strokeWidth="1" />
                                <line x1="80" y1="130" x2="1140" y2="130" stroke="#f1f5f9" strokeDasharray="3 3" />
                                <line x1="80" y1="50" x2="1140" y2="50" stroke="#f1f5f9" strokeDasharray="3 3" />
                            </>
                        )}

                        <text x="75" y={hasNegative ? 74 : 54} textAnchor="end" fill="#94a3b8" fontSize="12px" fontWeight="700"
                            style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(maxVal)}</text>
                        <text x="75" y={yBaseline + 4} textAnchor="end" fill="#94a3b8" fontSize="12px" fontWeight="700"
                            style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(0)}</text>
                        {hasNegative && (
                            <text x="75" y="194" textAnchor="end" fill="#94a3b8" fontSize="12px" fontWeight="700"
                                style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(-maxVal)}</text>
                        )}

                        {data.map((m, idx) => {
                            const valB = pctOfRevenue ? m.pctOfRevenue : m.budget;
                            const valR = (idx + 1 <= currentMonthIdx + 1) ? (pctOfRevenue ? m.pctOfRevenue : m.realized) : 0;
                            
                            const bHeight = onlyRealized ? 0 : (Math.abs(valB) / maxVal) * maxBarHeight;
                            const rHeight = (idx + 1 <= currentMonthIdx + 1) ? (Math.abs(valR) / maxVal) * maxBarHeight : 0;
                            
                            const xBase = 80 + idx * 94;
                            const barWidth = onlyRealized ? 48 : 36;
                            const xB = xBase + 6;
                            const xR = onlyRealized ? xBase + 20 : xBase + 46;
                            
                            const isClose = !onlyRealized && (idx + 1 <= currentMonthIdx + 1) && Math.abs(bHeight - rHeight) < 14 && (valB >= 0 === valR >= 0);

                            const bLabelY = valB >= 0 ? yBaseline - bHeight - 8 : yBaseline + bHeight + 17;
                            let rLabelY = valR >= 0 ? yBaseline - rHeight - 8 : yBaseline + rHeight + 17;
                            if (isClose) {
                                rLabelY = valR >= 0 ? yBaseline - rHeight - 24 : yBaseline + rHeight + 33;
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
                                                fill="#cbd5e1" 
                                                rx="3" 
                                            />
                                            <text x={xB + barWidth / 2} y={bLabelY} textAnchor="middle" fill="#64748b" fontSize="12px" fontWeight="700">{formatVal(valB)}</text>
                                        </>
                                    )}

                                    {idx + 1 <= currentMonthIdx + 1 && valR !== 0 && (
                                        <>
                                            <rect 
                                                x={xR} 
                                                y={valR >= 0 ? yBaseline - rHeight : yBaseline} 
                                                width={barWidth} 
                                                height={rHeight} 
                                                fill={valR >= 0 ? chartColor : '#ef4444'} 
                                                rx="3" 
                                            />
                                            <text x={xR + barWidth / 2} y={rLabelY} textAnchor="middle" fill={valR >= 0 ? '#ffffff' : '#7f1d1d'} fontSize="12px" fontWeight="700">{formatVal(valR)}</text>
                                        </>
                                    )}

                                    <text x={xMonthText} y="242" textAnchor="middle" fill="#64748b" fontSize="13px" fontWeight="700">
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
                        <line x1={xBaseline} y1="10" x2={xBaseline} y2="295" stroke="#cbd5e1" strokeWidth="1.5" />
                        <line x1={xBaseline + maxBarWidth / 2} y1="10" x2={xBaseline + maxBarWidth / 2} y2="295" stroke="#f1f5f9" strokeDasharray="3 3" />
                        <line x1={xBaseline + maxBarWidth} y1="10" x2={xBaseline + maxBarWidth} y2="295" stroke="#cbd5e1" strokeDasharray="3 3" />

                        <text x={xBaseline} y="312" textAnchor="middle" fill="#94a3b8" fontSize="12px" fontWeight="700">{formatVal(0)}</text>
                        <text x={xBaseline + maxBarWidth / 2} y="312" textAnchor="middle" fill="#94a3b8" fontSize="12px" fontWeight="700">{formatVal(scaleMaxVal / 2)}</text>
                        <text x={xBaseline + maxBarWidth} y="312" textAnchor="middle" fill="#94a3b8" fontSize="12px" fontWeight="700">{formatVal(scaleMaxVal)}</text>

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
                                    <text x={xBaseline - 10} y={yBase + 14} textAnchor="end" fill="#64748b" fontSize="13px" fontWeight="700">
                                        {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                                    </text>

                                    {!onlyRealized && valB !== 0 && (
                                        <>
                                            <rect 
                                                x={xBaseline} 
                                                y={yB} 
                                                height={barHeight} 
                                                width={bWidth} 
                                                fill="#cbd5e1" 
                                                rx="1.5" 
                                            />
                                            <text x={xBaseline + bWidth + 5} y={yB + 8.5} textAnchor="start" fill="#64748b" fontSize="11.5px" fontWeight="700">{formatVal(valB)}</text>
                                        </>
                                    )}

                                    {idx + 1 <= currentMonthIdx + 1 && valR !== 0 && (
                                        <>
                                            <rect 
                                                x={xBaseline} 
                                                y={yR} 
                                                height={barHeight} 
                                                width={rWidth} 
                                                fill={valR >= 0 ? chartColor : '#ef4444'} 
                                                rx="1.5" 
                                            />
                                            <text x={xBaseline + rWidth + 5} y={yR + 8.5} textAnchor="start" fill={valR >= 0 ? chartColor : '#7f1d1d'} fontSize="11.5px" fontWeight="700">{formatVal(valR)}</text>
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

                let pathB = '';
                let pathR = '';
                const pointsB: { x: number, y: number, val: number }[] = [];
                const pointsR: { x: number, y: number, val: number }[] = [];

                data.forEach((m, idx) => {
                    const valB = pctOfRevenue ? m.pctOfRevenue : m.budget;
                    const valR = (idx + 1 <= currentMonthIdx + 1) ? (pctOfRevenue ? m.pctOfRevenue : m.realized) : 0;

                    const x = 50 + idx * 62;
                    const yB = yBaseline - (valB / maxVal) * maxLineHeight;
                    const yR = yBaseline - (valR / maxVal) * maxLineHeight;

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
                    <svg viewBox="-60 0 860 260" width="100%" height="220px" style={{ overflow: 'visible' }}>
                        {hasNegative ? (
                            <>
                                <line x1="40" y1="130" x2="760" y2="130" stroke="#475569" strokeWidth="1.5" />
                                <line x1="40" y1="70" x2="760" y2="70" stroke="#f1f5f9" strokeDasharray="3 3" />
                                <line x1="40" y1="190" x2="760" y2="190" stroke="#f1f5f9" strokeDasharray="3 3" />
                            </>
                        ) : (
                            <>
                                <line x1="40" y1="210" x2="760" y2="210" stroke="#cbd5e1" strokeWidth="1" />
                                <line x1="40" y1="130" x2="760" y2="130" stroke="#f1f5f9" strokeDasharray="3 3" />
                                <line x1="40" y1="50" x2="760" y2="50" stroke="#f1f5f9" strokeDasharray="3 3" />
                            </>
                        )}

                        <text x="35" y={hasNegative ? 74 : 54} textAnchor="end" fill="#94a3b8" fontSize="12px" fontWeight="700"
                            style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(maxVal)}</text>
                        <text x="35" y={yBaseline + 4} textAnchor="end" fill="#94a3b8" fontSize="12px" fontWeight="700"
                            style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(0)}</text>
                        {hasNegative && (
                            <text x="35" y="194" textAnchor="end" fill="#94a3b8" fontSize="12px" fontWeight="700"
                                style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 3, strokeLinejoin: 'round' }}>{formatVal(-maxVal)}</text>
                        )}

                        {!onlyRealized && pathB && (
                            <path d={pathB} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        {pathR && (
                            <path d={pathR} fill="none" stroke={chartColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        )}

                        {type === 'LINE_MARKERS' && (
                            <>
                                {!onlyRealized && pointsB.map((p, idx) => (
                                    <g key={`b-${idx}`}>
                                        <circle cx={p.x} cy={p.y} r="4" fill="#94a3b8" stroke="#ffffff" strokeWidth="1.5" />
                                        <text x={p.x} y={p.y - 12} textAnchor="middle" fill="#64748b" fontSize="12px" fontWeight="700">{formatVal(p.val)}</text>
                                    </g>
                                ))}

                                {pointsR.map((p, idx) => (
                                    <g key={`r-${idx}`}>
                                        <circle cx={p.x} cy={p.y} r="5" fill={chartColor} stroke="#ffffff" strokeWidth="2" />
                                        <text x={p.x} y={p.y - 13} textAnchor="middle" fill={chartColor} fontSize="12px" fontWeight="800">{formatVal(p.val)}</text>
                                    </g>
                                ))}
                            </>
                        )}

                        {data.map((m, idx) => (
                            <text key={idx} x={50 + idx * 62} y="242" textAnchor="middle" fill="#64748b" fontSize="13px" fontWeight="700">
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
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '0.8rem', fontWeight: 600, color: '#f43f5e' }}>
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
                                    stroke="#ffffff" 
                                    strokeWidth="1.5"
                                    onMouseEnter={(e) => e.currentTarget.style.fillOpacity = String(Math.max(0.2, sliceOpacity - 0.15))}
                                    onMouseLeave={(e) => e.currentTarget.style.fillOpacity = String(sliceOpacity)}
                                    style={{ transition: 'fill-opacity 0.2s', cursor: 'pointer' }}
                                />
                            );
                        })}

                        {type === 'DONUT' && (
                            <>
                                <circle cx={cx} cy={cy} r="52" fill="#ffffff" />
                                <text x={cx} y={cy - 6} textAnchor="middle" fill="#64748b" fontSize="12px" fontWeight="800" textTransform="uppercase" letterSpacing="0.05em">Total Realiz.</text>
                                <text x={cx} y={cy + 14} textAnchor="middle" fill="#0f172a" fontSize="15px" fontWeight="800">{formatVal(totalRealizedSum)}</text>
                            </>
                        )}

                        <g transform="translate(255, 10)">
                            {data.map((m, idx) => {
                                const val = idx + 1 <= currentMonthIdx + 1 ? Math.max(0, m.realized) : 0;
                                if (val === 0) return null;
                                const percentage = (val / totalRealizedSum) * 100;
                                const yPos = idx * 20;
                                const sliceOpacity = 1 - (idx * 0.065);

                                return (
                                    <g key={idx} transform={`translate(0, ${yPos})`}>
                                        <rect width="9" height="9" rx="2" fill={chartColor} fillOpacity={sliceOpacity} />
                                        <text x="14" y="9" fill="#475569" fontSize="12.5px" fontWeight="700">
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
                        <path d={getArcPath(cx, cy, R, 0, 63)} fill="none" stroke="#ef4444" strokeWidth="22" strokeLinecap="butt" />
                        <path d={getArcPath(cx, cy, R, 63, 85.5)} fill="none" stroke="#f59e0b" strokeWidth="22" strokeLinecap="butt" />
                        <path d={getArcPath(cx, cy, R, 85.5, 99)} fill="none" stroke="#10b981" strokeWidth="22" strokeLinecap="butt" />
                        <path d={getArcPath(cx, cy, R, 99, 180)} fill="none" stroke="#3b82f6" strokeWidth="22" strokeLinecap="butt" />

                        <text x={cx - R - 15} y={cy + 6} textAnchor="middle" fill="#64748b" fontSize="12.5px" fontWeight="800">0%</text>
                        <text x={cx} y={cy - R - 12} textAnchor="middle" fill="#64748b" fontSize="12.5px" fontWeight="800">100%</text>
                        <text x={cx + R + 18} y={cy + 6} textAnchor="middle" fill="#64748b" fontSize="12.5px" fontWeight="800">200%+</text>

                        <polygon points={`${cx - 2},${cy} ${needleX},${needleY} ${cx + 2},${cy}`} fill="#0f172a" />
                        <circle cx={cx} cy={cy} r="8.5" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />

                        <text x={cx} y={cy + 32} textAnchor="middle" fill={chartColor} fontSize="18px" fontWeight="800">
                            {atingido.toFixed(1)}% Atingido
                        </text>
                        <text x={cx} y={cy + 52} textAnchor="middle" fill="#64748b" fontSize="12.5px" fontWeight="700">
                            No mês de {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][mainMonth - 1]}
                        </text>
                    </svg>
                );
            }

            default:
                return null;
        }
    };

    const handleRegisterCategory = async () => {
        if (!newCategoryName.trim()) {
            alert('Por favor, informe o nome da categoria.');
            return;
        }
        if (!analysisSelectedTenant) {
            alert('Por favor, selecione a empresa associada.');
            return;
        }
        setIsCategoryRegistering(true);
        try {
            const res = await fetch('/api/kpi/analysis/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newCategoryName.trim(),
                    type: newCategoryType,
                    entradaDre: newCategoryGroup,
                    tenantId: analysisSelectedTenant
                })
            });
            const result = await res.json();
            if (result.success) {
                setCategories(prev => [...prev, result.data]);
                setAnalysisSelectedCategory(result.data.id);
                setNewCategoryName('');
                setIsQuickCategoryFormOpen(false);
                alert('Categoria cadastrada e selecionada com sucesso!');
            } else {
                alert(`Erro ao cadastrar categoria: ${result.error}`);
            }
        } catch (e) {
            alert('Erro ao conectar ao servidor para cadastrar categoria.');
        } finally {
            setIsCategoryRegistering(false);
        }
    };

    const chartButtonStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0 0.75rem',
        height: '28px',
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '0.7rem',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(37, 99, 235, 0.15)',
        transition: 'all 0.15s ease'
    };

    const openAnalysisForChart = (indicatorType: string) => {
        const defaultTenant = selectedCompany.includes('DEFAULT') ? (companies?.[0]?.id || '') : selectedCompany[0];
        setAnalysisSelectedTenant(defaultTenant);
        setAnalysisSelectedMonth(startMonth + 1);
        setAnalysisCategorySearch('');
        setIsCategoryDropdownOpen(false);
        
        // Find matching category for default tenant
        let defaultCatId = '';
        const tenantCats = categories.filter((c: any) => c.tenantId === defaultTenant);
        
        const dreKeys = ['vRev', 'vTaxes', 'vRecLiq', 'vCosts', 'vGrossMarg', 'vOpExp', 'vContribMarg', 'vAdminExp', 'vEbitda', 'vFin', 'vNetProfit', 'vInvest'];
        if (dreKeys.includes(indicatorType)) {
            defaultCatId = indicatorType;
        } else if (indicatorType === 'receita') {
            defaultCatId = 'vRev';
        } else if (indicatorType === 'faturamento') {
            defaultCatId = 'vRev';
        } else if (indicatorType === 'margem_bruta') {
            defaultCatId = 'vGrossMarg';
        } else if (indicatorType === 'margem_contribuicao') {
            defaultCatId = 'vContribMarg';
        } else if (indicatorType === 'contratos') {
            const found = tenantCats.find((c: any) => c.type === 'REVENUE' || c.entradaDre?.includes('CUSTOS') || c.entradaDre?.includes('DESPESAS'));
            if (found) defaultCatId = found.id;
        }
        
        setAnalysisSelectedCategory(defaultCatId);
        setDeviationReport('');
        setAnalysisPerformed('');
        setAnalysisActions([]);
        setAnalysisComments([]);
        setActiveModalTab('deviation');
        setIsEditingChart(false);
        setIsAnalysisModalOpen(true);
    };



    // --- Dynamic Filters ---
    // React to pendingCompany so the CC dropdown updates IMMEDIATELY as the user picks a company,
    // without requiring them to press "Filtrar" first.
    const filteredCostCenters = useMemo(() => {
        if (pendingCompany.includes('DEFAULT')) return costCenters;
        // Only show CCs that belong to one of the pending companies
        return costCenters.filter((cc: any) => cc.id === 'DEFAULT' || !cc.tenantId || pendingCompany.includes(cc.tenantId));
    }, [costCenters, pendingCompany]);

    // 1. Setup Effect
    useEffect(() => {
        const loadSetup = async () => {
            try {
                // Ensure we get fresh categories and cost centers (filtered by year/activity)
                const setupRes = await fetch(`/api/setup?year=${selectedYear}&t=${Date.now()}`, { cache: 'no-store' });
                const setupData = await setupRes.json();
                
                if (setupData.success) {
                    setCategories(setupData.categories || []);
                    if (setupData.costCenters && setupData.costCenters.length > 0) {
                        setCostCenters([...MOCK_COST_CENTERS.filter(m => m.id === 'DEFAULT'), ...setupData.costCenters]);
                    }
                }
            } catch (err) {
                console.error("Setup Error:", err);
            }
        };
        loadSetup();
    }, [refreshKey, selectedYear, internalRefresh]);

    // 2. Data Effect
    useEffect(() => {
        const loadValues = async () => {
            setLoading(true);
            setError(null);
            try {
                const companyParam = selectedCompany.includes('DEFAULT') ? 'ALL' : selectedCompany.join(',');
                const [budgetRes, syncRes, indicatorsRes] = await Promise.all([
                    fetch(`/api/budgets?costCenterId=${selectedCostCenter.join(',')}&tenantId=${companyParam}&year=${selectedYear}&t=${Date.now()}`, { cache: 'no-store' }),
                    fetch(`/api/sync?costCenterId=${selectedCostCenter.join(',')}&tenantId=${companyParam}&year=${selectedYear}&viewMode=${viewMode}&t=${Date.now()}`, { cache: 'no-store' }),
                    fetch(`/api/realized/justifications/indicators?tenantId=${companyParam}&year=${selectedYear}&viewMode=${viewMode}&t=${Date.now()}`, { cache: 'no-store' }).catch(() => null)
                ]);

                // 1. Process Budget
                if (budgetRes?.ok) {
                    const budgetData = await budgetRes.json();
                    if (budgetData.success) {
                        setIsCCLocked(budgetData.isCCLocked || false);
                        setRadarLocks(budgetData.radarLocks || []);
                        const values: Record<string, { amount: number, radarAmount: number | null, isLocked: boolean, observation: string | null, compositionItems?: any[] }> = {};
                        budgetData.data.forEach((item: any) => {
                            values[`${item.categoryId}-${item.month - 1}`] = {
                                amount: item.amount || 0,
                                radarAmount: (item.radarAmount !== undefined && item.radarAmount !== null) ? item.radarAmount : null,
                                isLocked: item.isLocked || false,
                                observation: item.observation || null,
                                compositionItems: item.compositionItems || []
                            };
                        });
                        setBudgetValues(values);
                    }
                }

                // 2. Process Sync/Realized
                if (syncRes?.ok) {
                    const syncData = await syncRes.json();
                    if (syncData.success && syncData.realizedValues) {
                        setRealizedValues(syncData.realizedValues);
                    }
                }

                // 3. Process Indicators (Optional)
                if (indicatorsRes?.ok) {
                    try {
                        const indicatorsData = await indicatorsRes.json();
                        if (indicatorsData.success) {
                            setHasJustificationMap(indicatorsData.indicators);
                        }
                    } catch (e) {
                        console.warn("Indicators data error:", e);
                    }
                }

                // Fetch deviations and users list
                const activeTenantId = selectedCompany.includes('DEFAULT') ? companies?.[0]?.id : selectedCompany[0];
                if (activeTenantId) {
                    const [devsRes, usersRes] = await Promise.all([
                        fetch(`/api/deviations?tenantId=${activeTenantId}&year=${selectedYear}&t=${Date.now()}`),
                        fetch(`/api/users/list?tenantId=${activeTenantId}&t=${Date.now()}`)
                    ]);
                    if (devsRes.ok) {
                        const d = await devsRes.json();
                        if (d.success) setDeviations(d.data || []);
                    }
                    if (usersRes.ok) {
                        const u = await usersRes.json();
                        if (u.success) setUsersList(u.data || []);
                    }
                }
            } catch (err: any) {
                console.error('Grid Load Error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadValues();
    }, [selectedCostCenter, selectedCompany, selectedYear, refreshKey, viewMode, internalRefresh]);

    useEffect(() => {
        if (activeTab !== 'kpi') return;

        const fetchContracts = async () => {
            setContractsLoading(true);
            try {
                const companyParam = selectedCompany.join(',');
                const ccParam = selectedCostCenter.join(',');
                const res = await fetch(`/api/kpi/contracts?tenantId=${companyParam}&costCenterId=${ccParam}&year=${selectedYear}&startMonth=${startMonth}&endMonth=${endMonth}&viewMode=${viewMode}`);
                const data = await res.json();
                if (data.success) {
                    setContractsData(data.contracts || []);
                    setContractsMarginData(data.contractsMargin || []);
                    setMonthlyBudgets(data.monthlyBudgets || {});
                    setContractsAnnualTotal(data.totalAnnualRealized || 0);
                    setSelectedContractsMonth('accumulated');
                }
            } catch (err) {
                console.error("Error fetching contracts:", err);
            } finally {
                setContractsLoading(false);
            }
        };

        fetchContracts();
    }, [activeTab, selectedCompany, selectedCostCenter, selectedYear, startMonth, endMonth, viewMode, refreshKey]);
    
    // --- VARIANT LOGIC (CNPJ-BASED) ---
    const activeVariantIds = useMemo(() => {
        if (selectedCompany.includes('DEFAULT')) return [];
        
        const allIds = new Set<string>();
        
        selectedCompany.forEach(localTenantId => {
            const current = companies.find(c => c.id === localTenantId);
            if (!current) {
                allIds.add(localTenantId);
                return;
            }
            
            const getBaseCnpj = (cnpj: string) => {
                const clean = cnpj || '';
                if (clean.toLowerCase().includes('unknown')) return '';
                return clean.replace(/\D/g, '').substring(0, 8);
            };
            const currentBase = getBaseCnpj((current as any).cnpj);
            
            const normalize = (n: string) => (n || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/LTDA$/, '').replace(/SA$/, '');
            const currentNorm = normalize(current.name);
            
            companies.forEach((c: any) => {
                const matchesCnpj = currentBase && currentBase.length === 8 && getBaseCnpj(c.cnpj) === currentBase;
                const matchesName = normalize(c.name) === currentNorm;
                if (matchesCnpj || matchesName) {
                    allIds.add(c.id);
                }
            });
        });
        
        return Array.from(allIds);
    }, [companies, selectedCompany]);

    // --- HIERARCHY BUILDER ---
    const treeRoots = useMemo(() => {
        const map = new Map<string, CategoryNode>();
        const potentialRoots: CategoryNode[] = [];
        const codeMap = new Map<string, CategoryNode>();
        const nameMap = new Map<string, CategoryNode>();

        const validCategories = selectedCompany.includes('DEFAULT') 
            ? categories 
            : categories.filter((c: any) => activeVariantIds.includes(c.tenantId || ''));

        // 1. Initial Load
        validCategories.forEach((cat: any) => {
            // V47.142 - Strict Key: Isolation + Identity
            // REMOVED cat.tenantId from uniqueKey to merge identical categories across variants/companies in consolidated view.
            const cleanCode = (cat.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            const uniqueKey = `${cat.type}|${cleanCode || cat.name.trim()}`;

            if (nameMap.has(uniqueKey)) {
                const existingNode = nameMap.get(uniqueKey)!;
                if (!existingNode.id.split(',').includes(cat.id)) {
                    existingNode.id += ',' + cat.id;
                }
                map.set(cat.id, existingNode);
                return;
            }

            const node: CategoryNode = {
                ...cat,
                name: cat.name,
                code: cleanCode,
                children: [],
                level: 0,
                isSynthetic: false,
                tenantId: cat.tenantId
            };
            map.set(cat.id, node);
            // Fallback for simple ID matching if IDs are prefixed with tenantId
            if (cat.id.includes(':')) {
                map.set(cat.id.split(':')[1], node);
            }
            nameMap.set(uniqueKey, node);
            if (cleanCode) {
                codeMap.set(cleanCode, node);
                // Also map with leading zero if missing for hierarchy matching
                if (!cleanCode.startsWith('0') && cleanCode.length > 0) codeMap.set(`0${cleanCode}`, node);
            }
        });

        const syntheticParents = [
            { code: '01.1', name: '01.1 - Receita de Serviços', parentCode: '01' },
            { code: '01.2', name: '01.2 - Receitas de Vendas', parentCode: '01' },
            { code: '02.1', name: '02.1 - Tributos', parentCode: '02' },
            // CUSTOS OPERACIONAIS (03.1 to 03.9)
            { code: '03.1', name: '03.1 Salarios e Remuneração', parentCode: '03' },
            { code: '03.2', name: '03.2 Encargos Sociais', parentCode: '03' },
            { code: '03.3', name: '03.3 Beneficios', parentCode: '03' },
            { code: '03.4', name: '03.4 Diárias', parentCode: '03' },
            { code: '03.5', name: '03.5 SSMA', parentCode: '03' },
            { code: '03.6', name: '03.6 Materiais', parentCode: '03' },
            { code: '03.7', name: '03.7 Equipamentos', parentCode: '03' },
            { code: '03.8', name: '03.8 Comunicação/Sistema/Licenças', parentCode: '03' },
            { code: '03.9', name: '03.9 Custo com Veiculo', parentCode: '03' },
            { code: '03.10', name: '03.10 Custos Transferidos', parentCode: '03' },
            // DESPESAS OPERACIONAIS (04.1 to 04.8)
            { code: '04.1', name: '04.1 Salarios e Remuneração', parentCode: '04' },
            { code: '04.2', name: '04.2 Encargos Sociais', parentCode: '04' },
            { code: '04.3', name: '04.3 Beneficios', parentCode: '04' },
            { code: '04.4', name: '04.4 SSMA', parentCode: '04' },
            { code: '04.5', name: '04.5 Viagens', parentCode: '04' },
            { code: '04.6', name: '04.6 Custo com Veículos', parentCode: '04' },
            { code: '04.7', name: '04.7 Cartão Corporativo', parentCode: '04' },
            { code: '04.8', name: '04.8 Serviços Terceirizados', parentCode: '04' },
            // DESPESAS ADMINISTRATIVAS (05.1 to 05.13)
            { code: '05.1', name: '05.1 Salario e Remuneração', parentCode: '05' },
            { code: '05.2', name: '05.2 Encargos Sociais', parentCode: '05' },
            { code: '05.3', name: '05.3 Beneficios', parentCode: '05' },
            { code: '05.4', name: '05.4 SSMA', parentCode: '05' },
            { code: '05.5', name: '05.5 Viagens', parentCode: '05' },
            { code: '05.6', name: '05.6 Despesa com Socios', parentCode: '05' },
            { code: '05.7', name: '05.7 Serviços Contratados', parentCode: '05' },
            { code: '05.8', name: '05.8 Despesa Comercial/Marketing', parentCode: '05' },
            { code: '05.9', name: '05.9 Despesa com Estrutura', parentCode: '05' },
            { code: '05.10', name: '05.10 Despesa Copa e Cozinha', parentCode: '05' },
            { code: '05.11', name: '05.11 Despesa com Veículos', parentCode: '05' },
            { code: '05.12', name: '05.12 Despesa de Informatica', parentCode: '05' },
            { code: '05.13', name: '05.13 Taxas e Despesas Legais', parentCode: '05' },
            // DESPESAS FINANCEIRAS (06.1 to 06.8)
            { code: '06.1', name: '06.1 Entradas Financeiras', parentCode: '06' },
            { code: '06.2', name: '06.2 Saidas Financeiras', parentCode: '06' },
            { code: '06.3', name: '06.3 Financiamento', parentCode: '06' },
            { code: '06.4', name: '06.4 Juros/Multas', parentCode: '06' },
            { code: '06.5', name: '06.5 Passivo Trabalhista', parentCode: '06' },
            { code: '06.6', name: '06.6 Depreciação', parentCode: '06' },
            { code: '06.7', name: '06.7 Cartão de Credito', parentCode: '06' },
            { code: '06.8', name: '06.8 PDD', parentCode: '06' },
            { code: '06.9', name: '06.9 Dividas', parentCode: '06' },
        ];

        syntheticParents.forEach(synth => {
            if (!codeMap.has(synth.code)) {
                const node = {
                    id: `synth-${synth.code}`,
                    name: synth.name,
                    parentId: null,
                    children: [],
                    level: 0,
                    code: synth.code,
                    isSynthetic: true
                };
                map.set(node.id, node);
                codeMap.set(synth.code, node);
            }
        });

        // 3. Linking
        map.forEach(node => {
            const code = node.code || '';

            if (node.isSynthetic) {
                const synthDef = syntheticParents.find(s => s.code === code);
                if (synthDef && synthDef.parentCode) {
                    const parent = codeMap.get(synthDef.parentCode);
                    if (parent) {
                        const alreadyHas = parent.children.some(c => c.id === node.id);
                        if (!alreadyHas) {
                            parent.children.push(node);
                        }
                    }
                }
                return;
            }

            if (code.startsWith('01.1.')) {
                const parent = codeMap.get('01.1');
                if (parent) { parent.children.push(node); return; }
            }
            if (code.startsWith('01.2.')) {
                const parent = codeMap.get('01.2');
                if (parent) { parent.children.push(node); return; }
            }
            if (code.startsWith('2.1')) {
                const parent = codeMap.get('02.1');
                if (parent) { parent.children.push(node); return; }
            }

            let parentFound = false;
            if (code.includes('.')) {
                let currentPrefix = code.substring(0, code.lastIndexOf('.'));
                while (currentPrefix.length > 0) {
                    const potentialParent = Array.from(codeMap.values()).find(n => n.code === currentPrefix);
                    if (potentialParent) {
                        if (!potentialParent.children.includes(node)) {
                            potentialParent.children.push(node);
                        }
                        parentFound = true;
                        break;
                    }
                    if (!currentPrefix.includes('.')) break;
                    currentPrefix = currentPrefix.substring(0, currentPrefix.lastIndexOf('.'));
                }
            }

            if (!parentFound && code.match(/^(0[3456])\.(\d+)\./)) {
                const match = code.match(/^(0[3456])\.(\d+)/);
                if (match) {
                    const synthParentCode = match[0];
                    const synthParent = codeMap.get(synthParentCode);
                    if (synthParent) {
                        const alreadyHas = synthParent.children.some(c => c.id === node.id);
                        if (!alreadyHas) {
                            synthParent.children.push(node);
                        }
                    }
                }
            }
        });

        // 4. Roots Retrieval
        const allChildren = new Set<string>();
        map.forEach(node => node.children.forEach(c => allChildren.add(c.id)));

        map.forEach(node => {
            if (!allChildren.has(node.id)) {
                potentialRoots.push(node);
            }
        });

        // 5. ROOT DEDUPLICATION
        const uniqueRootsMap = new Map<string, CategoryNode>();
        potentialRoots.forEach(root => {
            const rootCode = root.code || root.name;
            if (uniqueRootsMap.has(rootCode)) {
                const existingRoot = uniqueRootsMap.get(rootCode)!;
                root.children.forEach(child => {
                    if (!existingRoot.children.find(c => c.id === child.id)) {
                        existingRoot.children.push(child);
                    }
                });
                if (rootCode === '01') existingRoot.name = 'RECEITAS';
                if (rootCode === '02') existingRoot.name = 'TRIBUTO SOBRE FATURAMENTO';
            } else {
                uniqueRootsMap.set(rootCode, root);
            }
        });

        const finalRoots = Array.from(uniqueRootsMap.values());

        // 6. DEDUPLICATE CHILDREN (Critical for merged nodes across 4 companies)
        map.forEach(node => {
            if (node.children.length > 0) {
                const uniqueChildren = new Map<string, CategoryNode>();
                node.children.forEach(c => uniqueChildren.set(c.id, c));
                node.children = Array.from(uniqueChildren.values());
            }
        });

        // 7. FIX LEVELS & SORT
        const getCleanCode = (name: string) => {
            const match = name.match(/^(\d{1,2}(?:\.\d+)*)/);
            return match ? match[1] : '';
        };

        const recalculateLevels = (nodes: CategoryNode[], lvl: number) => {
            nodes.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));
            nodes.forEach(n => {
                const code = n.code || getCleanCode(n.name);
                const dots = (code.match(/\./g) || []).length;
                n.level = code ? dots : lvl;
                recalculateLevels(n.children, n.level + 1);
            });
        };
        recalculateLevels(finalRoots, 0);

        return finalRoots;
    }, [categories, selectedCompany, activeVariantIds]);

    // --- RECURSIVE TOTALS ---
    const nodeTotals = useMemo(() => {
        const totalsMap = new Map<string, { budget: number[], realized: number[], radar: number[] }>();
        const isNegatedCode = (code: string) => {
            const norm = code.split('.').map(part => part.replace(/^0+/, '') || '0').join('.');
            return norm === '6.1' || norm.startsWith('6.1.');
        };

        const calculateNode = (node: CategoryNode, parentNegated = false) => {
            const negated = parentNegated || isNegatedCode(node.code || '');
            const childrenTotals = node.children.map(child => calculateNode(child, negated));
            const myBudget = new Array(12).fill(0);
            const myRealized = new Array(12).fill(0);
            const myRadar = new Array(12).fill(0);

            childrenTotals.forEach(childTotal => {
                for (let i = 0; i < 12; i++) {
                    myBudget[i] += childTotal.budget[i];
                    myRealized[i] += childTotal.realized[i];
                    myRadar[i] += childTotal.radar[i];
                }
            });

            for (let i = 0; i < 12; i++) {
                // RULE: Allow all categories
                const isDataPoint = !node.isSynthetic && node.children.length === 0;

                if (!node.isSynthetic && isDataPoint) {
                    const sign = negated ? -1 : 1;
                    const idsToRead = node.id.split(',');
                    let sumB = 0, sumR = 0, sumRadar = 0;

                    // FIXED: Aggressive normalization matching the Sync API to consolidate variants (hyphens, spaces, etc)
                    // Added a Set to prevent reading the same normalizedName multiple times for the same merged node/month
                    const readNames = new Set<string>();
                    idsToRead.forEach(rawId => {
                        const cat = categories.find(c => c.id === rawId);
                        const nameToUse = cat ? cat.name : node.name;
                        const normalizedName = nameToUse.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const lookupKey = `${normalizedName}|${i}`;
                        if (!readNames.has(lookupKey)) {
                            readNames.add(lookupKey);
                            sumR += realizedValues[lookupKey] || 0;
                        }
                    });

                    for (const rawId of idsToRead) {
                        const bData = budgetValues[`${rawId}-${i}`] || { amount: 0, radarAmount: 0, isLocked: false };
                        sumB += bData.amount;
                        const hasRadar = bData.radarAmount !== undefined && bData.radarAmount !== null;
                        const radarVal = hasRadar ? (bData.radarAmount as number) : bData.amount;
                        sumRadar += radarVal;
                    }

                    myBudget[i] += sign * sumB;
                    myRealized[i] += sign * sumR;
                    myRadar[i] += sign * sumRadar;
                }
            }

            totalsMap.set(node.id, { budget: myBudget, realized: myRealized, radar: myRadar });
            return { budget: myBudget, realized: myRealized, radar: myRadar };
        };

        treeRoots.forEach(root => calculateNode(root));
        return totalsMap;
    }, [treeRoots, budgetValues, realizedValues, viewMode, categories]);

    // --- DRE STRUCTURE ---
    const dreStructure = useMemo(() => {
        const sumRoots = (roots: CategoryNode[], monthIdx: number, type: 'budget' | 'realized' | 'radar') => {
            return roots.reduce((acc, root) => {
                const total = nodeTotals.get(root.id);
                return acc + (total ? total[type][monthIdx] : 0);
            }, 0);
        };

        const buckets = {
            rev: [] as CategoryNode[],
            taxes: [] as CategoryNode[],
            costs: [] as CategoryNode[],
            opExp: [] as CategoryNode[],
            adminExp: [] as CategoryNode[],
            fin: [] as CategoryNode[],
            invest: [] as CategoryNode[],
            other: [] as CategoryNode[]
        };

        treeRoots.forEach(root => {
            const code = root.code || '';
            if (code.startsWith('01') || code.startsWith('1')) buckets.rev.push(root);
            else if (code.startsWith('02') || code.startsWith('2')) buckets.taxes.push(root);
            else if (code.startsWith('3') || code.startsWith('03')) buckets.costs.push(root);
            else if (code.startsWith('4') || code.startsWith('04')) buckets.opExp.push(root);
            else if (code.startsWith('5') || code.startsWith('05') || code.startsWith('8') || code.startsWith('08')) buckets.adminExp.push(root);
            else if (code.startsWith('6') || code.startsWith('06') || code.startsWith('9') || code.startsWith('09') || code.startsWith('10')) buckets.fin.push(root);
            else if (code.startsWith('7') || code.startsWith('07')) buckets.invest.push(root);
            else buckets.other.push(root);
        });

        return {
            buckets,
            calculateTotals: (monthIdx: number) => {
                const vRev = { b: sumRoots(buckets.rev, monthIdx, 'budget'), r: sumRoots(buckets.rev, monthIdx, 'realized'), rd: sumRoots(buckets.rev, monthIdx, 'radar') };
                const vTaxes = { b: sumRoots(buckets.taxes, monthIdx, 'budget'), r: sumRoots(buckets.taxes, monthIdx, 'realized'), rd: sumRoots(buckets.taxes, monthIdx, 'radar') };
                const vRecLiq = { b: vRev.b - vTaxes.b, r: vRev.r - vTaxes.r, rd: vRev.rd - vTaxes.rd };
                const vCosts = { b: sumRoots(buckets.costs, monthIdx, 'budget'), r: sumRoots(buckets.costs, monthIdx, 'realized'), rd: sumRoots(buckets.costs, monthIdx, 'radar') };
                const vGrossMarg = { b: vRecLiq.b - vCosts.b, r: vRecLiq.r - vCosts.r, rd: vRecLiq.rd - vCosts.rd };
                const vOpExp = { b: sumRoots(buckets.opExp, monthIdx, 'budget'), r: sumRoots(buckets.opExp, monthIdx, 'realized'), rd: sumRoots(buckets.opExp, monthIdx, 'radar') };
                const vContribMarg = { b: vGrossMarg.b - vOpExp.b, r: vGrossMarg.r - vOpExp.r, rd: vGrossMarg.rd - vOpExp.rd };
                const vAdminExp = { b: sumRoots(buckets.adminExp, monthIdx, 'budget'), r: sumRoots(buckets.adminExp, monthIdx, 'realized'), rd: sumRoots(buckets.adminExp, monthIdx, 'radar') };
                const vEbitda = { b: vContribMarg.b - vAdminExp.b, r: vContribMarg.r - vAdminExp.r, rd: vContribMarg.rd - vAdminExp.rd };
                const vFin = { b: sumRoots(buckets.fin, monthIdx, 'budget'), r: sumRoots(buckets.fin, monthIdx, 'realized'), rd: sumRoots(buckets.fin, monthIdx, 'radar') };
                const vNetProfit = { b: vEbitda.b - vFin.b, r: vEbitda.r - vFin.r, rd: vEbitda.rd - vFin.rd };
                const vInvest = { b: sumRoots(buckets.invest, monthIdx, 'budget'), r: sumRoots(buckets.invest, monthIdx, 'realized'), rd: sumRoots(buckets.invest, monthIdx, 'radar') };

                return { vRev, vTaxes, vRecLiq, vCosts, vGrossMarg, vOpExp, vContribMarg, vAdminExp, vEbitda, vFin, vNetProfit, vInvest };
            }
        };
    }, [treeRoots, nodeTotals]);

    // Formatters
    const formatDateSafe = (dateVal: any, options?: Intl.DateTimeFormatOptions) => {
        if (!dateVal) return '-';
        try {
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return '-';
            if (options?.timeZone === 'UTC') {
                const year = d.getUTCFullYear();
                const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                const day = String(d.getUTCDate()).padStart(2, '0');
                return `${day}/${month}/${year}`;
            }
            const dateStr = String(dateVal);
            if (dateStr.length <= 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                const year = d.getUTCFullYear();
                const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                const day = String(d.getUTCDate()).padStart(2, '0');
                return `${day}/${month}/${year}`;
            }
            return d.toLocaleDateString('pt-BR', options);
        } catch (e) {
            return '-';
        }
    };

    const formatTimeSafe = (dateVal: any, options?: Intl.DateTimeFormatOptions) => {
        if (!dateVal) return '';
        try {
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleTimeString('pt-BR', options);
        } catch (e) {
            return '';
        }
    };

    const formatDateTimeSafe = (dateVal: any, options?: Intl.DateTimeFormatOptions) => {
        if (!dateVal) return '-';
        try {
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return '-';
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            if (options?.dateStyle === 'short' && options?.timeStyle === 'short') {
                return `${day}/${month}/${year} ${hours}:${minutes}`;
            }
            if (options?.hour === '2-digit' && options?.minute === '2-digit') {
                return `${hours}:${minutes}`;
            }
            return d.toLocaleString('pt-BR', options);
        } catch (e) {
            return '-';
        }
    };


    const formatCurrency = (val: number | undefined) => {
        if (typeof val !== 'number') return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const formatGridValue = (val: number | undefined, isHighlighted: boolean) => {
        if (val === undefined || val === null || val === 0) {
            return isHighlighted ? 'R$ 0,00' : '...';
        }
        return formatCurrency(val);
    };

    const toggleRow = (id: string) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedRows(newSet);
    };

    const toggleGroup = (groupName: string) => {
        const newSet = new Set(expandedGroups);
        if (newSet.has(groupName)) newSet.delete(groupName);
        else newSet.add(groupName);
        setExpandedGroups(newSet);
    };

    const allGroupKeys = ['rev', 'taxes', 'costs', 'opExp', 'adminExp', 'fin'];
    const expandableRowIds = useMemo(() => {
        return categories.filter(c => categories.some(ch => ch.parentId === c.id)).map(c => c.id);
    }, [categories]);

    const isAnyExpanded = expandedGroups.size > 0 || expandedRows.size > 0;

    const handleToggleAll = () => {
        if (isAnyExpanded) {
            setExpandedGroups(new Set());
            setExpandedRows(new Set());
        } else {
            setExpandedGroups(new Set(allGroupKeys));
            setExpandedRows(new Set(expandableRowIds));
        }
    };

    const handleSaveBudget = async () => {
        if (!budgetModal) return;
        setIsSavingBudget(true);
        try {
            const entries: Record<string, any>[] = [];
            const targetCompanyParam = selectedCompany.includes('DEFAULT') ? 'ALL' : selectedCompany[0];

            const hasObservation = modalObservation.trim().length > 0;
            for (let i = 0; i < 12; i++) {
                const currentVal = modalValues[i];
                if (currentVal === '' && budgetValues[`${budgetModal.categoryId}-${i}`] === undefined && !hasObservation) continue;

                const numericVal = evaluateFormula(currentVal);
                const isBudget = budgetModal.type === 'budget';

                // CRITICAL: If categoryId is merged (e.g. "id1,id2"), we must ONLY
                // save to the ID that belongs to the selected company (targetCompanyParam).
                // Use fullNodeId so we can clean up the ghost entries in other tenants.
                const allIds = (budgetModal.fullNodeId || budgetModal.categoryId).split(',');
                let targetId = allIds[0]; // Default to first if not found
                
                if (targetCompanyParam !== 'ALL') {
                    // Find which category in the group actually belongs to the selected company
                    const matchId = categories.find((c: any) => allIds.includes(c.id) && c.tenantId === targetCompanyParam);
                    if (matchId) targetId = matchId.id;
                } else {
                    // If ALL is selected, we should respect the original tenant of the category
                    // but for simplicity in "ALL" view, we use the first one. 
                    // However, the cleaning logic below handles other IDs.
                }

                const ccUuidRaw = selectedCostCenter[0] ? selectedCostCenter[0].split(':').pop() : '';
                const ccDeleteCondition = selectedCostCenter[0]
                    ? { OR: [{ costCenterId: selectedCostCenter[0] }, { costCenterId: { contains: ccUuidRaw } }] }
                    : { OR: [{ costCenterId: null }, { costCenterId: '' }] };

                // --- v67.32: Multi-Item Atomic Save ---
                const initMonthItems = initialCompositionRows.filter(r => (r.values[i] || '').trim() !== '').map(r => ({ description: r.description.trim(), amount: r.values[i] }));
                const currMonthItems = modalCompositionRows.filter(r => r.description.trim() !== '' && (r.values[i] || '').trim() !== '').map(r => ({ description: r.description.trim(), amount: r.values[i] }));
                const hasCompositionsNow = currMonthItems.length > 0;
                const computedNumFromRows = currMonthItems.reduce((acc, it) => acc + evaluateFormula(it.amount), 0);
                const finalNumForThisMonth = hasCompositionsNow ? computedNumFromRows : numericVal;

                const entry: any = {
                    categoryId: targetId,
                    month: i + 1, // DB uses 1-indexed months
                    year: selectedYear,
                    costCenterId: selectedCostCenter[0],
                    tenantId: targetCompanyParam === 'ALL' ? (categories.find(c => c.id === targetId)?.tenantId || 'ALL') : targetCompanyParam,
                    observation: modalObservation.trim() || null,
                    amount: finalNumForThisMonth,
                    isLocked: !!lockedMonths[i],
                    radarAmount: isBudget ? (budgetValues[`${targetId}-${i}`]?.radarAmount ?? null) : numericVal,
                    items: currMonthItems.map(it => ({
                        description: it.description || 'Sem Descrição',
                        amount: evaluateFormula(it.amount)
                    }))
                };
                
                entries.push(entry);

                // IMPORTANT: If this category represents a merged group (multiple IDs), 
                // we must "clean" the other IDs by setting them to 0 (or null radarAmount) 
                // to avoid them summing up in the UI.
                if (allIds.length > 1) {
                    allIds.forEach((id: string) => {
                        if (id !== targetId) {
                            const catObj = categories.find(c => c.id === id);
                            const cleanEntry: any = {
                                categoryId: id,
                                month: i,
                                year: selectedYear,
                                costCenterId: selectedCostCenter[0],
                                tenantId: catObj?.tenantId || targetCompanyParam, // Important: Use the specific category's tenant
                                observation: entry.observation,
                                amount: 0,
                                radarAmount: null
                            };
                            if (userRole === 'MASTER') cleanEntry.isLocked = lockedMonths[i];
                            entries.push(cleanEntry);
                        }
                    });
                }

                // --- AUTOMATIC CHARGES CALCULATION (Encargos Sociais) ---
                const catName = budgetModal.categoryName || "";
                const codeMatch = catName.match(/^([\d.]+)/);
                const rawCode = codeMatch ? codeMatch[1] : '';
                const norm = (c: string) => c.split('.').map(s => parseInt(s, 10).toString()).filter(s => s !== 'NaN').join('.');
                const normCode = rawCode ? norm(rawCode) : '';

                // Apply to anything starting with 3.1 (Salários e Remuneração)
                if (normCode.startsWith('3.1')) {
                    const chargeConfigs = [
                        { code: '03.2.1', rate: 0.08 },
                        { code: '03.2.2', rate: 0.0833 },
                        { code: '03.2.3', rate: 0.1111 },
                        { code: '03.2.4', rate: 0.032 }
                    ];

                    // Calculate the BASE for encargos = sum of ALL 03.1.x items for this month
                    // Replace the current item's stored value with the NEW value being saved
                    const currentNodeIds = budgetModal.fullNodeId.split(',');
                    let salaryBase = 0;
                    categories.forEach((cat: any) => {
                        const cMatch = cat.name?.match(/^([\d.]+)/);
                        if (!cMatch) return;
                        const catNorm = norm(cMatch[1]);
                        if (!catNorm.startsWith('3.1')) return;
                        if (cat.tenantId !== (targetCompanyParam === 'ALL' ? cat.tenantId : targetCompanyParam)) return;
                        // For all 03.1.x categories, sum the value for this month
                        const catIds = cat.id.split(',');
                        // Check if this is the category being edited right now
                        const isCurrentCat = catIds.some((id: string) => currentNodeIds.includes(id));
                        if (isCurrentCat) {
                            // Use the NEW value being saved
                            salaryBase += numericVal;
                        } else {
                            // Use the already-saved value from budgetValues
                            catIds.forEach((id: string) => {
                                const key = `${id}-${i}`;
                                const stored = budgetValues[key];
                                if (stored) {
                                    salaryBase += isBudget ? (stored.amount || 0) : (stored.radarAmount || stored.amount || 0);
                                }
                            });
                        }
                    });

                    chargeConfigs.forEach(config => {
                        const targetNorm = norm(config.code);
                        const tenantId = targetCompanyParam;
                        
                        const targetCat = categories.find((c: any) => {
                            const cMatch = c.name.match(/^([\d.]+)/);
                            const currentCatNorm = cMatch ? norm(cMatch[1]) : '';
                            return currentCatNorm === targetNorm && c.tenantId === tenantId;
                        });

                        if (targetCat) {
                            const calcEntry: any = {
                                categoryId: targetCat.id,
                                month: i,
                                year: selectedYear,
                                costCenterId: selectedCostCenter[0],
                                tenantId: tenantId,
                                observation: entry.observation
                            };
                            // Use salaryBase (total of all 03.1.x) as the base for the charge calculation
                            if (isBudget) {
                                calcEntry.amount = salaryBase * config.rate;
                            } else {
                                calcEntry.radarAmount = salaryBase * config.rate;
                            }
                            entries.push(calcEntry);

                            // IMPORTANT: Also clean other IDs for the charge category to avoid duplication
                            const chargeAllIds = targetCat.id.split(',');
                            if (chargeAllIds.length > 1) {
                                chargeAllIds.forEach((id: string) => {
                                    if (id !== targetCat.id) {
                                        const cleanCharge: any = {
                                            categoryId: id,
                                            month: i,
                                            year: selectedYear,
                                            costCenterId: selectedCostCenter[0],
                                            tenantId: tenantId,
                                            amount: 0,
                                            radarAmount: null
                                        };
                                        entries.push(cleanCharge);
                                    }
                                });
                            }
                        }
                    });
                }
            }

            console.log("Saving entries:", entries);
            const res = await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries })
            });

            if (!res.ok) {
                const errData = await res.json();
                const throwErr: any = new Error(errData.error || "Erro ao salvar");
                throwErr.details = errData.details;
                throw throwErr;
            }

            setBudgetModal(null);
            
            // Refresh server data to ensure consistency with other cost centers/tenants
            const companyParam = selectedCompany.includes('DEFAULT') ? 'ALL' : selectedCompany.join(',');
            const refreshRes = await fetch(`/api/budgets?costCenterId=${selectedCostCenter.join(',')}&tenantId=${companyParam}&year=${selectedYear}&t=${Date.now()}`, { cache: 'no-store' });
            const refreshData = await refreshRes.json();
            
            if (refreshData.success) {
                setIsCCLocked(refreshData.isCCLocked || false);
                const values: Record<string, { amount: number, radarAmount: number | null, isLocked: boolean, observation: string | null }> = {};
                refreshData.data.forEach((item: any) => {
                    values[`${item.categoryId}-${item.month - 1}`] = {
                        amount: item.amount || 0,
                        radarAmount: (item.radarAmount !== undefined && item.radarAmount !== null) ? item.radarAmount : null,
                        isLocked: (item.isLocked || refreshData.isCCLocked) || false,
                        observation: item.observation || null
                    };
                });
                setBudgetValues(values);
            }

        } catch (error: any) {

            console.error("Save error:", error);
            alert(`Erro ao salvar orçamentos: ${error.message}${error.details ? '\nDetalhes: ' + error.details : ''}`);
        } finally {
            setIsSavingBudget(false);
        }
    };

    const toggleLock = async () => {
        if (userRole !== 'MASTER') return;
        if (selectedCostCenter.includes('DEFAULT') || selectedCostCenter.length !== 1) {
            alert("Selecione um único centro de custo para trancar/destrancar");
            return;
        }
        if (selectedCompany.includes('DEFAULT') || selectedCompany.length !== 1) {
            alert("Selecione uma única empresa");
            return;
        }

        const newLockState = !isCCLocked;
        try {
            const res = await fetch('/api/cost-centers/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: selectedCompany[0],
                    costCenterId: selectedCostCenter[0],
                    year: selectedYear,
                    isLocked: newLockState
                })
            });
            if (res.ok) {
                setIsCCLocked(newLockState);
                triggerRefresh();
            } else {
                alert("Erro ao alterar trava");
            }
        } catch (err) {
            console.error("Lock error:", err);
        }
    };

    const handleBudgetDrillDown = async (nodeId: string, nodeName: string, monthIndex: number) => {
        if (viewPeriod !== 'month') return;

        // Helper to find node and collect all its leaf category UUIDs (for parents or merged nodes)
        const getAllLeafIds = (id: string): string[] => {
            const ids: string[] = [];
            const findNode = (nodes: CategoryNode[]): CategoryNode | null => {
                for (const n of nodes) {
                    if (n.id === id) return n;
                    const found = findNode(n.children);
                    if (found) return found;
                }
                return null;
            }
            const target = findNode(treeRoots);
            if (!target) return id.split(',').filter(x => !x.startsWith('synth-'));

            const collect = (n: CategoryNode) => {
                if (n.children.length === 0) {
                    n.id.split(',').filter(x => !x.startsWith('synth-')).forEach(x => ids.push(x));
                } else {
                    n.children.forEach(collect);
                }
            }
            collect(target);
            return Array.from(new Set(ids));
        };

        const categoryIds = getAllLeafIds(nodeId);
        // We still use the first ID as a reference for the modal state index, but the filter will use categoryIds
        const primaryId = categoryIds[0] || nodeId.split(',')[0];

        setBudgetDrillModal({ categoryId: primaryId, categoryName: nodeName, month: monthIndex, entries: [], loading: true, drillStep: 'company', drillCompany: null, drillCC: null });
        try {
            const res = await fetch(`/api/budgets?costCenterId=DEFAULT&tenantId=ALL&year=${selectedYear}&detail=true`);
            const data = await res.json();
            if (data.success) {
                // Filter to THESE categories and month (1-indexed in DB)
                const dbMonth = monthIndex + 1;
                const relevant = (data.data as any[]).filter(e => categoryIds.includes(e.categoryId) && e.month === dbMonth && e.amount > 0);
                setBudgetDrillModal((prev: any) => prev ? { ...prev, entries: relevant, loading: false } : null);
            } else {
                setBudgetDrillModal((prev: any) => prev ? { ...prev, loading: false } : null);
            }
        } catch {
            setBudgetDrillModal((prev: any) => prev ? { ...prev, loading: false } : null);
        }
    };

    const openBudgetModal = (nodeId: string, nodeName: string, monthIndex: number, type: 'budget' | 'radar') => {
        if (selectedCostCenter.includes('DEFAULT') || selectedCostCenter.length !== 1) {
            alert("Selecione um único centro de custo para lançar um valor");
            return;
        }
        if (selectedCompany.includes('DEFAULT') || selectedCompany.length !== 1) {
            alert("Selecione uma única Empresa para lançar um valor.\nNão é possível lançar valores na visão 'Geral (Todos)' das empresas.");
            return;
        }
        // Identify the correct ID for the selected tenant if multiple IDs exist (merged nodes)
        const currentTenantId = selectedCompany[0];
        const targetIdToEdit = nodeId.split(',').find(id => {
            const cat = categories.find((c: any) => c.id === id);
            return cat && cat.tenantId === currentTenantId;
        }) || nodeId.split(',')[0];

        const initialValues = new Array(12).fill('').map((_, i) => {
            const data = budgetValues[`${targetIdToEdit}-${i}`];
            if (type === 'budget') {
                return (data?.amount !== undefined && data.amount !== null) ? data.amount.toString() : '';
            }
            return (data?.radarAmount !== undefined && data.radarAmount !== null) ? data.radarAmount.toString() : '';
        });
        const isRadar = type === 'radar';
        const initialLocks = new Array(12).fill(false).map((_, i) => {
            const data = budgetValues[`${targetIdToEdit}-${i}`];
            const ccLocked = (data?.isLocked || isCCLocked) || false;
            
            if (isRadar) {
                const rLock = radarLocks.find((l: any) => l.tenantId === currentTenantId && l.month === (i + 1));
                const radarManuallyLocked = rLock?.isLocked || false;
                const radarExpired = rLock?.deadline && new Date() > new Date(rLock.deadline);
                return ccLocked || radarManuallyLocked || radarExpired;
            }
            
            return ccLocked;
        });



        setBudgetModal({ categoryId: targetIdToEdit, fullNodeId: nodeId, categoryName: nodeName, startMonth: monthIndex, type });
        setModalValues(initialValues);
        setLockedMonths(initialLocks);
        setActiveMonth(monthIndex);
        // Load existing observation from ANY of the merged IDs for this category
        const nodeIds = nodeId.split(',');
        let foundObs = '';
        for (let i = 0; i < 12; i++) {
            for (const id of nodeIds) {
                const obs = budgetValues[`${id}-${i}`]?.observation;
                if (obs) {
                    foundObs = obs;
                    break;
                }
            }
            if (foundObs) break;
        }
        setModalObservation(foundObs);

        // --- v67.30: Composition Hydration (12-Month Sync) ---
        const compRowsMap = new Map<string, string[]>();
        for (let i = 0; i < 12; i++) {
            let foundItems: any[] = [];
            for (const id of nodeId.split(',')) {
                const stored = budgetValues[`${id}-${i}`];
                if (stored?.compositionItems) {
                    foundItems.push(...stored.compositionItems);
                }
            }
            foundItems.forEach(it => {
                const desc = it.description || 'Sem Descrição';
                if (!compRowsMap.has(desc)) {
                    compRowsMap.set(desc, new Array(12).fill(''));
                }
                const arr = compRowsMap.get(desc)!;
                arr[i] = (parseFloat(arr[i] || '0') + it.amount).toString().replace('.', ',');
            });
        }
        
        const initialRows = Array.from(compRowsMap.entries()).map(([desc, values]) => ({
            id: Math.random().toString(36).substring(2, 9),
            description: desc,
            values: values.map(v => v === '0' ? '' : v)
        }));
        
        setModalCompositionRows(initialRows);
        setInitialCompositionRows(JSON.parse(JSON.stringify(initialRows)));
    };


    const replicateValue = () => {
        if (!budgetModal) return;
        // Replicate from activeMonth to the end of the year
        const valueToReplicate = modalValues[activeMonth];
        const next = [...modalValues];
        for (let i = activeMonth; i < 12; i++) {
            if (!lockedMonths[i] || userRole === 'MASTER') {
                next[i] = valueToReplicate;
            }
        }
        setModalValues(next);
    };

    const precomputedDreTotals = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => dreStructure.calculateTotals(i));
    }, [dreStructure]);

    const accumulatedDreTotals = useMemo(() => {
        let accRevB = 0, accRevR = 0, accRevRd = 0;
        let accTaxesB = 0, accTaxesR = 0, accTaxesRd = 0;
        let accRecLiqB = 0, accRecLiqR = 0, accRecLiqRd = 0;
        let accCostsB = 0, accCostsR = 0, accCostsRd = 0;
        let accGrossMargB = 0, accGrossMargR = 0, accGrossMargRd = 0;
        let accOpExpB = 0, accOpExpR = 0, accOpExpRd = 0;
        let accContribMargB = 0, accContribMargR = 0, accContribMargRd = 0;
        let accAdminExpB = 0, accAdminExpR = 0, accAdminExpRd = 0;
        let accEbitdaB = 0, accEbitdaR = 0, accEbitdaRd = 0;
        let accFinB = 0, accFinR = 0, accFinRd = 0;
        let accNetProfitB = 0, accNetProfitR = 0, accNetProfitRd = 0;
        let accInvestB = 0, accInvestR = 0, accInvestRd = 0;

        return precomputedDreTotals.map((m, idx) => {
            accRevB += m.vRev.b;
            accRevR += m.vRev.r;
            accRevRd += m.vRev.rd;

            accTaxesB += m.vTaxes.b;
            accTaxesR += m.vTaxes.r;
            accTaxesRd += m.vTaxes.rd;

            accRecLiqB += m.vRecLiq.b;
            accRecLiqR += m.vRecLiq.r;
            accRecLiqRd += m.vRecLiq.rd;

            accCostsB += m.vCosts.b;
            accCostsR += m.vCosts.r;
            accCostsRd += m.vCosts.rd;

            accGrossMargB += m.vGrossMarg.b;
            accGrossMargR += m.vGrossMarg.r;
            accGrossMargRd += m.vGrossMarg.rd;

            accOpExpB += m.vOpExp.b;
            accOpExpR += m.vOpExp.r;
            accOpExpRd += m.vOpExp.rd;

            accContribMargB += m.vContribMarg.b;
            accContribMargR += m.vContribMarg.r;
            accContribMargRd += m.vContribMarg.rd;

            accAdminExpB += m.vAdminExp.b;
            accAdminExpR += m.vAdminExp.r;
            accAdminExpRd += m.vAdminExp.rd;

            accEbitdaB += m.vEbitda.b;
            accEbitdaR += m.vEbitda.r;
            accEbitdaRd += m.vEbitda.rd;

            accFinB += m.vFin.b;
            accFinR += m.vFin.r;
            accFinRd += m.vFin.rd;

            accNetProfitB += m.vNetProfit.b;
            accNetProfitR += m.vNetProfit.r;
            accNetProfitRd += m.vNetProfit.rd;

            accInvestB += m.vInvest.b;
            accInvestR += m.vInvest.r;
            accInvestRd += m.vInvest.rd;

            return {
                vRev: { b: accRevB, r: accRevR, rd: accRevRd },
                vTaxes: { b: accTaxesB, r: accTaxesR, rd: accTaxesRd },
                vRecLiq: { b: accRecLiqB, r: accRecLiqR, rd: accRecLiqRd },
                vCosts: { b: accCostsB, r: accCostsR, rd: accCostsRd },
                vGrossMarg: { b: accGrossMargB, r: accGrossMargR, rd: accGrossMargRd },
                vOpExp: { b: accOpExpB, r: accOpExpR, rd: accOpExpRd },
                vContribMarg: { b: accContribMargB, r: accContribMargR, rd: accContribMargRd },
                vAdminExp: { b: accAdminExpB, r: accAdminExpR, rd: accAdminExpRd },
                vEbitda: { b: accEbitdaB, r: accEbitdaR, rd: accEbitdaRd },
                vFin: { b: accFinB, r: accFinR, rd: accFinRd },
                vNetProfit: { b: accNetProfitB, r: accNetProfitR, rd: accNetProfitRd },
                vInvest: { b: accInvestB, r: accInvestR, rd: accInvestRd }
            };
        });
    }, [precomputedDreTotals]);

    const companyRevenueData = useMemo(() => {
        const visibleCompanyIds = selectedCompany.includes('DEFAULT')
            ? companies.map(c => c.id)
            : selectedCompany;

        const isRevenueCategory = (cat: any) => {
            const cleanCode = (cat.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return cleanCode.startsWith('01') || cleanCode.startsWith('1');
        };

        const revenueCategories = categories.filter(isRevenueCategory);

        const data = visibleCompanyIds.map(tenantId => {
            const comp = companies.find(c => c.id === tenantId);
            const compName = comp ? comp.name : tenantId;

            const compRevCategories = revenueCategories.filter(c => c.tenantId === tenantId);

            let totalRealized = 0;
            const limitMonth = Math.min(endMonth, currentMonthIdx);
            
            const addedKeys = new Set<string>();
            for (let m = startMonth; m <= limitMonth; m++) {
                compRevCategories.forEach(cat => {
                    const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
                    const lookupKey1 = `realized-${cat.id}-${m}`;
                    const lookupKey2 = `realized-${cleanId}-${m}`;
                    if (!addedKeys.has(lookupKey1)) {
                        addedKeys.add(lookupKey1);
                        totalRealized += (realizedValues[lookupKey1] || 0);
                    }
                    if (!addedKeys.has(lookupKey2)) {
                        addedKeys.add(lookupKey2);
                        totalRealized += (realizedValues[lookupKey2] || 0);
                    }
                });
            }

            return {
                name: compName,
                value: totalRealized / 1000
            };
        });

        const grandTotal = data.reduce((sum, item) => sum + item.value, 0);

        return data.map(item => ({
            ...item,
            percentage: grandTotal > 0 ? (item.value / grandTotal) * 100 : 0
        }));
    }, [companies, selectedCompany, categories, realizedValues, startMonth, endMonth, currentMonthIdx]);

    const companyGrossMarginData = useMemo(() => {
        const visibleCompanyIds = selectedCompany.includes('DEFAULT')
            ? companies.map(c => c.id)
            : selectedCompany;

        const isRev = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('01') || code.startsWith('1');
        };
        const isTax = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('02') || code.startsWith('2');
        };
        const isCost = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('3') || code.startsWith('03');
        };

        const limitMonth = Math.min(endMonth, currentMonthIdx);

        return visibleCompanyIds.map(tenantId => {
            const comp = companies.find(c => c.id === tenantId);
            const compName = comp ? comp.name : tenantId;

            const tenantCategories = categories.filter((c: any) => c.tenantId === tenantId);

            const revCats = tenantCategories.filter(isRev);
            const taxCats = tenantCategories.filter(isTax);
            const costCats = tenantCategories.filter(isCost);

            let totalRev = 0;
            let totalTax = 0;
            let totalCost = 0;

            const addedKeys = new Set<string>();
            for (let m = startMonth; m <= limitMonth; m++) {
                revCats.forEach(cat => {
                    const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
                    const k1 = `realized-${cat.id}-${m}`;
                    const k2 = `realized-${cleanId}-${m}`;
                    if (!addedKeys.has(k1)) {
                        addedKeys.add(k1);
                        totalRev += (realizedValues[k1] || 0);
                    }
                    if (!addedKeys.has(k2)) {
                        addedKeys.add(k2);
                        totalRev += (realizedValues[k2] || 0);
                    }
                });
                taxCats.forEach(cat => {
                    const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
                    const k1 = `realized-${cat.id}-${m}`;
                    const k2 = `realized-${cleanId}-${m}`;
                    if (!addedKeys.has(k1)) {
                        addedKeys.add(k1);
                        totalTax += (realizedValues[k1] || 0);
                    }
                    if (!addedKeys.has(k2)) {
                        addedKeys.add(k2);
                        totalTax += (realizedValues[k2] || 0);
                    }
                });
                costCats.forEach(cat => {
                    const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
                    const k1 = `realized-${cat.id}-${m}`;
                    const k2 = `realized-${cleanId}-${m}`;
                    if (!addedKeys.has(k1)) {
                        addedKeys.add(k1);
                        totalCost += (realizedValues[k1] || 0);
                    }
                    if (!addedKeys.has(k2)) {
                        addedKeys.add(k2);
                        totalCost += (realizedValues[k2] || 0);
                    }
                });
            }

            const grossMargin = totalRev - totalTax - totalCost;
            const percentage = totalRev > 0 ? (grossMargin / totalRev) * 100 : 0;

            return {
                name: compName,
                margin: grossMargin / 1000,
                percentage
            };
        });
    }, [companies, selectedCompany, categories, realizedValues, startMonth, endMonth, currentMonthIdx]);

    const companyContributionMarginData = useMemo(() => {
        const visibleCompanyIds = selectedCompany.includes('DEFAULT')
            ? companies.map(c => c.id)
            : selectedCompany;

        const isRev = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('01') || code.startsWith('1');
        };
        const isTax = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('02') || code.startsWith('2');
        };
        const isCost = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('3') || code.startsWith('03');
        };
        const isOpExp = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('4') || code.startsWith('04');
        };

        const limitMonth = Math.min(endMonth, currentMonthIdx);

        return visibleCompanyIds.map(tenantId => {
            const comp = companies.find(c => c.id === tenantId);
            const compName = comp ? comp.name : tenantId;

            const tenantCategories = categories.filter((c: any) => c.tenantId === tenantId);

            const revCats = tenantCategories.filter(isRev);
            const taxCats = tenantCategories.filter(isTax);
            const costCats = tenantCategories.filter(isCost);
            const opExpCats = tenantCategories.filter(isOpExp);

            let totalRev = 0;
            let totalTax = 0;
            let totalCost = 0;
            let totalOpExp = 0;

            const addedKeys = new Set<string>();
            for (let m = startMonth; m <= limitMonth; m++) {
                revCats.forEach(cat => {
                    const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
                    const k1 = `realized-${cat.id}-${m}`;
                    const k2 = `realized-${cleanId}-${m}`;
                    if (!addedKeys.has(k1)) {
                        addedKeys.add(k1);
                        totalRev += (realizedValues[k1] || 0);
                    }
                    if (!addedKeys.has(k2)) {
                        addedKeys.add(k2);
                        totalRev += (realizedValues[k2] || 0);
                    }
                });
                taxCats.forEach(cat => {
                    const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
                    const k1 = `realized-${cat.id}-${m}`;
                    const k2 = `realized-${cleanId}-${m}`;
                    if (!addedKeys.has(k1)) {
                        addedKeys.add(k1);
                        totalTax += (realizedValues[k1] || 0);
                    }
                    if (!addedKeys.has(k2)) {
                        addedKeys.add(k2);
                        totalTax += (realizedValues[k2] || 0);
                    }
                });
                costCats.forEach(cat => {
                    const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
                    const k1 = `realized-${cat.id}-${m}`;
                    const k2 = `realized-${cleanId}-${m}`;
                    if (!addedKeys.has(k1)) {
                        addedKeys.add(k1);
                        totalCost += (realizedValues[k1] || 0);
                    }
                    if (!addedKeys.has(k2)) {
                        addedKeys.add(k2);
                        totalCost += (realizedValues[k2] || 0);
                    }
                });
                opExpCats.forEach(cat => {
                    const cleanId = cat.id.includes(':') ? cat.id.split(':').pop() : cat.id;
                    const k1 = `realized-${cat.id}-${m}`;
                    const k2 = `realized-${cleanId}-${m}`;
                    if (!addedKeys.has(k1)) {
                        addedKeys.add(k1);
                        totalOpExp += (realizedValues[k1] || 0);
                    }
                    if (!addedKeys.has(k2)) {
                        addedKeys.add(k2);
                        totalOpExp += (realizedValues[k2] || 0);
                    }
                });
            }

            const contribMargin = totalRev - totalTax - totalCost - totalOpExp;
            const percentage = totalRev > 0 ? (contribMargin / totalRev) * 100 : 0;

            return {
                name: compName,
                margin: contribMargin / 1000,
                percentage
            };
        });
    }, [companies, selectedCompany, categories, realizedValues, startMonth, endMonth, currentMonthIdx]);



    const revenueProjectionData = useMemo(() => {
        let annualBudgetRev = 0;
        let realizedAccumRev = 0;
        let projectedRev = 0;

        precomputedDreTotals.forEach((m, idx) => {
            annualBudgetRev += m.vRev.b;
            if (idx <= currentMonthIdx) {
                projectedRev += m.vRev.r;
            } else {
                projectedRev += m.vRev.b;
            }

            if (idx >= startMonth && idx <= endMonth && idx <= currentMonthIdx) {
                realizedAccumRev += m.vRev.r;
            }
        });

        const percent = annualBudgetRev > 0 ? (projectedRev / annualBudgetRev) * 100 : 0;

        return {
            annualBudgetRev,
            realizedAccumRev,
            projectedRev,
            percent,
            currentMonthIdx
        };
    }, [precomputedDreTotals, startMonth, endMonth]);

    const taxesProjectionData = useMemo(() => {
        let periodBudgetRev = 0;
        let periodBudgetTaxes = 0;
        let realizedAccumRev = 0;
        let realizedAccumTaxes = 0;

        precomputedDreTotals.forEach((m, idx) => {
            if (idx >= startMonth && idx <= endMonth) {
                periodBudgetRev += m.vRev.b;
                periodBudgetTaxes += m.vTaxes.b;
                if (idx <= currentMonthIdx) {
                    realizedAccumRev += m.vRev.r;
                    realizedAccumTaxes += m.vTaxes.r;
                }
            }
        });

        const budgetTaxRate = periodBudgetRev > 0 ? (periodBudgetTaxes / periodBudgetRev) * 100 : 0;
        const realizedTaxRate = realizedAccumRev > 0 ? (realizedAccumTaxes / realizedAccumRev) * 100 : 0;

        return {
            budgetTaxRate,
            realizedTaxRate,
            realizedAccumTaxes,
            realizedAccumRev
        };
    }, [precomputedDreTotals, startMonth, endMonth]);

    const grossMargProjectionData = useMemo(() => {
        let periodBudgetRev = 0;
        let periodBudgetGrossMarg = 0;
        let realizedAccumRev = 0;
        let realizedAccumGrossMarg = 0;

        precomputedDreTotals.forEach((m, idx) => {
            if (idx >= startMonth && idx <= endMonth) {
                periodBudgetRev += m.vRev.b;
                periodBudgetGrossMarg += m.vGrossMarg.b;
                if (idx <= currentMonthIdx) {
                    realizedAccumRev += m.vRev.r;
                    realizedAccumGrossMarg += m.vGrossMarg.r;
                }
            }
        });

        const budgetGrossMargRate = periodBudgetRev > 0 ? (periodBudgetGrossMarg / periodBudgetRev) * 100 : 0;
        const realizedGrossMargRate = realizedAccumRev > 0 ? (realizedAccumGrossMarg / realizedAccumRev) * 100 : 0;

        return {
            budgetGrossMargRate,
            realizedGrossMargRate,
            realizedAccumGrossMarg,
            realizedAccumRev
        };
    }, [precomputedDreTotals, startMonth, endMonth]);

    const costsProjectionData = useMemo(() => {
        let periodBudgetRev = 0;
        let periodBudgetCosts = 0;
        let realizedAccumRev = 0;
        let realizedAccumCosts = 0;

        precomputedDreTotals.forEach((m, idx) => {
            if (idx >= startMonth && idx <= endMonth) {
                periodBudgetRev += m.vRev.b;
                periodBudgetCosts += m.vCosts.b;
                if (idx <= currentMonthIdx) {
                    realizedAccumRev += m.vRev.r;
                    realizedAccumCosts += m.vCosts.r;
                }
            }
        });

        const budgetCostRate = periodBudgetRev > 0 ? (periodBudgetCosts / periodBudgetRev) * 100 : 0;
        const realizedCostRate = realizedAccumRev > 0 ? (realizedAccumCosts / realizedAccumRev) * 100 : 0;

        return {
            budgetCostRate,
            realizedCostRate,
            realizedAccumCosts,
            realizedAccumRev
        };
    }, [precomputedDreTotals, startMonth, endMonth]);

    const ebitdaProjectionData = useMemo(() => {
        let periodBudgetRev = 0;
        let periodBudgetEbitda = 0;
        let realizedAccumRev = 0;
        let realizedAccumEbitda = 0;

        precomputedDreTotals.forEach((m, idx) => {
            if (idx >= startMonth && idx <= endMonth) {
                periodBudgetRev += m.vRev.b;
                periodBudgetEbitda += m.vEbitda.b;
                if (idx <= currentMonthIdx) {
                    realizedAccumRev += m.vRev.r;
                    realizedAccumEbitda += m.vEbitda.r;
                }
            }
        });

        const budgetEbitdaRate = periodBudgetRev > 0 ? (periodBudgetEbitda / periodBudgetRev) * 100 : 0;
        const realizedEbitdaRate = realizedAccumRev > 0 ? (realizedAccumEbitda / realizedAccumRev) * 100 : 0;

        return {
            budgetEbitdaRate,
            realizedEbitdaRate,
            realizedAccumEbitda,
            realizedAccumRev
        };
    }, [precomputedDreTotals, startMonth, endMonth]);

    const matchNode = (node: CategoryNode, query: string): boolean => {
        if (!query) return true;
        const cleanQuery = query.toLowerCase().trim();
        if (node.name.toLowerCase().includes(cleanQuery) || (node.code && node.code.toLowerCase().includes(cleanQuery))) {
            return true;
        }
        return node.children.some(child => matchNode(child, query));
    };

    const renderNode = (node: CategoryNode) => {
        if (searchQuery && !matchNode(node, searchQuery)) return null;
        const hasChildren = node.children.length > 0;
        const hasCompositionChildren = !hasChildren && node.id.split(',').some(id => 
            [0,1,2,3,4,5,6,7,8,9,10,11].some((i) => {
                const d = budgetValues[`${id}-${i}`];
                return d && d.compositionItems && d.compositionItems.length > 0;
            })
        );
        const isInteractiveTree = hasChildren || hasCompositionChildren;
        
        const isExpanded = expandedRows.has(node.id);
        const totals = nodeTotals.get(node.id) || { budget: new Array(12).fill(0), realized: new Array(12).fill(0), radar: new Array(12).fill(0) };
        const isEditable = !hasChildren && !node.isSynthetic;

        return (
            <React.Fragment key={node.id}>
                <tr>
                    <td 
                        className="sticky-col"
                        onClick={() => isInteractiveTree && toggleRow(node.id)}
                        style={{ 
                            cursor: isInteractiveTree ? 'pointer' : 'default', 
                            fontWeight: isInteractiveTree ? 800 : 600,
                            paddingLeft: `${0.75 + (node.level * 1.75)}rem`,
                            borderBottom: '1px solid #f1f5f9',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            width: '400px',
                            minWidth: '400px',
                            maxWidth: '400px',
                            fontSize: '0.95rem'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', color: '#0f172a' }}>
                            {isInteractiveTree && (
                                <span style={{ 
                                    marginRight: '0.65rem', 
                                    fontSize: '0.92rem', 
                                    color: hasCompositionChildren ? '#8b5cf6' : '#3b82f6', 
                                    width: '1rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    userSelect: 'none'
                                }}>
                                    {isExpanded ? '−' : '+'}
                                </span>
                            )}
                            {!isInteractiveTree && <span style={{ width: '1.65rem' }}></span>}
                            <span style={{ 
                                whiteSpace: 'normal',
                                overflowWrap: 'break-word',
                                textShadow: isInteractiveTree ? '0 1px 1px rgba(0,0,0,0.05)' : 'none'
                            }}>
                                {node.name}
                            </span>
                            {!node.isSynthetic && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDeviationNode(node);
                                        setDeviationDescription('');
                                        setDeviationCorrectionAction('');
                                        setDeviationDueDate('');
                                        setDeviationResponsibleId('');
                                        setDeviationMonth(endMonth + 1);
                                        setIsDeviationModalOpen(true);
                                    }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '2px 4px',
                                        fontSize: '0.85rem',
                                        opacity: 0.7,
                                        transition: 'all 0.2s',
                                        marginLeft: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        borderRadius: '4px',
                                        backgroundColor: deviations?.some((d: any) => d?.categoryId && (d.categoryId === node.id || d.categoryId.endsWith(':' + node.id)) && !d.isResolved) ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                                        borderWidth: '1px',
                                        borderStyle: 'solid',
                                        borderColor: deviations?.some((d: any) => d?.categoryId && (d.categoryId === node.id || d.categoryId.endsWith(':' + node.id)) && !d.isResolved) ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
                                    }}
                                    title={deviations?.some((d: any) => d?.categoryId && (d.categoryId === node.id || d.categoryId.endsWith(':' + node.id)) && !d.isResolved) ? "Possui desvio pendente registrado" : "Registrar desvio / Ações"}
                                >
                                    {deviations?.some((d: any) => d?.categoryId && (d.categoryId === node.id || d.categoryId.endsWith(':' + node.id)) && !d.isResolved) ? '⚠️' : '📋'}
                                </button>
                            )}
                        </div>
                    </td>
                    {(viewPeriod === 'month' ? MONTHS : [1, 2, 3, 4]).map((_, i) => {
                        let bVal = 0, rVal = 0;
                        let isLocked = false;

                        if (viewPeriod === 'month') {
                            bVal = totals.budget[i];
                            rVal = totals.realized[i];
                            isLocked = isCCLocked || node.id.split(',').some(id => (budgetValues[`${id}-${i}`] || {}).isLocked);
                        } else {
                            for (let m = i * 3; m < i * 3 + 3; m++) {
                                bVal += totals.budget[m];
                                rVal += totals.realized[m];
                                if (isCCLocked || node.id.split(',').some(id => (budgetValues[`${id}-${m}`] || {}).isLocked)) isLocked = true;
                            }
                        }

                        const isCellEditable = isEditable && viewPeriod === 'month';
                        
                        const getMoMPercent = () => {
                            if (i === 0) return 0;
                            let prevVal = 0;
                            if (viewPeriod === 'month') prevVal = totals.realized[i - 1];
                            else for (let m = (i - 1) * 3; m < (i - 1) * 3 + 3; m++) prevVal += totals.realized[m];
                            if (Math.abs(prevVal) < 0.01) return 0;
                            return ((rVal / prevVal) - 1) * 100;
                        };

                        let totalRevReal = 0, totalRevBudget = 0;
                        const revNodeTotals = nodeTotals.get(dreStructure.buckets.rev[0]?.id);
                        if (revNodeTotals) {
                            if (viewPeriod === 'month') {
                                totalRevReal = revNodeTotals.realized[i] || 0;
                                totalRevBudget = revNodeTotals.budget[i] || 0;
                            } else {
                                for (let m = i * 3; m < i * 3 + 3; m++) {
                                    totalRevReal += revNodeTotals.realized[m] || 0;
                                    totalRevBudget += revNodeTotals.budget[m] || 0;
                                }
                            }
                        }
                        
                        const avReal = Math.abs(totalRevReal) > 0.01 ? (rVal / totalRevReal) * 100 : 0;
                        const avBudget = Math.abs(totalRevBudget) > 0.01 ? (bVal / totalRevBudget) * 100 : 0;

                        const getAH = (val: number, base: number) => {
                            if (Math.abs(base) < 0.01) return 0;
                            return ((val / base) - 1) * 100;
                        };

                        const isHighlighted = viewPeriod === 'month' && i === highlightedMonth;

                        return (
                            <React.Fragment key={i}>
                                <td
                                    className="spreadsheet-value"
                                    onClick={() => {
                                        if (viewPeriod === 'month') {
                                            if (isCellEditable) openBudgetModal(node.id, node.name, i, 'budget');
                                            else handleBudgetDrillDown(node.id, node.name, i);
                                        }
                                    }}
                                    style={{ 
                                        borderLeft: '2px solid #cbd5e1', 
                                        cursor: viewPeriod === 'month' ? 'pointer' : 'default',
                                        color: isHighlighted ? '#ffffff' : (bVal < 0 ? '#dc2626' : '#1e293b'),
                                        width: '130px',
                                        minWidth: '130px',
                                        maxWidth: '130px',
                                        padding: '0.65rem 0.5rem',
                                        fontWeight: 600,
                                        background: isHighlighted ? '#0b579f' : undefined
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end', fontSize: '0.94rem' }}>
                                        {isLocked && <span style={{ fontSize: '0.7rem', color: isHighlighted ? '#ffffff' : 'inherit' }}>🔒</span>}
                                        {formatGridValue(bVal, isHighlighted)}
                                    </div>
                                </td>
                                {showAV && (
                                    <td 
                                        className="spreadsheet-value" 
                                        style={{ 
                                            color: isHighlighted ? '#0b579f' : '#64748b', 
                                            fontSize: '0.84rem', 
                                            fontWeight: 800, 
                                            textAlign: 'center', 
                                            width: '60px',
                                            minWidth: '60px', 
                                            maxWidth: '60px',
                                            background: isHighlighted ? '#f0f9ff' : undefined
                                        }} 
                                        title="AV Orçado"
                                    >
                                        {avBudget.toFixed(1)}%
                                    </td>
                                )}

                                <td 
                                    className="spreadsheet-value"
                                    onClick={() => viewPeriod === 'month' && handleCellClick(node.id, i, node.name)} 
                                    style={{ 
                                        cursor: viewPeriod === 'month' ? 'pointer' : 'default',
                                        color: isHighlighted ? '#0b579f' : (rVal < 0 ? '#ef4444' : 'var(--accent-blue)'),
                                        fontWeight: 800,
                                        position: 'relative',
                                        background: isHighlighted ? '#e0f2fe' : ((hasJustificationMap[`${node.id}-${i}`] && node.children.length === 0) ? '#eff6ff' : undefined),
                                        width: '140px',
                                        minWidth: '140px',
                                        maxWidth: '140px',
                                        padding: '0.65rem 0.5rem',
                                        fontSize: '0.96rem'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                        {formatGridValue(rVal, isHighlighted)}
                                    </div>
                                </td>
                                {showAV && (
                                    <td 
                                        className="spreadsheet-value" 
                                        style={{ 
                                            color: isHighlighted ? '#0b579f' : '#475569', 
                                            fontSize: '0.84rem', 
                                            fontWeight: 800, 
                                            textAlign: 'center',
                                            width: '60px',
                                            minWidth: '60px',
                                            maxWidth: '60px',
                                            background: isHighlighted ? '#f0f9ff' : undefined
                                        }} 
                                        title="AV Real"
                                    >
                                        {avReal.toFixed(1)}%
                                    </td>
                                )}
                                {showAH && (
                                    <td className="spreadsheet-value" style={{ 
                                        color: (() => {
                                            const val = getAH(rVal, bVal);
                                            const isRevenue = node.code?.startsWith('01') || node.code?.startsWith('1');
                                            if (val === 0) return '#64748b';
                                            if (isRevenue) return val < 0 ? '#e11d48' : '#059669';
                                            return val > 0 ? '#e11d48' : '#059669';
                                        })(), 
                                        background: isHighlighted ? '#f0f9ff' : undefined,
                                        fontSize: '0.86rem', 
                                        fontWeight: 900,
                                        textAlign: 'center',
                                        width: '70px',
                                        minWidth: '70px',
                                        maxWidth: '70px'
                                    }}>
                                        {getAH(rVal, bVal).toFixed(1)}%
                                    </td>
                                )}
                                {showAH_MoM && (
                                    <td className="spreadsheet-value" style={{ 
                                        color: (() => {
                                            const val = getMoMPercent();
                                            const isRevenue = node.code?.startsWith('01') || node.code?.startsWith('1');
                                            if (val === 0) return '#64748b';
                                            if (isRevenue) return val < 0 ? '#e11d48' : '#059669';
                                            return val > 0 ? '#e11d48' : '#059669';
                                        })(), 
                                        background: isHighlighted ? '#f0f9ff' : undefined,
                                        fontSize: '0.86rem', 
                                        fontWeight: 900,
                                        textAlign: 'center',
                                        width: '70px',
                                        minWidth: '70px',
                                        maxWidth: '70px'
                                    }}>
                                        {i === 0 ? '-' : `${getMoMPercent().toFixed(1)}%`}
                                    </td>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tr>
                {isExpanded && node.children.map(child => renderNode(child))}
                {isExpanded && node.children.length === 0 && (() => {
                    const itemsMap = new Map<string, Record<number, number>>();
                    const allItemNames = new Set<string>();
                    const months = (viewPeriod === 'month' ? MONTHS : [0, 1, 2, 3]);

                    months.forEach((_, i) => {
                        let monthItems: any[] = [];
                        if (viewPeriod === 'month') {
                            node.id.split(',').forEach(id => {
                                const d = budgetValues[`${id}-${i}`];
                                if (d?.compositionItems) monthItems.push(...d.compositionItems);
                            });
                        } else {
                            for (let m = i * 3; m < i * 3 + 3; m++) {
                                node.id.split(',').forEach(id => {
                                    const d = budgetValues[`${id}-${m}`];
                                    if (d?.compositionItems) monthItems.push(...d.compositionItems);
                                });
                            }
                        }
                        monthItems.forEach(it => {
                            const name = it.description || 'Sem Descrição';
                            allItemNames.add(name);
                            if (!itemsMap.has(name)) itemsMap.set(name, {});
                            const val = itemsMap.get(name)!;
                            val[i] = (val[i] || 0) + (it.amount || 0);
                        });
                    });

                    if (allItemNames.size === 0) return null;

                    return Array.from(allItemNames).sort().map(itemName => (
                        <tr key={`${node.id}-${itemName}`} style={{ background: 'rgba(241, 245, 249, 0.4)' }}>
                            <td className="sticky-col" style={{ paddingLeft: `${2.5 + (node.level * 1.75)}rem`, fontSize: '0.9rem', color: '#334155', borderBottom: '1px solid #f1f5f9', width: '400px', minWidth: '400px', maxWidth: '400px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                                    <span style={{ marginRight: '0.5rem', color: '#cbd5e1', flexShrink: 0 }}>└</span>
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.85rem' }} title={itemName}>
                                        {itemName}
                                    </span>
                                </div>
                            </td>
                            {months.map((_, i) => {
                                const val = itemsMap.get(itemName)?.[i] || 0;
                                return (
                                    <React.Fragment key={i}>
                                        <td className="spreadsheet-value" style={{ fontSize: '0.9rem', color: '#334155', borderLeft: '2px solid #e2e8f0', borderBottom: '1px solid #f1f5f9', width: '130px', minWidth: '130px', maxWidth: '130px' }}>
                                            {val === 0 ? '-' : formatCurrency(val)}
                                        </td>
                                        {showAV && <td className="spreadsheet-value" style={{ color: 'transparent', fontSize: '0.7rem', width: '60px', minWidth: '60px', maxWidth: '60px' }}>-</td>}
                                        <td className="spreadsheet-value" style={{ fontSize: '0.9rem', color: 'transparent', width: '140px', minWidth: '140px', maxWidth: '140px' }}>-</td>
                                        {showAV && <td className="spreadsheet-value" style={{ color: 'transparent', width: '60px', minWidth: '60px', maxWidth: '60px' }}>-</td>}
                                        {showAH && <td className="spreadsheet-value" style={{ color: 'transparent', width: '70px', minWidth: '70px', maxWidth: '70px' }}>-</td>}
                                        {showAH_MoM && <td className="spreadsheet-value" style={{ color: 'transparent', width: '70px', minWidth: '70px', maxWidth: '70px' }}>-</td>}
                                    </React.Fragment>
                                );
                            })}
                            <td className="spreadsheet-value" style={{ background: 'rgba(241, 245, 249, 0.6)', fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>
                                {formatCurrency(Array.from(Object.values(itemsMap.get(itemName) || {})).reduce((a, b) => a + b, 0))}
                            </td>
                        </tr>
                    ));
                })()}
            </React.Fragment>
        );
    };

    const renderGroupHeaderRow = (label: string, _isExpanded?: boolean, _onToggle?: () => void) => {
        const colsCount = 1 + (viewPeriod === 'month' ? MONTHS : [1, 2, 3, 4]).length * (2 + (showAV ? 2 : 0) + (showAH ? 1 : 0) + (showAH_MoM ? 1 : 0));
        return (
            <tr style={{ background: '#e6f2fd' }} className="spreadsheet-group-header">
                <td 
                    className="sticky-col" 
                    style={{ 
                        fontWeight: 800, 
                        color: '#0b579f', 
                        background: '#e6f2fd', 
                        zIndex: 25, 
                        fontSize: '0.98rem',
                        width: '400px',
                        minWidth: '400px',
                        maxWidth: '400px',
                        padding: '0.5rem 0.75rem',
                        cursor: 'default'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                    </div>
                </td>
                <td colSpan={colsCount - 1} style={{ background: '#e6f2fd' }}></td>
            </tr>
        );
    };

    const renderSummaryRow = (label: string, validx: keyof ReturnType<typeof dreStructure.calculateTotals>, isBold = false, groupId?: string) => {
        const isGroupExpanded = groupId ? expandedGroups.has(groupId) : true;
        const isLucroLiquido = validx === 'vNetProfit';

        return (
            <tr 
                onClick={() => groupId && toggleGroup(groupId)} 
                className={isLucroLiquido ? 'spreadsheet-net-profit-row' : 'spreadsheet-summary-row'}
                style={{ cursor: groupId ? 'pointer' : 'default' }}
            >
                <td 
                    className="sticky-col" 
                    style={{ 
                        fontWeight: 900, 
                        color: isLucroLiquido ? '#ffffff' : '#0f172a',
                        background: isLucroLiquido ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#f8fafc',
                        fontSize: '0.88rem',
                        zIndex: 25,
                        boxShadow: isLucroLiquido ? '0 4px 6px -1px rgba(37, 99, 235, 0.2)' : 'none',
                        width: '400px',
                        minWidth: '400px',
                        maxWidth: '400px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', opacity: 1, visibility: 'visible' }}>
                        {groupId && (
                            <span style={{ 
                                marginRight: '0.65rem', 
                                fontSize: '0.92rem', 
                                color: '#3b82f6', 
                                width: '1rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                userSelect: 'none'
                            }}>
                                {isGroupExpanded ? '−' : '+'}
                            </span>
                        )}
                        {!groupId && <span style={{ width: '1.65rem' }}></span>}
                        <span style={{ color: 'inherit' }}>{label}</span>
                    </div>
                </td>
                {(viewPeriod === 'month' ? MONTHS : [1, 2, 3, 4]).map((_, i) => {
                    const sums = precomputedDreTotals[i];
                    const rowData = sums[validx];
                    let budgetVal = 0, realizedVal = 0;
                    if (rowData) {
                        budgetVal = (rowData as any).b || 0;
                        realizedVal = (rowData as any).r || 0;
                    }

                    if (viewPeriod === 'quarter') {
                        budgetVal = 0; realizedVal = 0; 
                        for (let m = i * 3; m < i * 3 + 3; m++) {
                            const monthTotal = precomputedDreTotals[m];
                            budgetVal += monthTotal[validx].b;
                            realizedVal += monthTotal[validx].r;
                        }
                    }

                    const bColor = budgetVal < 0 ? '#ef4444' : (isLucroLiquido ? '#fff' : '#64748b');
                    const rColor = realizedVal < 0 ? '#ef4444' : (isLucroLiquido ? '#fff' : 'var(--accent-blue)');

                    const getMoMPercent = () => {
                        if (i === 0) return 0;
                        let prevVal = 0;
                        if (viewPeriod === 'month') {
                            const prevSums = precomputedDreTotals[i - 1];
                            prevVal = (prevSums[validx] as any)?.r || 0;
                        } else {
                            for (let m = (i - 1) * 3; m < (i - 1) * 3 + 3; m++) {
                                const qSums = precomputedDreTotals[m];
                                prevVal += (qSums[validx] as any)?.r || 0;
                            }
                        }
                        if (Math.abs(prevVal) < 0.01) return 0;
                        return ((realizedVal / prevVal) - 1) * 100;
                    };

                    let totalRevReal = 0, totalRevBudget = 0;
                    if (viewPeriod === 'month') {
                        totalRevReal = sums.vRev.r || 0;
                        totalRevBudget = sums.vRev.b || 0;
                    } else {
                        for (let m = i * 3; m < i * 3 + 3; m++) {
                            const qSums = precomputedDreTotals[m];
                            totalRevReal += qSums.vRev.r || 0;
                            totalRevBudget += qSums.vRev.b || 0;
                        }
                    }
                    
                    const avReal = Math.abs(totalRevReal) > 0.01 ? (realizedVal / totalRevReal) * 100 : 0;
                    const avBudget = Math.abs(totalRevBudget) > 0.01 ? (budgetVal / totalRevBudget) * 100 : 0;

                    const getAH = (val: number, base: number) => {
                        if (Math.abs(base) < 0.01) return 0;
                        return ((val / base) - 1) * 100;
                    };

                    const isHighlighted = viewPeriod === 'month' && i === highlightedMonth;

                    return (
                        <React.Fragment key={i}>
                            <td 
                                className={`spreadsheet-value ${budgetVal < 0 ? 'spreadsheet-value-negative' : ''}`}
                                style={{ 
                                    borderLeft: '2px solid #cbd5e1', 
                                    color: isHighlighted ? '#ffffff' : bColor, 
                                    fontWeight: 700, 
                                    background: isLucroLiquido ? '#2563eb' : (isHighlighted ? '#0b579f' : undefined), 
                                    width: '130px', 
                                    minWidth: '130px', 
                                    maxWidth: '130px', 
                                    padding: '0.5rem 0.25rem' 
                                }}
                            >
                                {formatGridValue(budgetVal, isHighlighted)}
                            </td>
                            {showAV && (
                                <td 
                                    className="spreadsheet-value" 
                                    style={{ 
                                        color: isLucroLiquido ? '#fff' : (isHighlighted ? '#0b579f' : '#64748b'), 
                                        fontSize: '0.84rem', 
                                        fontWeight: 900, 
                                        textAlign: 'center', 
                                        width: '60px', 
                                        minWidth: '60px', 
                                        maxWidth: '60px', 
                                        padding: '0.5rem 0.25rem',
                                        background: isLucroLiquido ? '#2563eb' : (isHighlighted ? '#f0f9ff' : undefined)
                                    }}
                                >
                                    {avBudget.toFixed(1)}%
                                </td>
                            )}
                            <td 
                                className={`spreadsheet-value ${realizedVal < 0 ? 'spreadsheet-value-negative' : ''}`}
                                style={{ 
                                    color: isHighlighted ? '#0b579f' : rColor, 
                                    fontWeight: 900, 
                                    background: isLucroLiquido ? '#2563eb' : (isHighlighted ? '#e0f2fe' : undefined), 
                                    position: 'relative', 
                                    width: '140px', 
                                    minWidth: '140px', 
                                    maxWidth: '140px', 
                                    padding: '0.5rem 0.25rem' 
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                    {formatGridValue(realizedVal, isHighlighted)}
                                </div>
                            </td>
                            {showAV && (
                                <td 
                                    className="spreadsheet-value" 
                                    style={{ 
                                        color: isLucroLiquido ? '#fff' : (isHighlighted ? '#0b579f' : '#475569'), 
                                        fontSize: '0.84rem', 
                                        fontWeight: 900, 
                                        textAlign: 'center', 
                                        width: '60px', 
                                        minWidth: '60px', 
                                        maxWidth: '60px', 
                                        padding: '0.5rem 0.25rem',
                                        background: isLucroLiquido ? '#2563eb' : (isHighlighted ? '#f0f9ff' : undefined)
                                    }}
                                >
                                    {avReal.toFixed(1)}%
                                </td>
                            )}
                            {showAH && (
                                <td className="spreadsheet-value" style={{ 
                                    color: (() => {
                                        const val = getAH(realizedVal, budgetVal);
                                        const isProfitRow = ['vRev', 'vRecLiq', 'vGrossMarg', 'vContribMarg', 'vEbitda', 'vNetProfit'].includes(validx as string);
                                        if (val === 0) return isLucroLiquido ? '#fff' : '#64748b';
                                        if (isProfitRow) return val < 0 ? '#e11d48' : (isLucroLiquido ? '#fff' : '#059669');
                                        return val > 0 ? '#e11d48' : (isLucroLiquido ? '#fff' : '#059669');
                                    })(),
                                    background: isLucroLiquido ? '#2563eb' : (isHighlighted ? '#f0f9ff' : undefined),
                                    fontSize: '0.86rem', 
                                    fontWeight: 900,
                                    textAlign: 'center',
                                    width: '70px',
                                    minWidth: '70px',
                                    maxWidth: '70px',
                                    padding: '0.5rem 0.25rem'
                                }}>
                                    {getAH(realizedVal, budgetVal).toFixed(1)}%
                                </td>
                            )}
                             {showAH_MoM && (
                                <td className="spreadsheet-value" style={{ 
                                    color: (() => {
                                        const val = getMoMPercent();
                                        const isProfitRow = ['vRev', 'vRecLiq', 'vGrossMarg', 'vContribMarg', 'vEbitda', 'vNetProfit'].includes(validx as string);
                                        if (val === 0) return isLucroLiquido ? '#fff' : '#64748b';
                                        if (isProfitRow) return val < 0 ? '#e11d48' : (isLucroLiquido ? '#fff' : '#059669');
                                        return val > 0 ? '#e11d48' : (isLucroLiquido ? '#fff' : '#059669');
                                    })(),
                                    background: isLucroLiquido ? '#2563eb' : (isHighlighted ? '#f0f9ff' : undefined),
                                    fontSize: '0.86rem', 
                                    fontWeight: 900,
                                    textAlign: 'center',
                                    width: '70px',
                                    minWidth: '70px',
                                    maxWidth: '70px',
                                    padding: '0.5rem 0.25rem'
                                }}>
                                    {i === 0 ? '-' : `${getMoMPercent().toFixed(1)}%`}
                                </td>
                            )}
                        </React.Fragment>
                    );
                })}
            </tr>
        );
    };

    const renderRevenueGauge = () => {
        const { annualBudgetRev, realizedAccumRev, projectedRev } = revenueProjectionData;

        // SVG parameters
        const cx = 140;
        const cy = 110;
        const r = 80;
        
        // Target percentage (realized in relation to projected)
        const gaugePercent = projectedRev > 0 ? (realizedAccumRev / projectedRev) * 100 : 0;

        // Trig angle in radians for needle (left is PI, right is 0)
        const needleAngle = Math.PI - (Math.min(100, Math.max(0, gaugePercent)) / 100) * Math.PI;
        const needleLength = 62;
        const needleX = cx + needleLength * Math.cos(needleAngle);
        const needleY = cy - needleLength * Math.sin(needleAngle);

        // Helper to get coordinates for arc segments
        const getArcSegment = (startAngleDeg: number, endAngleDeg: number, strokeColor: string) => {
            const startRad = (startAngleDeg * Math.PI) / 180;
            const endRad = (endAngleDeg * Math.PI) / 180;
            
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy - r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy - r * Math.sin(endRad);
            
            return (
                <path 
                    key={startAngleDeg}
                    d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} 
                    fill="none" 
                    stroke={strokeColor} 
                    strokeWidth="14" 
                />
            );
        };

        // 5 segments matching the user's design (vermelho, laranja, amarelo, verde-limão, verde-escuro)
        const segments = [
            { color: '#ef4444', start: 180, end: 147 }, // Crítico
            { color: '#f97316', start: 144, end: 111 }, // Alerta
            { color: '#eab308', start: 108, end: 75 },  // Atenção
            { color: '#84cc16', start: 72, end: 39 },   // Bom
            { color: '#22c55e', start: 36, end: 3 }     // Excelente
        ];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 0.5rem', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', width: '100%', flex: 1, justifyContent: 'space-between' }}>
                <svg viewBox="0 0 280 135" style={{ overflow: 'visible', width: '100%', height: 'auto' }}>
                    <defs>
                        <filter id="needle-shadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="1" dy="2" stdDeviation="1" floodOpacity="0.15" />
                        </filter>
                        {/* Ponta da Seta */}
                        <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#1e293b" />
                        </marker>
                    </defs>

                    {/* Desenha os 5 segmentos coloridos */}
                    {segments.map(seg => getArcSegment(seg.start, seg.end, seg.color))}

                    {/* Ponteiro (aponta para o Realizado em relação à Projeção) */}
                    <g filter="url(#needle-shadow)">
                        <line 
                            x1={cx} 
                            y1={cy} 
                            x2={needleX} 
                            y2={needleY} 
                            stroke="#1e293b" 
                            strokeWidth="3" 
                            strokeLinecap="round" 
                            markerEnd="url(#arrow)"
                            style={{ transition: 'all 0.8s ease-in-out' }}
                        />
                        {/* Miolo do ponteiro (círculo preto com centro branco) */}
                        <circle cx={cx} cy={cy} r="8.5" fill="#1e293b" />
                        <circle cx={cx} cy={cy} r="4" fill="#f8fafc" />
                    </g>

                    {/* Rótulos de 0% e 100% */}
                    <text x={cx - r - 10} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">0%</text>
                    <text x={cx + r + 10} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">100%</text>
                </svg>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '2.2rem', textAlign: 'center', marginTop: '-15px', zIndex: 10 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>{gaugePercent.toFixed(1)}%</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>Faturamento Realizado Acumulado</span>
                </div>
            </div>
        );
    };

    const renderTaxesGauge = () => {
        const { budgetTaxesRate = 0, realizedTaxRate, budgetTaxRate } = taxesProjectionData;

        // SVG parameters
        const cx = 140;
        const cy = 110;
        const r = 80;
        
        // Target percentage of realized tax rate relative to budget tax rate (max 100%)
        const gaugePercent = budgetTaxRate > 0 ? (realizedTaxRate / budgetTaxRate) * 100 : 0;

        // Trig angle in radians for needle (left is PI, right is 0)
        const needleAngle = Math.PI - (Math.min(100, Math.max(0, gaugePercent)) / 100) * Math.PI;
        const needleLength = 62;
        const needleX = cx + needleLength * Math.cos(needleAngle);
        const needleY = cy - needleLength * Math.sin(needleAngle);

        // Helper to get coordinates for arc segments
        const getArcSegment = (startAngleDeg: number, endAngleDeg: number, strokeColor: string) => {
            const startRad = (startAngleDeg * Math.PI) / 180;
            const endRad = (endAngleDeg * Math.PI) / 180;
            
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy - r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy - r * Math.sin(endRad);
            
            return (
                <path 
                    key={startAngleDeg}
                    d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} 
                    fill="none" 
                    stroke={strokeColor} 
                    strokeWidth="14" 
                />
            );
        };

        // 5 segments: Inverted colors (verde to vermelho)
        const segments = [
            { color: '#22c55e', start: 180, end: 147 }, // Excelente
            { color: '#84cc16', start: 144, end: 111 }, // Bom
            { color: '#eab308', start: 108, end: 75 },  // Atenção
            { color: '#f97316', start: 72, end: 39 },   // Alerta
            { color: '#ef4444', start: 36, end: 3 }     // Crítico
        ];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 0.5rem', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', width: '100%', flex: 1, justifyContent: 'space-between' }}>
                <svg viewBox="0 0 280 135" style={{ overflow: 'visible', width: '100%', height: 'auto' }}>
                    <defs>
                        <filter id="needle-shadow-taxes" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="1" dy="2" stdDeviation="1" floodOpacity="0.15" />
                        </filter>
                        {/* Ponta da Seta */}
                        <marker id="arrow-taxes" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#1e293b" />
                        </marker>
                    </defs>

                    {/* Desenha os 5 segmentos coloridos invertidos */}
                    {segments.map(seg => getArcSegment(seg.start, seg.end, seg.color))}

                    {/* Ponteiro (aponta para a Alíquota Realizada em relação à Orçada) */}
                    <g filter="url(#needle-shadow-taxes)">
                        <line 
                            x1={cx} 
                            y1={cy} 
                            x2={needleX} 
                            y2={needleY} 
                            stroke="#1e293b" 
                            strokeWidth="3" 
                            strokeLinecap="round" 
                            markerEnd="url(#arrow-taxes)"
                            style={{ transition: 'all 0.8s ease-in-out' }}
                        />
                        {/* Miolo do ponteiro */}
                        <circle cx={cx} cy={cy} r="8.5" fill="#1e293b" />
                        <circle cx={cx} cy={cy} r="4" fill="#f8fafc" />
                    </g>

                    {/* Rótulos de 0% e Alíquota Orçada */}
                    <text x={cx - r - 10} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">0%</text>
                    <text x={cx + r + 20} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">{budgetTaxRate.toFixed(1)}% (Orçado)</text>
                </svg>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '2.2rem', textAlign: 'center', marginTop: '-15px', zIndex: 10 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>{realizedTaxRate.toFixed(2)}%</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>Alíquota Efetiva de Tributos</span>
                </div>
            </div>
        );
    };

    const renderGrossMargGauge = () => {
        const { budgetGrossMargRate, realizedGrossMargRate } = grossMargProjectionData;

        // SVG parameters
        const cx = 140;
        const cy = 110;
        const r = 80;
        
        // Target percentage of realized gross marg rate relative to budget gross marg rate (max 100%)
        const gaugePercent = budgetGrossMargRate > 0 ? (realizedGrossMargRate / budgetGrossMargRate) * 100 : 0;

        // Trig angle in radians for needle (left is PI, right is 0)
        const needleAngle = Math.PI - (Math.min(100, Math.max(0, gaugePercent)) / 100) * Math.PI;
        const needleLength = 62;
        const needleX = cx + needleLength * Math.cos(needleAngle);
        const needleY = cy - needleLength * Math.sin(needleAngle);

        // Helper to get coordinates for arc segments
        const getArcSegment = (startAngleDeg: number, endAngleDeg: number, strokeColor: string) => {
            const startRad = (startAngleDeg * Math.PI) / 180;
            const endRad = (endAngleDeg * Math.PI) / 180;
            
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy - r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy - r * Math.sin(endRad);
            
            return (
                <path 
                    key={startAngleDeg}
                    d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} 
                    fill="none" 
                    stroke={strokeColor} 
                    strokeWidth="14" 
                />
            );
        };

        // 5 segments (vermelho, laranja, amarelo, verde-limão, verde-escuro)
        const segments = [
            { color: '#ef4444', start: 180, end: 147 }, // Crítico
            { color: '#f97316', start: 144, end: 111 }, // Alerta
            { color: '#eab308', start: 108, end: 75 },  // Atenção
            { color: '#84cc16', start: 72, end: 39 },   // Bom
            { color: '#22c55e', start: 36, end: 3 }     // Excelente
        ];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 0.5rem', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', width: '100%', flex: 1, justifyContent: 'space-between' }}>
                <svg viewBox="0 0 280 135" style={{ overflow: 'visible', width: '100%', height: 'auto' }}>
                    <defs>
                        <filter id="needle-shadow-grossmarg" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="1" dy="2" stdDeviation="1" floodOpacity="0.15" />
                        </filter>
                        {/* Ponta da Seta */}
                        <marker id="arrow-grossmarg" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#1e293b" />
                        </marker>
                    </defs>

                    {/* Desenha os 5 segmentos coloridos */}
                    {segments.map(seg => getArcSegment(seg.start, seg.end, seg.color))}

                    {/* Ponteiro (aponta para a Margem Realizada em relação à Orçada) */}
                    <g filter="url(#needle-shadow-grossmarg)">
                        <line 
                            x1={cx} 
                            y1={cy} 
                            x2={needleX} 
                            y2={needleY} 
                            stroke="#1e293b" 
                            strokeWidth="3" 
                            strokeLinecap="round" 
                            markerEnd="url(#arrow-grossmarg)"
                            style={{ transition: 'all 0.8s ease-in-out' }}
                        />
                        {/* Miolo do ponteiro */}
                        <circle cx={cx} cy={cy} r="8.5" fill="#1e293b" />
                        <circle cx={cx} cy={cy} r="4" fill="#f8fafc" />
                    </g>

                    {/* Rótulos de 0% e Margem Orçada */}
                    <text x={cx - r - 10} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">0%</text>
                    <text x={cx + r + 20} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">{budgetGrossMargRate.toFixed(1)}% (Orçado)</text>
                </svg>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '2.2rem', textAlign: 'center', marginTop: '-15px', zIndex: 10 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>{realizedGrossMargRate.toFixed(2)}%</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>Margem Bruta Efetiva</span>
                </div>
            </div>
        );
    };

    const renderCostsGauge = () => {
        const { budgetCostRate, realizedCostRate } = costsProjectionData;

        // SVG parameters
        const cx = 140;
        const cy = 110;
        const r = 80;
        
        // Target percentage of realized cost rate relative to budget cost rate (max 100%)
        const gaugePercent = budgetCostRate > 0 ? (realizedCostRate / budgetCostRate) * 100 : 0;

        // Trig angle in radians for needle (left is PI, right is 0)
        const needleAngle = Math.PI - (Math.min(100, Math.max(0, gaugePercent)) / 100) * Math.PI;
        const needleLength = 62;
        const needleX = cx + needleLength * Math.cos(needleAngle);
        const needleY = cy - needleLength * Math.sin(needleAngle);

        // Helper to get coordinates for arc segments
        const getArcSegment = (startAngleDeg: number, endAngleDeg: number, strokeColor: string) => {
            const startRad = (startAngleDeg * Math.PI) / 180;
            const endRad = (endAngleDeg * Math.PI) / 180;
            
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy - r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy - r * Math.sin(endRad);
            
            return (
                <path 
                    key={startAngleDeg}
                    d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} 
                    fill="none" 
                    stroke={strokeColor} 
                    strokeWidth="14" 
                />
            );
        };

        // 5 segments: Inverted colors (verde to vermelho)
        const segments = [
            { color: '#22c55e', start: 180, end: 147 }, // Excelente (baixo custo operacional)
            { color: '#84cc16', start: 144, end: 111 }, // Bom
            { color: '#eab308', start: 108, end: 75 },  // Atenção
            { color: '#f97316', start: 72, end: 39 },   // Alerta
            { color: '#ef4444', start: 36, end: 3 }     // Crítico
        ];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 0.5rem', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', width: '100%', flex: 1, justifyContent: 'space-between' }}>
                <svg viewBox="0 0 280 135" style={{ overflow: 'visible', width: '100%', height: 'auto' }}>
                    <defs>
                        <filter id="needle-shadow-costs" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="1" dy="2" stdDeviation="1" floodOpacity="0.15" />
                        </filter>
                        {/* Ponta da Seta */}
                        <marker id="arrow-costs" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#1e293b" />
                        </marker>
                    </defs>

                    {/* Desenha os 5 segmentos coloridos */}
                    {segments.map(seg => getArcSegment(seg.start, seg.end, seg.color))}

                    {/* Ponteiro (aponta para o Custo Realizado em relação ao Orçado) */}
                    <g filter="url(#needle-shadow-costs)">
                        <line 
                            x1={cx} 
                            y1={cy} 
                            x2={needleX} 
                            y2={needleY} 
                            stroke="#1e293b" 
                            strokeWidth="3" 
                            strokeLinecap="round" 
                            markerEnd="url(#arrow-costs)"
                            style={{ transition: 'all 0.8s ease-in-out' }}
                        />
                        {/* Miolo do ponteiro */}
                        <circle cx={cx} cy={cy} r="8.5" fill="#1e293b" />
                        <circle cx={cx} cy={cy} r="4" fill="#f8fafc" />
                    </g>

                    {/* Rótulos de 0% e Alíquota Orçada */}
                    <text x={cx - r - 10} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">0%</text>
                    <text x={cx + r + 20} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">{budgetCostRate.toFixed(1)}% (Orçado)</text>
                </svg>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '2.2rem', textAlign: 'center', marginTop: '-15px', zIndex: 10 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>{realizedCostRate.toFixed(2)}%</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>Custo Operacional Efetivo</span>
                </div>
            </div>
        );
    };

    const renderEbitdaGauge = () => {
        const { budgetEbitdaRate, realizedEbitdaRate } = ebitdaProjectionData;

        // SVG parameters
        const cx = 140;
        const cy = 110;
        const r = 80;
        
        // Target percentage of realized EBITDA rate relative to budget EBITDA rate (max 100%)
        const gaugePercent = budgetEbitdaRate > 0 ? (realizedEbitdaRate / budgetEbitdaRate) * 100 : 0;

        // Trig angle in radians for needle (left is PI, right is 0)
        const needleAngle = Math.PI - (Math.min(100, Math.max(0, gaugePercent)) / 100) * Math.PI;
        const needleLength = 62;
        const needleX = cx + needleLength * Math.cos(needleAngle);
        const needleY = cy - needleLength * Math.sin(needleAngle);

        // Helper to get coordinates for arc segments
        const getArcSegment = (startAngleDeg: number, endAngleDeg: number, strokeColor: string) => {
            const startRad = (startAngleDeg * Math.PI) / 180;
            const endRad = (endAngleDeg * Math.PI) / 180;
            
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy - r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy - r * Math.sin(endRad);
            
            return (
                <path 
                    key={startAngleDeg}
                    d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} 
                    fill="none" 
                    stroke={strokeColor} 
                    strokeWidth="14" 
                />
            );
        };

        // 5 segments: Normal colors (vermelho to verde)
        const segments = [
            { color: '#ef4444', start: 180, end: 147 }, // Crítico
            { color: '#f97316', start: 144, end: 111 }, // Alerta
            { color: '#eab308', start: 108, end: 75 },  // Atenção
            { color: '#84cc16', start: 72, end: 39 },   // Bom
            { color: '#22c55e', start: 36, end: 3 }     // Excelente
        ];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 0.5rem', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', width: '100%', flex: 1, justifyContent: 'space-between' }}>
                <svg viewBox="0 0 280 135" style={{ overflow: 'visible', width: '100%', height: 'auto' }}>
                    <defs>
                        <filter id="needle-shadow-ebitda" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="1" dy="2" stdDeviation="1" floodOpacity="0.15" />
                        </filter>
                        {/* Ponta da Seta */}
                        <marker id="arrow-ebitda" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#1e293b" />
                        </marker>
                    </defs>

                    {/* Desenha os 5 segmentos coloridos */}
                    {segments.map(seg => getArcSegment(seg.start, seg.end, seg.color))}

                    {/* Ponteiro */}
                    <g filter="url(#needle-shadow-ebitda)">
                        <line 
                            x1={cx} 
                            y1={cy} 
                            x2={needleX} 
                            y2={needleY} 
                            stroke="#1e293b" 
                            strokeWidth="3" 
                            strokeLinecap="round" 
                            markerEnd="url(#arrow-ebitda)"
                            style={{ transition: 'all 0.8s ease-in-out' }}
                        />
                        {/* Miolo do ponteiro */}
                        <circle cx={cx} cy={cy} r="8.5" fill="#1e293b" />
                        <circle cx={cx} cy={cy} r="4" fill="#f8fafc" />
                    </g>

                    {/* Rótulos de 0% e EBITDA Orçado */}
                    <text x={cx - r - 10} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">0%</text>
                    <text x={cx + r + 20} y={cy + 15} fontSize="8.5" fontWeight="700" fill="#64748b" textAnchor="middle">{budgetEbitdaRate.toFixed(1)}% (Orçado)</text>
                </svg>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '2.2rem', textAlign: 'center', marginTop: '-15px', zIndex: 10 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>{realizedEbitdaRate.toFixed(2)}%</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>Margem EBITDA Efetiva</span>
                </div>
            </div>
        );
    };

    const handleCostCenterToggle = (id: string) => {
        setPendingCostCenter(prev => {
            if (prev.includes(id)) {
                const next = prev.filter(c => c !== id);
                return next.length === 0 ? ['DEFAULT'] : next;
            }
            const next = prev.includes('DEFAULT') ? [id] : [...prev, id];
            return next;
        });
    };

    const renderDashboardChart = (
        title: string,
        dataKey: 'vRev' | 'vTaxes' | 'vCosts' | 'vGrossMarg' | 'vOpExp' | 'vContribMarg' | 'vAdminExp' | 'vEbitda' | 'vFin' | 'vNetProfit' | 'vInvest',
        viewMode: 'mensal' | 'acumulado',
        setViewMode: React.Dispatch<React.SetStateAction<'mensal' | 'acumulado'>>,
        visible: { budget: boolean, realized: boolean, atingido: boolean, budgetRate: boolean, realizedRate: boolean },
        setVisible: React.Dispatch<React.SetStateAction<{ budget: boolean, realized: boolean, atingido: boolean, budgetRate: boolean, realizedRate: boolean }>>,
        colors: {
            budget: string,
            budgetText: string,
            realized: string,
            realizedText: string,
            rateBudget: string,
            rateRealized: string
        },
        rateLabel: string = 'Alíquota',
        showRateLines: boolean = true
    ) => {
        // Formatter for values on top of the bars
        const formatChartValue = (val: number) => {
            if (val === 0) return 'R$ 0';
            const isNegative = val < 0;
            const absVal = Math.abs(val);
            const valueInThousands = absVal / 1000;
            const formatted = valueInThousands.toFixed(1);
            return `${isNegative ? '-' : ''}R$ ${formatted}`;
        };

        const dataToUse = viewMode === 'acumulado' ? accumulatedDreTotals : precomputedDreTotals;

        // Detect if any data value is negative to switch layout dynamically
        const hasNegative = dataToUse.some((m, idx) => 
            m[dataKey].b < 0 || 
            (idx <= currentMonthIdx && m[dataKey].r !== undefined && m[dataKey].r < 0)
        );

        // Max absolute value across all 12 months for scale calculation
        const maxVal = Math.max(...dataToUse.map((m, idx) => Math.max(
            visible.budget ? Math.abs(m[dataKey].b) : 0, 
            (visible.realized && idx <= currentMonthIdx) ? Math.abs(m[dataKey].r || 0) : 0
        ))) || 1;

        // Find the maximum rate to define the Y scale for percentages, default to 100
        const maxRate = Math.max(1, ...dataToUse.map((month, idx) => {
            const bRev = month.vRev.b;
            const bVal = month[dataKey].b;
            const bRate = bRev > 0 ? (bVal / bRev) * 100 : 0;
            
            const rRev = month.vRev.r;
            const rVal = month[dataKey].r || 0;
            const rRate = (rRev > 0 && idx <= currentMonthIdx) ? (rVal / rRev) * 100 : 0;
            
            return Math.max(Math.abs(bRate), Math.abs(rRate));
        })) || 100;

        // Y Layout parameters:
        // hasNegative: baseline Y=220, max height 180px
        // positive-only: baseline Y=380, max height 320px
        const yBaseline = hasNegative ? 220 : 380;
        const maxBarHeight = hasNegative ? 180 : 320;

        // Helper to calculate target achievement percentage for negative/positive budget
        const getPctAtingido = (b: number, r: number) => {
            if (b > 0) return (r / b) * 100;
            if (b < 0) return (1 + (b - r) / b) * 100;
            return r >= 0 ? 100 : 0;
        };

        // Build paths for % lines
        let pathAtingido = '';
        let pathBudgetRate = '';
        let pathRealizedRate = '';
        const pointsAtingido: { x: number, y: number, pct: number }[] = [];
        const pointsBudgetRate: { x: number, y: number, rate: number }[] = [];
        const pointsRealizedRate: { x: number, y: number, rate: number }[] = [];
        
        dataToUse.forEach((month, idx) => {
            const pctX = 60 + idx * 90 + 44;
            const bVal = month[dataKey].b;
            const bRev = month.vRev.b;
            const rVal = month[dataKey].r || 0;
            const rRev = month.vRev.r;
            
            // 1. Budget Rate - all 12 months
            if (showRateLines && visible.budgetRate) {
                const bRate = bRev > 0 ? (bVal / bRev) * 100 : 0;
                // Scale dynamically based on maxRate
                const bRateY = hasNegative
                    ? Math.max(30, Math.min(390, 220 - (bRate / maxRate) * 170))
                    : Math.max(30, Math.min(390, 380 - (bRate / maxRate) * 320));
                pointsBudgetRate.push({ x: pctX, y: bRateY, rate: bRate });
                if (pathBudgetRate === '') {
                    pathBudgetRate = `M ${pctX} ${bRateY}`;
                } else {
                    pathBudgetRate += ` L ${pctX} ${bRateY}`;
                }
            }
            
            // 2. Realized elements (only for months <= currentMonthIdx)
            if (idx <= currentMonthIdx) {
                // Realized Rate
                if (showRateLines && visible.realizedRate) {
                    const rRate = rRev > 0 ? (rVal / rRev) * 100 : 0;
                    const rRateY = hasNegative
                        ? Math.max(30, Math.min(390, 220 - (rRate / maxRate) * 170))
                        : Math.max(30, Math.min(390, 380 - (rRate / maxRate) * 320));
                    pointsRealizedRate.push({ x: pctX, y: rRateY, rate: rRate });
                    if (pathRealizedRate === '') {
                        pathRealizedRate = `M ${pctX} ${rRateY}`;
                    } else {
                        pathRealizedRate += ` L ${pctX} ${rRateY}`;
                    }
                }
                
                // % Atingido
                if (visible.atingido) {
                    const pctAtingido = getPctAtingido(bVal, rVal);
                    const pctAtingidoY = hasNegative
                        ? Math.max(30, Math.min(390, 220 - (pctAtingido / 100) * 100))
                        : Math.max(30, Math.min(390, 360 - (pctAtingido / 100) * 220));
                    pointsAtingido.push({ x: pctX, y: pctAtingidoY, pct: pctAtingido });
                    if (pathAtingido === '') {
                        pathAtingido = `M ${pctX} ${pctAtingidoY}`;
                    } else {
                        pathAtingido += ` L ${pctX} ${pctAtingidoY}`;
                    }
                }
            }
        });

        // Determine Meta Orçada Color based on whether it is negative or positive
        const getBudgetBarFill = (val: number) => {
            if (hasNegative) {
                return val >= 0 ? colors.budget : '#ef4444'; // Red for negative budget
            }
            return colors.budget;
        };

        const getBudgetLabelColor = (val: number) => {
            if (hasNegative) {
                return val >= 0 ? colors.budgetText : '#b91c1c';
            }
            return colors.budgetText;
        };

        const getRealizedBarFill = (val: number) => {
            if (hasNegative) {
                return val >= 0 ? colors.realized : '#b91c1c'; // Dark red for negative realized
            }
            return colors.realized;
        };

        const getRealizedLabelColor = (val: number) => {
            if (hasNegative) {
                return val >= 0 ? colors.realizedText : '#991b1b';
            }
            return colors.realizedText;
        };

        return (
            <div className="glass-card" style={{ padding: '1.5rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                        {viewMode === 'acumulado' ? `${title} Acumulado` : title}
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500, marginLeft: '0.4rem' }}>(Valores em Mil R$)</span>
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                            onClick={() => openAnalysisForChart(dataKey)}
                            style={chartButtonStyle}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                        >
                            📊 Análise do Indicador
                        </button>
                        <div className="toggle-group" style={{ height: '30px', padding: '2px' }}>
                            <button onClick={() => setViewMode('mensal')} className={`toggle-btn ${viewMode === 'mensal' ? 'active' : ''}`} style={{ padding: '0 0.75rem', fontSize: '0.7rem' }}>Mensal</button>
                            <button onClick={() => setViewMode('acumulado')} className={`toggle-btn ${viewMode === 'acumulado' ? 'active' : ''}`} style={{ padding: '0 0.75rem', fontSize: '0.7rem' }}>Acumulado</button>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                        <svg viewBox="0 0 1200 450" width="100%" height="450px" style={{ minWidth: '800px', display: 'block' }}>
                            {/* Grid Lines */}
                            {hasNegative ? (
                                <>
                                    <line x1="40" y1="220" x2="1160" y2="220" stroke="#475569" strokeWidth="2" /> {/* Center Baseline */}
                                    <line x1="40" y1="310" x2="1160" y2="310" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="400" x2="1160" y2="400" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="130" x2="1160" y2="130" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="40" x2="1160" y2="40" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                                </>
                            ) : (
                                <>
                                    <line x1="40" y1="380" x2="1160" y2="380" stroke="#cbd5e1" strokeWidth="1" /> {/* Bottom Baseline */}
                                    <line x1="40" y1="300" x2="1160" y2="300" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="220" x2="1160" y2="220" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="140" x2="1160" y2="140" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="60" x2="1160" y2="60" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                                </>
                            )}

                            {/* Bars & Labels */}
                            {dataToUse.map((month, idx) => {
                                const bVal = visible.budget ? month[dataKey].b : 0;
                                const rVal = (visible.realized && idx <= currentMonthIdx) ? (month[dataKey].r || 0) : 0;
                                
                                const bHeight = visible.budget ? (Math.abs(bVal) / maxVal) * maxBarHeight : 0;
                                const rHeight = (visible.realized && idx <= currentMonthIdx) ? (Math.abs(rVal) / maxVal) * maxBarHeight : 0;
                                
                                const xBase = 60 + idx * 90;
                                
                                // Staggering overlap detection
                                const isClose = visible.budget && visible.realized && idx <= currentMonthIdx && Math.abs(bHeight - rHeight) < 16 && (bVal >= 0 === rVal >= 0);
                                
                                // Calculate Label positions based on baseline direction
                                const bLabelY = bVal >= 0 ? (yBaseline - bHeight - 6) : (yBaseline + bHeight + 12);
                                let rLabelY = rVal >= 0 ? (yBaseline - rHeight - 6) : (yBaseline + rHeight + 12);
                                if (isClose) {
                                    if (rVal >= 0) {
                                        rLabelY = yBaseline - rHeight - 18;
                                    } else {
                                        rLabelY = yBaseline + rHeight + 24;
                                    }
                                }

                                return (
                                    <g key={idx}>
                                        {/* Orçado Bar */}
                                        {visible.budget && bVal !== 0 && (
                                            <>
                                                <rect 
                                                    x={xBase + 20} 
                                                    y={bVal >= 0 ? yBaseline - bHeight : yBaseline} 
                                                    width="22" 
                                                    height={bHeight} 
                                                    fill={getBudgetBarFill(bVal)} 
                                                    rx="3"
                                                />
                                                <text 
                                                    x={xBase + 31} 
                                                    y={bLabelY} 
                                                    textAnchor="middle" 
                                                    fill={getBudgetLabelColor(bVal)} 
                                                    fontSize="9px" 
                                                    fontWeight="700"
                                                >
                                                    {formatChartValue(bVal)}
                                                </text>
                                            </>
                                        )}

                                        {/* Realizado Bar */}
                                        {visible.realized && idx <= currentMonthIdx && rVal !== 0 && (
                                            <>
                                                <rect 
                                                    x={xBase + 46} 
                                                    y={rVal >= 0 ? yBaseline - rHeight : yBaseline} 
                                                    width="22" 
                                                    height={rHeight} 
                                                    fill={getRealizedBarFill(rVal)} 
                                                    rx="3"
                                                />
                                                <text 
                                                    x={xBase + 57} 
                                                    y={rLabelY} 
                                                    textAnchor="middle" 
                                                    fill={getRealizedLabelColor(rVal)} 
                                                    fontSize="9px" 
                                                    fontWeight="700"
                                                >
                                                    {formatChartValue(rVal)}
                                                </text>
                                            </>
                                        )}

                                        {/* Month Label */}
                                        <text 
                                            x={xBase + 44} 
                                            y={hasNegative ? "430" : "420"} 
                                            textAnchor="middle" 
                                            fill="#64748b" 
                                            fontSize="11px" 
                                            fontWeight="700"
                                        >
                                            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Rate Lines */}
                            {showRateLines && pathBudgetRate && (
                                <path 
                                    d={pathBudgetRate} 
                                    fill="none" 
                                    stroke={colors.rateBudget} 
                                    strokeWidth="2" 
                                    strokeDasharray="4 4"
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                />
                            )}

                            {showRateLines && pathRealizedRate && (
                                <path 
                                    d={pathRealizedRate} 
                                    fill="none" 
                                    stroke={colors.rateRealized} 
                                    strokeWidth="2.5" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                />
                            )}

                            {/* Percentage Line (% Atingido) */}
                            {pathAtingido && (
                                <path 
                                    d={pathAtingido} 
                                    fill="none" 
                                    stroke="#f43f5e" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                />
                            )}

                            {/* Rate Dots & Labels (Budget) */}
                            {showRateLines && pointsBudgetRate.map((p, idx) => (
                                <g key={`br-${idx}`}>
                                    <circle 
                                        cx={p.x} 
                                        cy={p.y} 
                                        r="4" 
                                        fill={colors.rateBudget} 
                                        stroke="#ffffff" 
                                        strokeWidth="1.5" 
                                    />
                                    <text 
                                        x={p.x} 
                                        y={p.y + 13} 
                                        textAnchor="middle" 
                                        fill={colors.rateBudget} 
                                        fontSize="8px" 
                                        fontWeight="700"
                                        stroke="#ffffff"
                                        strokeWidth="2"
                                        paintOrder="stroke"
                                    >
                                        {p.rate.toFixed(1)}%
                                    </text>
                                </g>
                            ))}

                            {/* Rate Dots & Labels (Realized) */}
                            {showRateLines && pointsRealizedRate.map((p, idx) => (
                                <g key={`rr-${idx}`}>
                                    <circle 
                                        cx={p.x} 
                                        cy={p.y} 
                                        r="4.5" 
                                        fill={colors.rateRealized} 
                                        stroke="#ffffff" 
                                        strokeWidth="2" 
                                    />
                                    <text 
                                        x={p.x} 
                                        y={p.y - 8} 
                                        textAnchor="middle" 
                                        fill={colors.rateRealized} 
                                        fontSize="8.5px" 
                                        fontWeight="800"
                                        stroke="#ffffff"
                                        strokeWidth="2.5"
                                        paintOrder="stroke"
                                    >
                                        {p.rate.toFixed(1)}%
                                    </text>
                                </g>
                            ))}

                            {/* Percentage Dots & Labels (% Atingido) */}
                            {pointsAtingido.map((p, idx) => (
                                <g key={`at-${idx}`}>
                                    <circle 
                                        cx={p.x} 
                                        cy={p.y} 
                                        r="4" 
                                        fill="#f43f5e" 
                                        stroke="#ffffff" 
                                        strokeWidth="1.5" 
                                    />
                                    <text 
                                        x={p.x} 
                                        y={p.y - 8} 
                                        textAnchor="middle" 
                                        fill="#e11d48" 
                                        fontSize="8.5px" 
                                        fontWeight="800"
                                        stroke="#ffffff"
                                        strokeWidth="2"
                                        paintOrder="stroke"
                                    >
                                        {p.pct.toFixed(1)}%
                                    </text>
                                </g>
                            ))}
                        </svg>
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <div 
                            onClick={() => setVisible(prev => ({ ...prev, budget: !prev.budget }))}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', opacity: visible.budget ? 1 : 0.5, userSelect: 'none' }}
                        >
                            <div style={{ width: '12px', height: '12px', background: colors.budget, borderRadius: '3px' }} />
                            <span style={{ fontWeight: 600 }}>Meta Orçada</span>
                        </div>
                        <div 
                            onClick={() => setVisible(prev => ({ ...prev, realized: !prev.realized }))}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', opacity: visible.realized ? 1 : 0.5, userSelect: 'none' }}
                        >
                            <div style={{ width: '12px', height: '12px', background: colors.realized, borderRadius: '3px' }} />
                            <span style={{ fontWeight: 600 }}>Realizado</span>
                        </div>
                        {showRateLines && (
                            <>
                                <div 
                                    onClick={() => setVisible(prev => ({ ...prev, budgetRate: !prev.budgetRate }))}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', opacity: visible.budgetRate ? 1 : 0.5, userSelect: 'none' }}
                                >
                                    <div style={{ height: '3px', width: '20px', borderTop: `2.5px dashed ${colors.rateBudget}`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: colors.rateBudget, border: '1px solid #fff' }} />
                                    </div>
                                    <span style={{ fontWeight: 600 }}>{rateLabel} Orçado (%)</span>
                                </div>
                                <div 
                                    onClick={() => setVisible(prev => ({ ...prev, realizedRate: !prev.realizedRate }))}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', opacity: visible.realizedRate ? 1 : 0.5, userSelect: 'none' }}
                                >
                                    <div style={{ height: '3px', width: '20px', background: colors.rateRealized, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: colors.rateRealized, border: '1px solid #fff' }} />
                                    </div>
                                    <span style={{ fontWeight: 600 }}>{rateLabel} Realizado (%)</span>
                                </div>
                            </>
                        )}
                        <div 
                            onClick={() => setVisible(prev => ({ ...prev, atingido: !prev.atingido }))}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', opacity: visible.atingido ? 1 : 0.5, userSelect: 'none' }}
                        >
                            <div style={{ height: '3px', width: '20px', background: '#f43f5e', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f43f5e', border: '1px solid #fff' }} />
                            </div>
                            <span style={{ fontWeight: 600 }}>% Atingido</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderCompanyRevenueDonut = () => {
        const activeRevenueData = companyRevenueData.filter(item => item.value > 0);
        const totalRevenue = activeRevenueData.reduce((sum, item) => sum + item.value, 0);

        const cx = 300;
        const cy = 225;
        const R = 120;
        const strokeWidth = 36;
        const C = 2 * Math.PI * R; // ~753.98

        let sliceCumulativePercent = 0;
        let labelCumulativeAngle = -Math.PI / 2; // Start at the top (-90 degrees)

        return (
            <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, textAlign: 'left' }}>
                        Receita por Empresa (Período Selecionado)
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, display: 'block', marginTop: '0.25rem' }}>
                            Valores em Mil R$
                        </span>
                    </h3>
                </div>

                {activeRevenueData.length === 0 || totalRevenue === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
                        Nenhum dado de receita disponível para o período selecionado.
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                        <div style={{ width: '100%', maxWidth: '600px', height: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <svg viewBox="0 0 600 450" width="100%" height="100%">
                                <g transform={`rotate(-90 ${cx} ${cy})`}>
                                    {/* Background circle */}
                                    <circle 
                                        cx={cx} 
                                        cy={cy} 
                                        r={R} 
                                        fill="transparent" 
                                        stroke="#f1f5f9" 
                                        strokeWidth={strokeWidth} 
                                    />
                                    {activeRevenueData.map((item, idx) => {
                                        const strokeDashoffset = -((sliceCumulativePercent / 100) * C);
                                        const strokeDasharray = `${(item.percentage / 100) * C} ${C}`;
                                        const color = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308'][idx % 7];
                                        sliceCumulativePercent += item.percentage;

                                        return (
                                            <circle
                                                key={idx}
                                                cx={cx}
                                                cy={cy}
                                                r={R}
                                                fill="transparent"
                                                stroke={color}
                                                strokeWidth={strokeWidth}
                                                strokeDasharray={strokeDasharray}
                                                strokeDashoffset={strokeDashoffset}
                                                style={{ transition: 'stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease' }}
                                            />
                                        );
                                    })}
                                </g>

                                {/* Center labels */}
                                <text x={cx} y={cy - 16} textAnchor="middle" style={{ fontSize: '14px', fontWeight: 700, fill: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    Total
                                </text>
                                <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: '28px', fontWeight: 900, fill: '#0f172a' }}>
                                    R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </text>
                                <text x={cx} y={cy + 34} textAnchor="middle" style={{ fontSize: '12px', fontWeight: 600, fill: '#64748b' }}>
                                    Mil
                                </text>

                                {/* Pointer Lines and Labels */}
                                {activeRevenueData.map((item, idx) => {
                                    const sweep = (item.percentage / 100) * 2 * Math.PI;
                                    const middleAngle = labelCumulativeAngle + sweep / 2;
                                    labelCumulativeAngle += sweep;

                                    const color = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308'][idx % 7];

                                    // Trigonometry coordinates
                                    const cos = Math.cos(middleAngle);
                                    const sin = Math.sin(middleAngle);

                                    // Point on the outer edge of the slice
                                    const rStart = R + strokeWidth / 2; // 120 + 18 = 138
                                    const x1 = cx + rStart * cos;
                                    const y1 = cy + rStart * sin;

                                    // Point where the line goes outwards
                                    const rEnd = R + 45; // 120 + 45 = 165
                                    const x2 = cx + rEnd * cos;
                                    const y2 = cy + rEnd * sin;

                                    // Elbow position
                                    const isRightSide = cos >= 0;
                                    const x3 = x2 + (isRightSide ? 25 : -25);
                                    const textX = x3 + (isRightSide ? 6 : -6);
                                    const textAnchor = isRightSide ? 'start' : 'end';

                                    // Truncate name if too long
                                    const displayName = item.name.length > 18 
                                        ? item.name.substring(0, 16) + '...' 
                                        : item.name;

                                    return (
                                        <g key={`label-${idx}`}>
                                            {/* Small dot at start of pointer on the slice */}
                                            <circle 
                                                cx={x1} 
                                                cy={y1} 
                                                r="3.5" 
                                                fill={color} 
                                                stroke="#ffffff" 
                                                strokeWidth="1.5" 
                                            />
                                            {/* Pointer line with elbow */}
                                            <path 
                                                d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y2}`} 
                                                fill="none" 
                                                stroke="#cbd5e1" 
                                                strokeWidth="1.2" 
                                            />
                                            {/* Text labels */}
                                            <text
                                                x={textX}
                                                y={y2}
                                                textAnchor={textAnchor}
                                                style={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }}
                                            >
                                                <tspan x={textX} dy="-4" fontWeight="700" fill="#334155">
                                                    {displayName}
                                                </tspan>
                                                <tspan x={textX} dy="15" fontWeight="800" fill={color}>
                                                    R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mil ({item.percentage.toFixed(1)}%)
                                                </tspan>
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderCompanyGrossMargin = () => {
        const sortedData = [...companyGrossMarginData].sort((a, b) => b.margin - a.margin);

        return (
            <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, textAlign: 'left' }}>
                        Margem Bruta (MB) por Empresa (Período Selecionado)
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, display: 'block', marginTop: '0.25rem' }}>
                            Valores Absolutos em Mil R$ e Margem Percentual (%)
                        </span>
                    </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {sortedData.map((item, idx) => {
                        const isPositive = item.margin >= 0;
                        const marginPercentStr = `${item.percentage.toFixed(1)}%`;
                        
                        const maxAbsMargin = Math.max(...sortedData.map(d => Math.abs(d.margin)), 1);
                        const barWidthPercent = `${Math.min((Math.abs(item.margin) / maxAbsMargin) * 100, 100)}%`;

                        return (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
                                    <span style={{ color: '#334155' }}>{item.name}</span>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <span style={{ color: isPositive ? '#16a34a' : '#dc2626', fontWeight: 800 }}>
                                            R$ {item.margin.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mil
                                        </span>
                                        <span style={{ color: '#64748b', fontSize: '0.8rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                            {marginPercentStr}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ 
                                        position: 'absolute',
                                        left: isPositive ? '0' : 'auto',
                                        right: isPositive ? 'auto' : '0',
                                        width: barWidthPercent, 
                                        height: '100%', 
                                        background: isPositive ? 'linear-gradient(90deg, #3b82f6, #10b981)' : 'linear-gradient(90deg, #f87171, #ef4444)', 
                                        borderRadius: '4px',
                                        transition: 'width 0.5s ease'
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderCompanyContributionMargin = () => {
        const sortedData = [...companyContributionMarginData].sort((a, b) => b.margin - a.margin);

        return (
            <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, textAlign: 'left' }}>
                        Margem de Contribuição (MC) por Empresa (Período Selecionado)
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, display: 'block', marginTop: '0.25rem' }}>
                            Valores Absolutos em Mil R$ e Margem Percentual (%)
                        </span>
                    </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {sortedData.map((item, idx) => {
                        const isPositive = item.margin >= 0;
                        const marginPercentStr = `${item.percentage.toFixed(1)}%`;
                        
                        const maxAbsMargin = Math.max(...sortedData.map(d => Math.abs(d.margin)), 1);
                        const barWidthPercent = `${Math.min((Math.abs(item.margin) / maxAbsMargin) * 100, 100)}%`;

                        return (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
                                    <span style={{ color: '#334155' }}>{item.name}</span>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <span style={{ color: isPositive ? '#16a34a' : '#dc2626', fontWeight: 800 }}>
                                            R$ {item.margin.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mil
                                        </span>
                                        <span style={{ color: '#64748b', fontSize: '0.8rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                            {marginPercentStr}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ 
                                        position: 'absolute',
                                        left: isPositive ? '0' : 'auto',
                                        right: isPositive ? 'auto' : '0',
                                        width: barWidthPercent, 
                                        height: '100%', 
                                        background: isPositive ? 'linear-gradient(90deg, #6366f1, #8b5cf6)' : 'linear-gradient(90deg, #f87171, #ef4444)', 
                                        borderRadius: '4px',
                                        transition: 'width 0.5s ease'
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderContractsMarginPercentChart = () => {
        if (contractsLoading) {
            return (
                <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', minHeight: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ border: '3px solid #f3f3f3', borderTop: '3px solid #3b82f6', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite' }} />
                </div>
            );
        }

        if (contractsMarginData.length === 0) {
            return (
                <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                    Nenhum contrato/centro de custo com movimentação no período.
                </div>
            );
        }

        const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const periodLabel = startMonth === endMonth 
            ? `${MONTH_ABBR[startMonth]} / ${selectedYear}`
            : `${MONTH_ABBR[startMonth]} a ${MONTH_ABBR[endMonth]} de ${selectedYear}`;

        const maxAbs = Math.max(...contractsMarginData.flatMap(d => [Math.abs(d.realizedValue), Math.abs(d.budgetValue)]), 1);
        
        // Parâmetros de layout vertical
        const heightUpper = 200; // Região superior (positiva) de 200px
        const heightLower = 80;  // Região inferior (negativa) de 80px
        const yZero = 230;       // Linha de base zero a 230px do topo (paddingTop = 30px)
        const svgHeight = 330;   // Altura total do SVG (paddingTop: 30 + 200 + 80 + paddingBottom: 20)
        const colWidth = 50;     // Largura reduzida para colunas quase coladas (gap de 4px)

        const getYAbs = (v: number) => {
            if (v >= 0) {
                return yZero - (v / maxAbs) * heightUpper;
            } else {
                return yZero + (Math.abs(v) / maxAbs) * heightLower;
            }
        };

        const drawBar = (v: number, xOffset: number, fill: string, labelColor: string) => {
            const yVal = getYAbs(v);
            const y = Math.min(yZero, yVal);
            const h = Math.abs(yVal - yZero);
            if (h <= 1) return null;

            const barWidth = 22;
            const xCenter = xOffset + barWidth / 2;
            const labelText = `${v.toFixed(0)}k`;
            
            // Se a barra for alta o suficiente (>= 25px), renderiza o texto na vertical centralizado dentro da barra
            const showLabelInside = h >= 25;
            let labelElement = null;

            if (showLabelInside) {
                const yText = v >= 0 ? yZero - h / 2 : yZero + h / 2;
                labelElement = (
                    <text
                        x={xCenter}
                        y={yText}
                        fill={labelColor}
                        fontSize="9px"
                        fontWeight="800"
                        textAnchor="middle"
                        dominantBaseline="central"
                        transform={`rotate(-90, ${xCenter}, ${yText})`}
                        pointerEvents="none"
                    >
                        {labelText}
                    </text>
                );
            } else if (h > 4) {
                // Se for muito curta, desenha acima (para positivo) ou abaixo (para negativo)
                const yText = v >= 0 ? y - 6 : y + h + 10;
                labelElement = (
                    <text
                        x={xCenter}
                        y={yText}
                        fill="#475569"
                        fontSize="8px"
                        fontWeight="700"
                        textAnchor="middle"
                        transform={`rotate(-90, ${xCenter}, ${yText})`}
                        pointerEvents="none"
                    >
                        {labelText}
                    </text>
                );
            }

            return (
                <g>
                    <rect x={xOffset} y={y} width={barWidth} height={h} fill={fill} rx={2} />
                    {labelElement}
                </g>
            );
        };

        // Lógica de cálculo dos limites do gráfico de linhas (percentual)
        let minP = Math.min(...contractsMarginData.flatMap(d => [d.realizedPercent, d.budgetPercent]), 0);
        let maxP = Math.max(...contractsMarginData.flatMap(d => [d.realizedPercent, d.budgetPercent]), 0);
        
        if (minP < -100) minP = -100;
        if (maxP > 150) maxP = 150;
        if (minP === 0 && maxP === 0) {
            minP = -10;
            maxP = 100;
        }

        const maxPosPercent = Math.max(maxP, 1);
        const maxNegPercent = Math.max(Math.abs(minP), 1);

        const getYPercent = (v: number) => {
            if (v >= 0) {
                return yZero - (v / maxPosPercent) * heightUpper;
            } else {
                return yZero + (Math.abs(v) / maxNegPercent) * heightLower;
            }
        };

        const totalWidth = contractsMarginData.length * colWidth;

        // Path do Orçado %
        const budgetPoints = contractsMarginData.map((d, idx) => `${idx * colWidth + colWidth/2},${getYPercent(d.budgetPercent)}`).join(' L ');
        const budgetPath = `M ${budgetPoints}`;

        // Path do Realizado %
        const realizedPoints = contractsMarginData.map((d, idx) => `${idx * colWidth + colWidth/2},${getYPercent(d.realizedPercent)}`).join(' L ');
        const realizedPath = `M ${realizedPoints}`;

        return (
            <div className="glass-card" style={{ padding: '1.5rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            Margem por Contrato (Orçado x Realizado)
                        </h3>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, display: 'block', marginTop: '0.25rem' }}>
                            Rentabilidade Combinada: Valores Absolutos (Barras em R$ Mil) & Percentuais (Linhas em %)
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 700, display: 'block', marginTop: '0.25rem' }}>
                            Período: {periodLabel} (Acumulado) — Valores detalhados no card ao apontar
                        </span>
                    </div>
                    {/* Legenda Combinada */}
                    <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.75rem', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '10px', height: '10px', backgroundColor: '#cbd5e1', borderRadius: '2px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', marginLeft: '4px' }}>
                                <div style={{ width: '10px', height: '2px', backgroundColor: '#94a3b8' }} />
                                <div style={{ width: '5px', height: '5px', backgroundColor: '#ffffff', stroke: '#94a3b8', strokeWidth: '1.5px', borderRadius: '50%', marginLeft: '-8px' }} />
                            </div>
                            <span style={{ color: '#64748b', marginLeft: '2px' }}>Orçado (Valor & %)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '10px', height: '10px', background: 'linear-gradient(180deg, #818cf8, #4f46e5)', borderRadius: '2px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', marginLeft: '4px' }}>
                                <div style={{ width: '10px', height: '2px', backgroundColor: '#10b981' }} />
                                <div style={{ width: '5px', height: '5px', backgroundColor: '#ffffff', stroke: '#10b981', strokeWidth: '1.5px', borderRadius: '50%', marginLeft: '-8px' }} />
                            </div>
                            <span style={{ color: '#4f46e5', marginLeft: '2px' }}>Realizado (Valor & %)</span>
                        </div>
                    </div>
                </div>

                {/* Container com scroll horizontal */}
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    overflowX: 'auto', 
                    overflowY: 'hidden',
                    width: '100%',
                    WebkitOverflowScrolling: 'touch',
                    flex: 1,
                    justifyContent: 'flex-end'
                }}>
                    {/* Linha do SVG */}
                    <div style={{ width: `${totalWidth}px`, height: `${svgHeight}px`, position: 'relative' }}>
                        <svg width={totalWidth} height={svgHeight} style={{ overflow: 'visible' }}>
                            <defs>
                                <linearGradient id="realizedPosGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.85" />
                                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.85" />
                                </linearGradient>
                                <linearGradient id="realizedNegGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f87171" stopOpacity="0.85" />
                                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.85" />
                                </linearGradient>
                                <linearGradient id="budgetGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.75" />
                                    <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.75" />
                                </linearGradient>
                            </defs>

                            {/* Guideline de Hover */}
                            {contractsMarginHoveredIndex !== null && contractsMarginHoveredChart === 'percentage' && (
                                <line
                                    x1={contractsMarginHoveredIndex * colWidth + colWidth / 2}
                                    y1={0}
                                    x2={contractsMarginHoveredIndex * colWidth + colWidth / 2}
                                    y2={svgHeight}
                                    stroke="#cbd5e1"
                                    strokeWidth={1.5}
                                    strokeDasharray="4 4"
                                    pointerEvents="none"
                                />
                            )}

                            {/* Linha de Base Zero */}
                            {yZero >= 0 && yZero <= svgHeight && (
                                <line 
                                    x1={0} 
                                    y1={yZero} 
                                    x2={totalWidth} 
                                    y2={yZero} 
                                    stroke="#cbd5e1" 
                                    strokeWidth={1} 
                                    strokeDasharray="4 4" 
                                />
                            )}

                            {/* LAYER 2: Barras de Valores Absolutos */}
                            {contractsMarginData.map((item, idx) => {
                                const x = idx * colWidth + colWidth / 2;
                                return (
                                    <g key={`bars-${idx}`}>
                                        {drawBar(item.budgetValue, x - 23, 'url(#budgetGrad)', '#1e293b')}
                                        {drawBar(item.realizedValue, x + 1, item.realizedValue >= 0 ? 'url(#realizedPosGrad)' : 'url(#realizedNegGrad)', '#ffffff')}
                                    </g>
                                );
                            })}

                            {/* LAYER 3: Linhas Orçado e Realizado */}
                            {contractsMarginData.length > 1 && (
                                <path 
                                    d={budgetPath} 
                                    fill="none" 
                                    stroke="#94a3b8" 
                                    strokeWidth={2} 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    opacity="0.8"
                                 />
                            )}

                            {/* Linha Realizado */}
                            {contractsMarginData.length > 1 && (
                                <path 
                                    d={realizedPath} 
                                    fill="none" 
                                    stroke="#10b981" 
                                    strokeWidth={2.5} 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                 />
                            )}

                            {/* LAYER 4: Círculos e Rótulos das Linhas */}
                            {contractsMarginData.map((item, idx) => {
                                const x = idx * colWidth + colWidth / 2;
                                const yB = getYPercent(item.budgetPercent);
                                const yR = getYPercent(item.realizedPercent);

                                const isRealGreater = item.realizedPercent >= item.budgetPercent;
                                const rTextY = isRealGreater ? yR - 10 : yR + 14;
                                const bTextY = isRealGreater ? yB + 14 : yB - 10;

                                return (
                                    <g key={`points-${idx}`}>
                                        {/* Pontos do Orçado */}
                                        <circle 
                                            cx={x} 
                                            cy={yB} 
                                            r={3.5} 
                                            fill="#ffffff" 
                                            stroke="#cbd5e1" 
                                            strokeWidth={1.5} 
                                        />
                                        <text 
                                            x={x} 
                                            y={bTextY} 
                                            textAnchor="middle" 
                                            fontSize="9px" 
                                            fontWeight="600" 
                                            fill="#64748b"
                                        >
                                            {item.budgetPercent.toFixed(0)}%
                                        </text>

                                        {/* Pontos do Realizado */}
                                        <circle 
                                            cx={x} 
                                            cy={yR} 
                                            r={4.5} 
                                            fill="#ffffff" 
                                            stroke="#10b981" 
                                            strokeWidth={2} 
                                        />
                                        <text 
                                            x={x} 
                                            y={rTextY} 
                                            textAnchor="middle" 
                                            fontSize="9px" 
                                            fontWeight="800" 
                                            fill="#049669"
                                        >
                                            {item.realizedPercent.toFixed(0)}%
                                        </text>
                                    </g>
                                );
                            })}

                            {/* LAYER 5: Hover Detector Slices */}
                            {contractsMarginData.map((item, idx) => (
                                <rect
                                    key={`hover-percent-${idx}`}
                                    x={idx * colWidth}
                                    y={0}
                                    width={colWidth}
                                    height={svgHeight}
                                    fill="transparent"
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={(e) => {
                                        setContractsMarginHoveredIndex(idx);
                                        setContractsMarginHoveredChart('percentage');
                                        setContractsMarginTooltip({
                                            x: e.clientX,
                                            y: e.clientY,
                                            title: item.name,
                                            budget: `R$ ${item.budgetValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k (${item.budgetPercent.toFixed(1)}%)`,
                                            realized: `R$ ${item.realizedValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k (${item.realizedPercent.toFixed(1)}%)`,
                                            achievement: calculateAtingimento(item.budgetValue, item.realizedValue),
                                            type: 'percentage'
                                        });
                                    }}
                                    onMouseMove={(e) => {
                                        setContractsMarginTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                                    }}
                                    onMouseLeave={() => {
                                        setContractsMarginHoveredIndex(null);
                                        setContractsMarginHoveredChart(null);
                                        setContractsMarginTooltip(null);
                                    }}
                                />
                            ))}
                        </svg>
                    </div>
                </div>
            </div>
        );
    };

    const renderContractsBarChart = () => {
        if (contractsLoading) {
            return (
                <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', minHeight: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <div style={{ border: '3px solid #f3f3f3', borderTop: '3px solid #3b82f6', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite' }} />
                    <span style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Carregando contratos...</span>
                    <style>{`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}</style>
                </div>
            );
        }

        const isAccumulated = selectedContractsMonth === 'accumulated';

        if (contractsData.length === 0) {
            return (
                <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, textAlign: 'left' }}>
                            Faturamento por Contrato
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, display: 'block', marginTop: '0.25rem' }}>
                                Valores acumulados do período em Mil R$ e % do total orçado
                            </span>
                            <span style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700, display: 'block', marginTop: '0.35rem' }}>
                                Receita Anual Total: <span style={{ color: '#10b981', fontWeight: 800 }}>{contractsAnnualTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </span>
                        </h3>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, minHeight: '150px' }}>
                        Nenhum contrato com faturamento realizado no período selecionado.
                    </div>
                </div>
            );
        }

        // Months in the selected range
        const monthsInPeriod: number[] = [];
        for (let m = startMonth; m <= endMonth; m++) {
            monthsInPeriod.push(m);
        }

        const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        // Determine active view mode (accumulated vs specific month)
        const displayData = contractsData.map(item => {
            let val = item.value;
            let percentage = item.percentage;

            if (!isAccumulated) {
                const mIdx = parseInt(selectedContractsMonth, 10);
                val = item.monthlyValues?.[mIdx] || 0;
                const mBudget = monthlyBudgets[mIdx] || 0;
                percentage = mBudget > 0 ? (val / mBudget) * 100 : 0;
            }

            return {
                name: item.name,
                value: val,
                percentage
            };
        })
        .filter(c => c.value > 0)
        .sort((a, b) => b.value - a.value);

        if (displayData.length === 0) {
            return (
                <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            Faturamento por Contrato
                            <span style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700, display: 'block', marginTop: '0.35rem' }}>
                                Receita Anual Total: <span style={{ color: '#10b981', fontWeight: 800 }}>{contractsAnnualTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </span>
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <select 
                                value={selectedContractsMonth} 
                                onChange={(e) => setSelectedContractsMonth(e.target.value)}
                                style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: 600, color: '#334155', background: '#ffffff', cursor: 'pointer', outline: 'none', height: '28px' }}
                            >
                                <option value="accumulated">Acumulado do Período</option>
                                {monthsInPeriod.map(m => (
                                    <option key={m} value={m.toString()}>{MONTH_SHORT[m]}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, minHeight: '150px' }}>
                        Sem faturamento lançado no mês selecionado.
                    </div>
                </div>
            );
        }

        const maxVal = Math.max(...displayData.map(c => c.value));

        return (
            <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, textAlign: 'left' }}>
                        Faturamento por Contrato
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, display: 'block', marginTop: '0.25rem' }}>
                            {isAccumulated 
                                ? "Valores acumulados do período em Mil R$ e % do total orçado"
                                : `Faturamento de ${MONTH_NAMES[parseInt(selectedContractsMonth, 10)]} em Mil R$ e % do orçado do mês`}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700, display: 'block', marginTop: '0.35rem' }}>
                            Receita Anual Total: <span style={{ color: '#10b981', fontWeight: 800 }}>{contractsAnnualTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </span>
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <select 
                            value={selectedContractsMonth} 
                            onChange={(e) => setSelectedContractsMonth(e.target.value)}
                            style={{ 
                                padding: '0.25rem 0.5rem', 
                                borderRadius: '6px', 
                                border: '1px solid #cbd5e1', 
                                fontSize: '0.75rem', 
                                fontWeight: 600, 
                                color: '#334155', 
                                background: '#ffffff', 
                                cursor: 'pointer', 
                                outline: 'none',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                height: '28px'
                            }}
                        >
                        <option value="accumulated">Acumulado do Período</option>
                        {monthsInPeriod.map(m => (
                            <option key={m} value={m.toString()}>{MONTH_SHORT[m]}</option>
                        ))}
                    </select>
                </div>
            </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {displayData.map((item, idx) => {
                        const barWidth = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
                        const barColor = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308'][idx % 7];

                        return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {/* Contract/Customer Name */}
                                <div style={{ width: '180px', minWidth: '180px', maxWidth: '180px', fontSize: '0.8rem', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.name}>
                                    {item.name}
                                </div>

                                {/* Bar Container */}
                                <div style={{ flex: 1, height: '24px', background: '#f1f5f9', borderRadius: '6px', position: 'relative', overflow: 'hidden' }}>
                                    <div 
                                        style={{ 
                                            width: `${barWidth}%`, 
                                            height: '100%', 
                                            background: `linear-gradient(90deg, ${barColor}dd, ${barColor})`, 
                                            borderRadius: '6px',
                                            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                                            position: 'relative'
                                        }} 
                                    />
                                </div>

                                {/* Value and percentage */}
                                <div style={{ width: '160px', minWidth: '160px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px', fontSize: '0.8rem', fontWeight: 800 }}>
                                    <span style={{ color: '#0f172a' }}>
                                        R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mil
                                    </span>
                                    <span style={{ color: barColor, width: '56px', textAlign: 'right' }}>
                                        {item.percentage.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };


    const handleCompanyToggle = (id: string) => {
        setPendingCompany(prev => {
            if (prev.includes(id)) {
                const next = prev.filter(c => c !== id);
                return next.length === 0 ? ['DEFAULT'] : next;
            }
            const next = prev.includes('DEFAULT') ? [id] : [...prev, id];
            return next;
        });
        // Auto-reset CC selection so stale CCs from other companies don't remain selected
        setPendingCostCenter(['DEFAULT']);
    };

    const applyFilter = () => {
        setSelectedCostCenter(pendingCostCenter);
        setSelectedCompany(pendingCompany);
        setCostCenterDropdownOpen(false);
        setCompanyDropdownOpen(false);
        setCompanySearch('');
        setCostCenterSearch('');
    };

    const clearFilter = () => {
        setPendingCostCenter(['DEFAULT']);
        setSelectedCostCenter(['DEFAULT']);
        setPendingCompany(['DEFAULT']);
        setSelectedCompany(['DEFAULT']);
        setCostCenterDropdownOpen(false);
        setCompanyDropdownOpen(false);
        setCompanySearch('');
        setCostCenterSearch('');
    };

    const getSelectedCostCenterNames = (current: string[]) => {
        if (current.includes('DEFAULT') && current.length === 1) return 'Todos os Centros de Custos';
        const names = filteredCostCenters.filter(c => current.includes(c.id)).map(c => c.name);
        if (names.length === 0) return 'Todos os Centros de Custos';
        if (names.length === 1) return names[0];
        if (names.length === filteredCostCenters.length) return 'Todos Selecionados';
        return `${names.length} selecionados`;
    };

    const getSelectedCompanyNames = (current: string[]) => {
        if (current.includes('DEFAULT') && current.length === 1) return 'Todas as Empresas';
        const names = companies.filter(c => current.includes(c.id)).map(c => c.name);
        if (names.length === 0) return 'Todas as Empresas';
        if (names.length === 1) return names[0];
        if (names.length === companies.length) return 'Todas Selecionadas';
        return `${names.length} selecionadas`;
    };

    return (
        <>
            {/* SECTION 2: FILTERS & CONTROLS - SINGLE ROW PREMIUM */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 0.75rem 0', width: '100%', flexWrap: 'nowrap', gap: '1rem', background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', border: '1px solid var(--border-subtle)' }}>
                
                {/* LEFT: Empresa & Centro de Custo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Empresa Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Empresa</label>
                        <div style={{ position: 'relative', minWidth: '200px' }}>
                            <div
                                onClick={() => {
                                    if (companyDropdownOpen) {
                                        applyFilter();
                                    } else {
                                        setCompanyDropdownOpen(true);
                                    }
                                }}
                                className="premium-input"
                                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', paddingRight: '0.75rem', height: 'auto', minHeight: '32px' }}
                            >
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem', fontWeight: 600 }}>{getSelectedCompanyNames(pendingCompany)}</span>
                                <span style={{ fontSize: '0.6rem', opacity: 0.5, marginLeft: '0.5rem' }}>▼</span>
                            </div>

                            {companyDropdownOpen && (
                                <>
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => applyFilter()} />
                                    <div className="glass-card" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 1000, maxHeight: '350px', overflowY: 'auto', background: 'var(--bg-surface)', padding: '0.5rem 0' }}>
                                        <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10 }}>
                                            <input 
                                                type="text" 
                                                placeholder="Pesquisar empresa..." 
                                                value={companySearch}
                                                onChange={(e) => setCompanySearch(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-base)', outline: 'none' }}
                                            />
                                        </div>
                                        <label style={{ display: 'flex', alignItems: 'center', padding: '0.65rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem', fontWeight: pendingCompany.includes('DEFAULT') ? 700 : 400 }} className="hover-row">
                                            <input 
                                                type="checkbox" 
                                                checked={pendingCompany.includes('DEFAULT')} 
                                                onChange={() => {
                                                    setPendingCompany(['DEFAULT']);
                                                    setPendingCostCenter(['DEFAULT']);
                                                    setSelectedCompany(['DEFAULT']);
                                                    setSelectedCostCenter(['DEFAULT']);
                                                    setCompanyDropdownOpen(false);
                                                    setCompanySearch('');
                                                }} 
                                                style={{ marginRight: '0.75rem', accentColor: 'var(--accent-blue)' }} 
                                            />
                                            <span style={{ flex: 1, color: 'var(--text-primary)' }}>Todas as Empresas</span>
                                        </label>
                                        {companies.filter(c => c.name.toLowerCase().includes(companySearch.toLowerCase())).map(c => (
                                            <label key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '0.65rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem' }} className="hover-row">
                                                <input type="checkbox" checked={pendingCompany.includes(c.id)} onChange={() => handleCompanyToggle(c.id)} style={{ marginRight: '0.75rem', accentColor: 'var(--accent-blue)' }} />
                                                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{c.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Cost Center Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Centro de Custo</label>
                        <div style={{ position: 'relative', minWidth: '200px' }}>
                            <div
                                onClick={() => {
                                    if (costCenterDropdownOpen) {
                                        applyFilter();
                                    } else {
                                        setCostCenterDropdownOpen(true);
                                    }
                                }}
                                className="premium-input"
                                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', paddingRight: '0.75rem', height: 'auto', minHeight: '32px' }}
                            >
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem', fontWeight: 600 }}>{getSelectedCostCenterNames(pendingCostCenter)}</span>
                                <span style={{ fontSize: '0.6rem', opacity: 0.5, marginLeft: '0.5rem' }}>▼</span>
                            </div>

                            {costCenterDropdownOpen && (
                                <>
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => applyFilter()} />
                                    <div className="glass-card" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 1000, maxHeight: '350px', overflowY: 'auto', background: 'var(--bg-surface)', padding: '0.5rem 0' }}>
                                        <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10 }}>
                                            <input 
                                                type="text" 
                                                placeholder="Pesquisar CC..." 
                                                value={costCenterSearch}
                                                onChange={(e) => setCostCenterSearch(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-base)', outline: 'none' }}
                                            />
                                        </div>
                                        <label style={{ display: 'flex', alignItems: 'center', padding: '0.65rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem', fontWeight: pendingCostCenter.includes('DEFAULT') ? 700 : 400 }} className="hover-row">
                                            <input 
                                                type="checkbox" 
                                                checked={pendingCostCenter.includes('DEFAULT')} 
                                                onChange={() => {
                                                    setPendingCostCenter(['DEFAULT']);
                                                    setSelectedCostCenter(['DEFAULT']);
                                                    setCostCenterDropdownOpen(false);
                                                    setCostCenterSearch('');
                                                }} 
                                                style={{ marginRight: '0.75rem', accentColor: 'var(--accent-blue)' }} 
                                            />
                                            <span style={{ flex: 1, color: 'var(--text-primary)' }}>Todos os Centros de Custos</span>
                                        </label>
                                        {filteredCostCenters.filter(cc => cc.name.toLowerCase().includes(costCenterSearch.toLowerCase())).map(cc => (
                                            <label key={cc.id} style={{ display: 'flex', alignItems: 'center', padding: '0.65rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem' }} className="hover-row">
                                                <input type="checkbox" checked={pendingCostCenter.includes(cc.id)} onChange={() => handleCostCenterToggle(cc.id)} style={{ marginRight: '0.75rem', accentColor: 'var(--accent-blue)' }} />
                                                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{cc.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {/* Status Badge */}
                        {selectedCostCenter.length === 1 && selectedCostCenter[0] !== 'DEFAULT' && isCCLocked && (
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.4rem', 
                                padding: '0 0.75rem', 
                                height: '32px', 
                                background: 'var(--accent-red-glow)', 
                                color: 'var(--accent-red)', 
                                borderRadius: '8px', 
                                fontSize: '0.7rem', 
                                fontWeight: 800,
                                border: '1px solid rgba(239, 68, 68, 0.2)'
                            }}>
                                🔒 ORÇAMENTO BLOQUEADO
                            </div>
                        )}

                        <button
                            onClick={() => {
                                setIsTransferModalOpen(true);
                                const initialSource = selectedCompany.includes('DEFAULT') ? companies[0]?.id : selectedCompany[0];
                                setTransferSourceTenantId(initialSource || '');
                                const initialTarget = companies.find(c => c.id !== initialSource)?.id || '';
                                setTransferTargetTenantId(initialTarget);
                                setTransferMonth(new Date().getMonth() + 1);
                                setTransferYear(selectedYear);
                                setTransferAmount('');
                                setTransferReason('');
                            }}
                            className="premium-btn"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0.4rem 0.85rem',
                                height: '32px',
                                background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                                color: '#ffffff',
                                borderRadius: '8px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(79, 70, 229, 0.3)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(79, 70, 229, 0.2)';
                            }}
                        >
                            <span>💸</span>
                            <span>Transf. Gerencial</span>
                        </button>
                    </div>


                </div>

                <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }} />

                {/* RIGHT: Análises & Toggles / Período de Análise */}
                {activeTab === 'graficos' || activeTab === 'kpi' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Período</span>
                            <select
                                value={selectedPeriodOption}
                                onChange={(e) => handlePeriodOptionChange(e.target.value)}
                                style={{
                                    padding: '0.35rem 0.5rem',
                                    fontSize: '0.75rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-default)',
                                    background: 'var(--bg-surface)',
                                    color: 'var(--text-primary)',
                                    fontWeight: 700,
                                    outline: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    height: '32px'
                                }}
                            >
                                <option value="mes_atual">Mês Atual (Junho)</option>
                                <option value="1_tri">1º Trimestre (Jan-Mar)</option>
                                <option value="2_tri">2º Trimestre (Abr-Jun)</option>
                                <option value="3_tri">3º Trimestre (Jul-Set)</option>
                                <option value="4_tri">4º Trimestre (Out-Dez)</option>
                                <option value="1_semestre">1º Semestre (Jan-Jun)</option>
                                <option value="2_semestre">2º Semestre (Jul-Dez)</option>
                                <option value="ano_todo">Ano Todo (Jan-Dez)</option>
                                <option value="personalizado">Personalizado</option>
                            </select>
                        </div>

                        {selectedPeriodOption === 'personalizado' && (
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.75rem',
                                background: 'var(--bg-base)',
                                padding: '0 0.5rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                                height: '32px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>De:</span>
                                    <select 
                                        value={startMonth} 
                                        onChange={(e) => handleStartMonthChange(Number(e.target.value))}
                                        style={{ 
                                            padding: '0.2rem 0.4rem', 
                                            fontSize: '0.7rem', 
                                            borderRadius: '6px', 
                                            border: '1px solid var(--border-default)', 
                                            background: 'var(--bg-surface)', 
                                            color: 'var(--text-primary)', 
                                            fontWeight: 600,
                                            outline: 'none',
                                            cursor: 'pointer',
                                            height: '24px'
                                        }}
                                    >
                                        {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, idx) => (
                                            <option key={idx} value={idx}>{m}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Até:</span>
                                    <select 
                                        value={endMonth} 
                                        onChange={(e) => handleEndMonthChange(Number(e.target.value))}
                                        style={{ 
                                            padding: '0.2rem 0.4rem', 
                                            fontSize: '0.7rem', 
                                            borderRadius: '6px', 
                                            border: '1px solid var(--border-default)', 
                                            background: 'var(--bg-surface)', 
                                            color: 'var(--text-primary)', 
                                            fontWeight: 600,
                                            outline: 'none',
                                            cursor: 'pointer',
                                            height: '24px'
                                        }}
                                    >
                                        {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, idx) => (
                                            <option key={idx} value={idx}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {/* Análises Checkboxes Premium */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.2rem' }}>Análises</span>

                            {[
                                { label: 'Análise Vertical', state: showAV, setState: setShowAV },
                                { label: 'AH (Orçado x Real)', state: showAH, setState: setShowAH },
                                // { label: 'AH (Radar x Real)', state: showAR, setState: setShowAR }, // RADAR OCULTO
                                { label: 'AH MoM', state: showAH_MoM, setState: setShowAH_MoM }
                            ].map((item, idx) => (
                                <label key={idx} style={{ 
                                    display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', cursor: 'pointer', 
                                    color: item.state ? 'var(--text-primary)' : 'var(--text-secondary)', 
                                    fontWeight: item.state ? 600 : 500, padding: '0.2rem 0.4rem', borderRadius: '6px', 
                                    background: item.state ? 'var(--bg-surface)' : 'transparent', 
                                    transition: 'all 0.2s', border: item.state ? '1px solid var(--border-default)' : '1px solid transparent'
                                }}>
                                    <input type="checkbox" checked={item.state} onChange={(e) => item.setState(e.target.checked)} style={{ display: 'none' }} />
                                    <div style={{ 
                                        width: '12px', height: '12px', borderRadius: '3px', 
                                        border: `1px solid ${item.state ? 'var(--accent-blue)' : 'var(--border-darker)'}`, 
                                        background: item.state ? 'var(--accent-blue)' : 'var(--bg-surface)', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                    }}>
                                        {item.state && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                    </div>
                                    {item.label}
                                </label>
                            ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="toggle-group" style={{ height: '30px', padding: '2px' }}>
                                <button onClick={() => setViewPeriod('month')} className={`toggle-btn ${viewPeriod === 'month' ? 'active' : ''}`} style={{ padding: '0 0.75rem', fontSize: '0.7rem' }}>Mês</button>
                                <button onClick={() => setViewPeriod('quarter')} className={`toggle-btn ${viewPeriod === 'quarter' ? 'active' : ''}`} style={{ padding: '0 0.75rem', fontSize: '0.7rem' }}>Trimestre</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {activeTab === 'kpi' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '1.5rem', width: '100%', flexWrap: 'wrap', alignItems: 'stretch' }}>
                        <div style={{ flex: 1, minWidth: '350px', display: 'flex', flexDirection: 'column' }}>
                            {renderCompanyRevenueDonut()}
                        </div>
                        <div style={{ flex: 1, minWidth: '350px', display: 'flex', flexDirection: 'column' }}>
                            {renderContractsBarChart()}
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '1.5rem', width: '100%', flexWrap: 'wrap', alignItems: 'stretch' }}>
                        <div style={{ flex: 1, minWidth: '350px', display: 'flex', flexDirection: 'column' }}>
                            {renderCompanyGrossMargin()}
                        </div>
                        <div style={{ flex: 1, minWidth: '350px', display: 'flex', flexDirection: 'column' }}>
                            {renderCompanyContributionMargin()}
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '1.5rem', width: '100%', alignItems: 'stretch' }}>
                        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column' }}>
                            {renderContractsMarginPercentChart()}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'graficos' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem', width: '100%' }}>

                    {/* KPI Summary Cards */}
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '0.75rem', width: '100%' }}>
                        {/* Card 1: Receita Bruta */}
                        <div className="glass-card" style={{ flex: 1, minWidth: 0, padding: '1rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {(() => {
                                let totalB = 0, totalR = 0;
                                const hasRealizedMonths = startMonth <= currentMonthIdx;
                                precomputedDreTotals.forEach((m, idx) => { 
                                    if (idx >= startMonth && idx <= endMonth) {
                                        if (hasRealizedMonths) {
                                            if (idx <= currentMonthIdx) {
                                                totalB += m.vRev.b; 
                                                totalR += m.vRev.r; 
                                            }
                                        } else {
                                            totalB += m.vRev.b; 
                                            totalR += 0; 
                                        }
                                    }
                                });

                                const getAtingidoData = (realized: number, budgeted: number) => {
                                    let pct = 0;
                                    if (budgeted > 0) {
                                        pct = (realized / budgeted) * 100;
                                    } else if (budgeted < 0) {
                                        pct = (1 + (budgeted - realized) / budgeted) * 100;
                                    } else {
                                        pct = realized > 0 ? 100 : 0;
                                    }
                                    let color = '#dc2626';
                                    if (pct >= 100) {
                                        color = '#16a34a';
                                    } else if (pct >= 80) {
                                        color = '#d97706';
                                    }
                                    return { pct, color };
                                };

                                const { pct, color: pctColor } = getAtingidoData(totalR, totalB);

                                return (
                                    <>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Receita Bruta Total">Receita Bruta Total</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatCurrency(totalR)}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                Meta Orçada: <span style={{ fontWeight: 600 }}>{formatCurrency(totalB)}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', marginLeft: '0.4rem' }}>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: pctColor }}>{pct.toFixed(1)}%</div>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Atingido</div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                        {/* Card: Margem Bruta */}
                        <div className="glass-card" style={{ flex: 1, minWidth: 0, padding: '1rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {(() => {
                                let totalB = 0, totalR = 0;
                                const hasRealizedMonths = startMonth <= currentMonthIdx;
                                precomputedDreTotals.forEach((m, idx) => { 
                                    if (idx >= startMonth && idx <= endMonth) {
                                        if (hasRealizedMonths) {
                                            if (idx <= currentMonthIdx) {
                                                totalB += m.vGrossMarg.b; 
                                                totalR += m.vGrossMarg.r; 
                                            }
                                        } else {
                                            totalB += m.vGrossMarg.b; 
                                            totalR += 0; 
                                        }
                                    }
                                });

                                const getAtingidoData = (realized: number, budgeted: number) => {
                                    let pct = 0;
                                    if (budgeted > 0) {
                                        pct = (realized / budgeted) * 100;
                                    } else if (budgeted < 0) {
                                        pct = (1 + (budgeted - realized) / budgeted) * 100;
                                    } else {
                                        pct = realized > 0 ? 100 : 0;
                                    }
                                    let color = '#dc2626';
                                    if (pct >= 100) {
                                        color = '#16a34a';
                                    } else if (pct >= 80) {
                                        color = '#d97706';
                                    }
                                    return { pct, color };
                                };

                                const { pct, color: pctColor } = getAtingidoData(totalR, totalB);
                                const isPositive = totalR >= 0;

                                return (
                                    <>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Margem Bruta (MB)">Margem Bruta (MB)</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isPositive ? '#0f172a' : '#dc2626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatCurrency(totalR)}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                Meta Orçada: <span style={{ fontWeight: 600 }}>{formatCurrency(totalB)}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', marginLeft: '0.4rem' }}>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: pctColor }}>{pct.toFixed(1)}%</div>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Atingido</div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                        {/* Card 2: EBITDA */}
                        <div className="glass-card" style={{ flex: 1, minWidth: 0, padding: '1rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {(() => {
                                let totalB = 0, totalR = 0;
                                const hasRealizedMonths = startMonth <= currentMonthIdx;
                                precomputedDreTotals.forEach((m, idx) => { 
                                    if (idx >= startMonth && idx <= endMonth) {
                                        if (hasRealizedMonths) {
                                            if (idx <= currentMonthIdx) {
                                                totalB += m.vEbitda.b; 
                                                totalR += m.vEbitda.r; 
                                            }
                                        } else {
                                            totalB += m.vEbitda.b; 
                                            totalR += 0; 
                                        }
                                    }
                                });

                                const getAtingidoData = (realized: number, budgeted: number) => {
                                    let pct = 0;
                                    if (budgeted > 0) {
                                        pct = (realized / budgeted) * 100;
                                    } else if (budgeted < 0) {
                                        pct = (1 + (budgeted - realized) / budgeted) * 100;
                                    } else {
                                        pct = realized > 0 ? 100 : 0;
                                    }
                                    let color = '#dc2626';
                                    if (pct >= 100) {
                                        color = '#16a34a';
                                    } else if (pct >= 80) {
                                        color = '#d97706';
                                    }
                                    return { pct, color };
                                };

                                const { pct, color: pctColor } = getAtingidoData(totalR, totalB);
                                const isPositive = totalR >= 0;

                                return (
                                    <>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="EBITDA Acumulado">EBITDA Acumulado</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isPositive ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatCurrency(totalR)}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                Meta Orçada: <span style={{ fontWeight: 600 }}>{formatCurrency(totalB)}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', marginLeft: '0.4rem' }}>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: pctColor }}>{pct.toFixed(1)}%</div>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Atingido</div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                        {/* Card 3: Lucro Líquido */}
                        <div className="glass-card" style={{ flex: 1, minWidth: 0, padding: '1rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {(() => {
                                let totalB = 0, totalR = 0;
                                const hasRealizedMonths = startMonth <= currentMonthIdx;
                                precomputedDreTotals.forEach((m, idx) => { 
                                    if (idx >= startMonth && idx <= endMonth) {
                                        if (hasRealizedMonths) {
                                            if (idx <= currentMonthIdx) {
                                                totalB += m.vNetProfit.b; 
                                                totalR += m.vNetProfit.r; 
                                            }
                                        } else {
                                            totalB += m.vNetProfit.b; 
                                            totalR += 0; 
                                        }
                                    }
                                });

                                const getAtingidoData = (realized: number, budgeted: number) => {
                                    let pct = 0;
                                    if (budgeted > 0) {
                                        pct = (realized / budgeted) * 100;
                                    } else if (budgeted < 0) {
                                        pct = (1 + (budgeted - realized) / budgeted) * 100;
                                    } else {
                                        pct = realized > 0 ? 100 : 0;
                                    }
                                    let color = '#dc2626';
                                    if (pct >= 100) {
                                        color = '#16a34a';
                                    } else if (pct >= 80) {
                                        color = '#d97706';
                                    }
                                    return { pct, color };
                                };

                                const { pct, color: pctColor } = getAtingidoData(totalR, totalB);
                                const isPositive = totalR >= 0;

                                return (
                                    <>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Lucro Líquido Total">Lucro Líquido Total</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isPositive ? '#1d4ed8' : '#dc2626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatCurrency(totalR)}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                Meta Orçada: <span style={{ fontWeight: 600 }}>{formatCurrency(totalB)}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', marginLeft: '0.4rem' }}>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: pctColor }}>{pct.toFixed(1)}%</div>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Atingido</div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Seção de Velocímetros (Faturamento, Tributos, Custos e EBITDA) em Bloco Único */}
                    <div className="glass-card" style={{ padding: '1.25rem 1rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', flexDirection: 'row', gap: '0.75rem', width: '100%' }}>
                            {/* Card 1: Faturamento */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem', width: '100%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Projeção Anual de Faturamento">Projeção Anual de Faturamento</h3>
                                {renderRevenueGauge()}
                            </div>
                            {/* Card 2: Tributos */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem', width: '100%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Indicador de Tributos">Indicador de Tributos</h3>
                                {renderTaxesGauge()}
                            </div>
                            {/* Card: Margem Bruta */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem', width: '100%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Margem Bruta (MB)">Margem Bruta (MB)</h3>
                                {renderGrossMargGauge()}
                            </div>
                            {/* Card 3: Custos Operacionais */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem', width: '100%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Custos Operacionais">Custos Operacionais</h3>
                                {renderCostsGauge()}
                            </div>
                            {/* Card 4: EBITDA Percentual */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem', width: '100%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="EBITDA Percentual">EBITDA Percentual</h3>
                                {renderEbitdaGauge()}
                            </div>
                        </div>
                    </div>

                    {/* Chart Panels */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
                        {/* 1. Receita Bruta (Faturamento) */}
                        {renderDashboardChart(
                            'Faturamento (Receita Bruta)',
                            'vRev',
                            faturamentoViewMode,
                            setFaturamentoViewMode,
                            fatVisible,
                            setFatVisible,
                            {
                                budget: '#3b82f6',
                                budgetText: '#1e3a8a',
                                realized: '#94a3b8',
                                realizedText: '#475569',
                                rateBudget: '#3b82f6',
                                rateRealized: '#94a3b8'
                            },
                            'Faturamento',
                            false // showRateLines
                        )}

                        {/* 2. Tributos */}
                        {renderDashboardChart(
                            'Tributos',
                            'vTaxes',
                            tributosViewMode,
                            setTributosViewMode,
                            tribVisible,
                            setTribVisible,
                            {
                                budget: '#f97316',
                                budgetText: '#c2410c',
                                realized: '#94a3b8',
                                realizedText: '#475569',
                                rateBudget: '#ea580c',
                                rateRealized: '#2563eb'
                            },
                            'Alíquota',
                            true
                        )}

                        {/* 3. CSV - Custo do Serviço Vendido */}
                        {renderDashboardChart(
                            'CSV - Custo do Serviço Vendido',
                            'vCosts',
                            csvViewMode,
                            setCsvViewMode,
                            csvVisible,
                            setCsvVisible,
                            {
                                budget: '#8b5cf6',
                                budgetText: '#6d28d9',
                                realized: '#94a3b8',
                                realizedText: '#475569',
                                rateBudget: '#7c3aed',
                                rateRealized: '#4f46e5'
                            },
                            'CSV',
                            true
                        )}

                        {/* 4. MB - Margem Bruta */}
                        {renderDashboardChart(
                            'MB - Margem Bruta',
                            'vGrossMarg',
                            mbViewMode,
                            setMbViewMode,
                            mbVisible,
                            setMbVisible,
                            {
                                budget: '#10b981',
                                budgetText: '#047857',
                                realized: '#94a3b8',
                                realizedText: '#475569',
                                rateBudget: '#059669',
                                rateRealized: '#2563eb'
                            },
                            'Margem',
                            true
                        )}

                        {/* 5. Despesas Operacionais */}
                        {renderDashboardChart(
                            'Despesas Operacionais',
                            'vOpExp',
                            doViewMode,
                            setDoViewMode,
                            doVisible,
                            setDoVisible,
                            {
                                budget: '#ec4899',
                                budgetText: '#9d174d',
                                realized: '#94a3b8',
                                realizedText: '#475569',
                                rateBudget: '#db2777',
                                rateRealized: '#4f46e5'
                            },
                            'Despesa',
                            true
                        )}

                        {/* 6. MC - Margem de Contribuição */}
                        {renderDashboardChart(
                            'MC - Margem de Contribuição',
                            'vContribMarg',
                            mcViewMode,
                            setMcViewMode,
                            mcVisible,
                            setMcVisible,
                            {
                                budget: '#06b6d4',
                                budgetText: '#0891b2',
                                realized: '#94a3b8',
                                realizedText: '#475569',
                                rateBudget: '#0891b2',
                                rateRealized: '#2563eb'
                            },
                            'Margem',
                            true
                        )}

                        {/* 7. Despesas Administrativas */}
                        {renderDashboardChart(
                            'Despesas Administrativas',
                            'vAdminExp',
                            daViewMode,
                            setDaViewMode,
                            daVisible,
                            setDaVisible,
                            {
                                budget: '#f43f5e',
                                budgetText: '#9f1239',
                                realized: '#94a3b8',
                                realizedText: '#475569',
                                rateBudget: '#e11d48',
                                rateRealized: '#4f46e5'
                            },
                            'Despesa',
                            true
                        )}

                        {/* 8. EBITDA */}
                        {renderDashboardChart(
                            'EBITDA',
                            'vEbitda',
                            ebitdaViewMode,
                            setEbitdaViewMode,
                            ebitdaVisible,
                            setEbitdaVisible,
                            {
                                budget: '#14b8a6',
                                budgetText: '#0f766e',
                                realized: '#94a3b8',
                                realizedText: '#475569',
                                rateBudget: '#0d9488',
                                rateRealized: '#2563eb'
                            },
                            'Margem',
                            true
                        )}

                        {/* 9. Despesas Financeiras */}
                        {renderDashboardChart(
                            'Despesas Financeiras',
                            'vFin',
                            dfViewMode,
                            setDfViewMode,
                            dfVisible,
                            setDfVisible,
                            {
                                budget: '#eab308',
                                budgetText: '#a16207',
                                realized: '#94a3b8',
                                realizedText: '#475569',
                                rateBudget: '#ca8a04',
                                rateRealized: '#4f46e5'
                            },
                            'Despesa',
                            true
                        )}

                        {/* 10. Lucro Líquido */}
                        {renderDashboardChart(
                            'Lucro Líquido',
                            'vNetProfit',
                            resultadoViewMode,
                            setResultadoViewMode,
                            resVisible,
                            setResVisible,
                            {
                                budget: '#10b981',
                                budgetText: '#047857',
                                realized: '#1d4ed8',
                                realizedText: '#1e40af',
                                rateBudget: '#059669',
                                rateRealized: '#2563eb'
                            },
                            'Margem',
                            true
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ position: 'relative', width: '100%' }}>
                    {/* Botões de Rolagem Horizontal */}
                    {canScrollLeft && (
                        <button
                            onClick={() => scrollGrid('left')}
                            style={{
                                position: 'absolute',
                                left: '12px', // extreme left side
                                top: '250px',
                                transform: 'translateY(-50%)',
                                zIndex: 45,
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                                backdropFilter: 'blur(4px)',
                                opacity: 0.15, // almost invisible
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.85)';
                                e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)';
                                e.currentTarget.style.opacity = '0.9';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.65)';
                                e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                                e.currentTarget.style.opacity = '0.15';
                            }}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>
                    )}
                    {canScrollRight && (
                        <button
                            onClick={() => scrollGrid('right')}
                            style={{
                                position: 'absolute',
                                right: '12px',
                                top: '250px',
                                transform: 'translateY(-50%)',
                                zIndex: 45,
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                                backdropFilter: 'blur(4px)',
                                opacity: 0.15, // almost invisible
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.85)';
                                e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)';
                                e.currentTarget.style.opacity = '0.9';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.65)';
                                e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                                e.currentTarget.style.opacity = '0.15';
                            }}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                    )}

                    {/* Filtro de Período Personalizado */}
                    <div className="glass-card" style={{ 
                        padding: '0.85rem 1.25rem', 
                        background: '#ffffff', 
                        borderRadius: '12px', 
                        border: '1px solid #e2e8f0', 
                        boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: '1.25rem',
                        flexWrap: 'wrap',
                        width: '100%',
                        marginBottom: '1rem',
                        marginTop: '0.5rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Período de Análise:
                            </span>
                            <select
                                value={selectedPeriodOption}
                                onChange={(e) => handlePeriodOptionChange(e.target.value)}
                                style={{
                                    padding: '0.4rem 0.75rem',
                                    fontSize: '0.8rem',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#0f172a',
                                    fontWeight: 700,
                                    outline: 'none',
                                    cursor: 'pointer',
                                    transition: 'border-color 0.2s'
                                }}
                            >
                                <option value="mes_atual">Mês Atual (Junho)</option>
                                <option value="1_tri">1º Trimestre (Jan-Mar)</option>
                                <option value="2_tri">2º Trimestre (Abr-Jun)</option>
                                <option value="3_tri">3º Trimestre (Jul-Set)</option>
                                <option value="4_tri">4º Trimestre (Out-Dez)</option>
                                <option value="1_semestre">1º Semestre (Jan-Jun)</option>
                                <option value="2_semestre">2º Semestre (Jul-Dez)</option>
                                <option value="ano_todo">Ano Todo (Jan-Dez)</option>
                                <option value="personalizado">Personalizado</option>
                            </select>
                        </div>

                        {selectedPeriodOption === 'personalizado' && (
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '1rem',
                                background: '#f8fafc',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>De:</span>
                                    <select 
                                        value={startMonth} 
                                        onChange={(e) => handleStartMonthChange(Number(e.target.value))}
                                        style={{ 
                                            padding: '0.25rem 0.5rem', 
                                            fontSize: '0.75rem', 
                                            borderRadius: '6px', 
                                            border: '1px solid #cbd5e1', 
                                            background: '#ffffff', 
                                            color: '#0f172a', 
                                            fontWeight: 600,
                                            outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, idx) => (
                                            <option key={idx} value={idx}>{m}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Até:</span>
                                    <select 
                                        value={endMonth} 
                                        onChange={(e) => handleEndMonthChange(Number(e.target.value))}
                                        style={{ 
                                            padding: '0.25rem 0.5rem', 
                                            fontSize: '0.75rem', 
                                            borderRadius: '6px', 
                                            border: '1px solid #cbd5e1', 
                                            background: '#ffffff', 
                                            color: '#0f172a', 
                                            fontWeight: 600,
                                            outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, idx) => (
                                            <option key={idx} value={idx}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                    {(loading || isExternalLoading) && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255, 255, 255, 0.4)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(1px)' }}>
                            <div className="spinner" />
                            <span style={{ marginTop: '0.5rem', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.75rem' }}>CARREGANDO...</span>
                        </div>
                    )}

                    {/* Container do Cabeçalho Sticky no Topo da Tela */}
                    <div 
                        ref={headerScrollRef}
                        style={{ 
                            overflowX: 'hidden', 
                            position: 'sticky', 
                            top: 0, 
                            zIndex: 40, 
                            background: '#e6f2fd', 
                            width: '100%',
                            borderBottom: '2px solid var(--border-strong)'
                        }}
                    >
                        <table 
                            className="spreadsheet-table" 
                            style={{ 
                                width: 'max-content', 
                                tableLayout: 'fixed', 
                                borderCollapse: 'collapse'
                            }}
                        >
                        <thead>
                            <tr>
                                <th className="sticky-col" style={{ width: '400px', minWidth: '400px', maxWidth: '400px', backgroundColor: '#e6f2fd', color: '#0b579f' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0 0.5rem' }}>
                                        <button
                                            onClick={handleToggleAll}
                                            className="spreadsheet-btn-expand"
                                            style={{ background: '#fff', border: '1px solid #a5d0f5', color: '#0b579f', fontSize: '0.9rem' }}
                                        >
                                            {isAnyExpanded ? '−' : '+'}
                                        </button>
                                        <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>ESTRUTURA DRE — {selectedYear}</span>
                                    </div>
                                </th>
                                {(viewPeriod === 'month' ? MONTHS : ['1º Tri', '2º Tri', '3º Tri', '4º Tri']).map((c, i) => {
                                    const colsPerMonth = 2 + (showAV ? 2 : 0) + (showAH ? 1 : 0) + (showAH_MoM ? 1 : 0);
                                    const isHighlighted = viewPeriod === 'month' && i === highlightedMonth;
                                    return (
                                        <th 
                                            key={i} 
                                            colSpan={colsPerMonth} 
                                            style={{ 
                                                textAlign: 'center', 
                                                padding: '0.4rem', 
                                                borderLeft: '2px solid #cbd5e1', 
                                                fontSize: '0.8rem',
                                                backgroundColor: isHighlighted ? '#bae6fd' : '#e6f2fd',
                                                color: '#0b579f',
                                                fontWeight: 900
                                            }}
                                        >
                                            {c}
                                        </th>
                                    );
                                })}
                            </tr>
                            <tr>
                                <th className="sticky-col" style={{ width: '400px', minWidth: '400px', maxWidth: '400px', backgroundColor: '#e6f2fd' }}></th>
                                {(viewPeriod === 'month' ? MONTHS : [1, 2, 3, 4]).map((_, i) => {
                                    const isHighlighted = viewPeriod === 'month' && i === highlightedMonth;
                                    const highlightBgOrç = isHighlighted ? '#0b579f' : '#e6f2fd';
                                    const highlightTextOrç = isHighlighted ? '#ffffff' : '#0b579f';
                                    const highlightBgReal = isHighlighted ? '#bae6fd' : '#e6f2fd';
                                    const highlightTextReal = isHighlighted ? '#0b579f' : '#0b579f';
                                    const highlightBgOther = isHighlighted ? '#e0f2fe' : '#e6f2fd';
                                    const highlightTextOther = isHighlighted ? '#0b579f' : '#64748b';
                                    return (
                                        <React.Fragment key={i}>
                                            <th style={{ fontSize: '0.72rem', color: highlightTextOrç, borderLeft: '2px solid #cbd5e1', textAlign: 'center', padding: '0.2rem', width: '130px', minWidth: '130px', maxWidth: '130px', backgroundColor: highlightBgOrç }}>ORÇ</th>
                                            {showAV && <th style={{ fontSize: '0.68rem', color: highlightTextOther, textAlign: 'center', padding: '0.2rem', width: '60px', minWidth: '60px', maxWidth: '60px', backgroundColor: highlightBgOther }}>AV OR</th>}
                                            <th style={{ fontSize: '0.72rem', color: highlightTextReal, textAlign: 'center', padding: '0.2rem', width: '140px', minWidth: '140px', maxWidth: '140px', backgroundColor: highlightBgReal }}>REAL</th>
                                            {showAV && <th style={{ fontSize: '0.68rem', color: highlightTextOther, textAlign: 'center', padding: '0.2rem', width: '60px', minWidth: '60px', maxWidth: '60px', backgroundColor: highlightBgOther }}>AV RL</th>}
                                            {showAH && <th style={{ fontSize: '0.68rem', color: highlightTextOther, textAlign: 'center', padding: '0.2rem', width: '70px', minWidth: '70px', maxWidth: '70px', backgroundColor: highlightBgOther }}>AH %</th>}
                                            {showAH_MoM && (
                                                <th style={{ fontSize: '0.68rem', color: highlightTextOther, textAlign: 'center', padding: '0.2rem', width: '70px', minWidth: '70px', maxWidth: '70px', backgroundColor: highlightBgOther }}>
                                                    {viewPeriod === 'month' ? 'MoM' : 'QoQ'}
                                                </th>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tr>
                        </thead>
                    </table>
                </div> {/* fecha a div headerScrollRef */}

                {/* Container do Corpo com Scroll Horizontal Independente */}
                <div 
                    ref={bodyScrollRef}
                    onScroll={handleScrollSync}
                    className="spreadsheet-container" 
                    style={{ 
                        minHeight: '300px', 
                        overflowX: 'auto', 
                        position: 'relative',
                        width: '100%'
                    }}
                >
                    <div style={{ width: 'max-content', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                        
                        {/* Card 1: Receitas */}
                        <div style={{
                            background: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                            overflow: 'visible',
                            width: '100%'
                        }}>
                            <table className="spreadsheet-table" style={{ width: 'max-content', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {renderGroupHeaderRow('RECEITAS', isReceitasExpanded, () => setIsReceitasExpanded(!isReceitasExpanded))}
                                    {isReceitasExpanded && (
                                        <>
                                            {renderSummaryRow('💵 01. RECEITA BRUTA', 'vRev', true, 'rev')}
                                            {expandedGroups.has('rev') && dreStructure.buckets.rev.map(root => renderNode(root))}
                                            {renderSummaryRow('💰 02. TRIBUTO SOBRE FATURAMENTO', 'vTaxes', true, 'taxes')}
                                            {expandedGroups.has('taxes') && dreStructure.buckets.taxes.map(root => renderNode(root))}
                                            {renderSummaryRow('(=) RECEITA LÍQUIDA', 'vRecLiq', true)}
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Card 2: Custos e Despesas */}
                        <div style={{
                            background: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                            overflow: 'visible',
                            width: '100%'
                        }}>
                            <table className="spreadsheet-table" style={{ width: 'max-content', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {renderGroupHeaderRow('CUSTOS E DESPESAS', isCustosExpanded, () => setIsCustosExpanded(!isCustosExpanded))}
                                    {isCustosExpanded && (
                                        <>
                                            {renderSummaryRow('🗓️ 03. CUSTOS OPERACIONAIS', 'vCosts', true, 'costs')}
                                            {expandedGroups.has('costs') && dreStructure.buckets.costs.map(root => renderNode(root))}
                                            {renderSummaryRow('(=) MARGEM BRUTA', 'vGrossMarg', true)}
                                            {renderSummaryRow('04. DESPESAS OPERACIONAIS', 'vOpExp', true, 'opExp')}
                                            {expandedGroups.has('opExp') && dreStructure.buckets.opExp.map(root => renderNode(root))}
                                            {renderSummaryRow('(=) MARGEM DE CONTRIBUIÇÃO', 'vContribMarg', true)}
                                            {renderSummaryRow('📂 05. DESPESAS ADMINISTRATIVAS', 'vAdminExp', true, 'adminExp')}
                                            {expandedGroups.has('adminExp') && dreStructure.buckets.adminExp.map(root => renderNode(root))}
                                            {renderSummaryRow('(=) EBITDA', 'vEbitda', true)}
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Card 3: Resultado Financeiro */}
                        <div style={{
                            background: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                            overflow: 'visible',
                            width: '100%'
                        }}>
                            <table className="spreadsheet-table" style={{ width: 'max-content', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {renderGroupHeaderRow('RESULTADO FINANCEIRO', isResultadosExpanded, () => setIsResultadosExpanded(!isResultadosExpanded))}
                                    {isResultadosExpanded && (
                                        <>
                                            {renderSummaryRow('📉 06. DESPESAS FINANCEIRAS', 'vFin', true, 'fin')}
                                            {expandedGroups.has('fin') && dreStructure.buckets.fin.map(root => renderNode(root))}
                                            {renderSummaryRow('(=) LUCRO LÍQUIDO', 'vNetProfit', true)}
                                            {renderSummaryRow('07. Investimentos', 'vInvest', true, 'invest')}
                                            {expandedGroups.has('invest') && dreStructure.buckets.invest.map(root => renderNode(root))}
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>

                    </div>
                </div>
            </div>
            )}
            {/* Budget Drill-Down Modal — 3-Step */}
                {budgetDrillModal && (() => {
                    const { entries, loading, categoryName, month, drillStep, drillCompany, drillCC } = budgetDrillModal;

                    // Group entries by company
                    const byCompany: Record<string, { name: string, total: number, entries: any[] }> = {};
                    entries.forEach((e: any) => {
                        if (!byCompany[e.tenantId]) {
                            const comp = companies.find(c => c.id === e.tenantId);
                            byCompany[e.tenantId] = { name: comp?.name || e.tenantId, total: 0, entries: [] };
                        }
                        byCompany[e.tenantId].total += e.amount || 0;
                        byCompany[e.tenantId].entries.push(e);
                    });

                    // Group entries by CC for selected company
                    const companyEntries = drillCompany ? (byCompany[drillCompany]?.entries || []) : [];
                    const byCC: Record<string, { name: string, total: number, entries: any[] }> = {};
                    companyEntries.forEach((e: any) => {
                        const key = e.costCenterId || '__null__';
                        if (!byCC[key]) {
                            // Support both raw UUID and tenant:UUID in lookup (v66.8 fix)
                            const cc = costCenters.find(c => c.id === e.costCenterId || (c.id && c.id.includes(':' + e.costCenterId)));
                            byCC[key] = { name: cc?.name || (e.costCenterId ? e.costCenterId : 'Geral'), total: 0, entries: [] };
                        }
                        byCC[key].total += e.amount || 0;
                        byCC[key].entries.push(e);
                    });

                    // Detail entries for selected CC
                    const ccKey = drillCC || '__null__';
                    const detailEntries = drillCC !== null ? (byCC[ccKey]?.entries || []) : [];

                    const stepLabel = drillStep === 'company' ? 'Empresas' : drillStep === 'costcenter' ? byCompany[drillCompany!]?.name : (byCC[ccKey]?.name || 'Detalhe');

                    return (
                        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setBudgetDrillModal(null)}>
                            <div className="modal-content" style={{ maxWidth: '650px', backgroundColor: '#fff' }} onClick={e => e.stopPropagation()}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#1e293b' }}>📊 Orçado — {categoryName}</h3>
                                        <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.2rem' }}>{MONTHS[month]} / {selectedYear}</div>
                                        {/* Breadcrumb */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.78rem', color: '#94a3b8' }}>
                                            <span style={{ color: drillStep === 'company' ? '#2563eb' : '#94a3b8', fontWeight: drillStep === 'company' ? 700 : 400, cursor: drillStep !== 'company' ? 'pointer' : 'default' }} onClick={() => drillStep !== 'company' && setBudgetDrillModal(p => p ? { ...p, drillStep: 'company', drillCompany: null, drillCC: null } : null)}>Empresas</span>
                                            {drillStep !== 'company' && <><span>›</span><span style={{ color: drillStep === 'costcenter' ? '#2563eb' : '#94a3b8', fontWeight: drillStep === 'costcenter' ? 700 : 400, cursor: drillStep === 'detail' ? 'pointer' : 'default' }} onClick={() => drillStep === 'detail' && setBudgetDrillModal(p => p ? { ...p, drillStep: 'costcenter', drillCC: null } : null)}>{byCompany[drillCompany!]?.name}</span></>}
                                            {drillStep === 'detail' && <><span>›</span><span style={{ color: '#2563eb', fontWeight: 700 }}>{byCC[ccKey]?.name || 'Detalhe'}</span></>}
                                        </div>
                                    </div>
                                    <button onClick={() => setBudgetDrillModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>×</button>
                                </div>

                                {loading ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Carregando...</div>
                                ) : entries.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.9rem' }}>Nenhum orçamento lançado para esta categoria neste mês.</div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {drillStep === 'company' && Object.entries(byCompany).map(([tid, data], idx) => (
                                                <tr key={tid} onClick={() => setBudgetDrillModal(p => p ? { ...p, drillStep: 'costcenter', drillCompany: tid } : null)} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')} onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}>
                                                    <td style={{ padding: '0.65rem 0.75rem', color: '#2563eb', fontWeight: 600 }}>{data.name} ›</td>
                                                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#1e293b', fontWeight: 600 }}>{formatCurrency(data.total)}</td>
                                                </tr>
                                            ))}
                                            {drillStep === 'costcenter' && Object.entries(byCC).map(([key, data], idx) => (
                                                <tr key={key} onClick={() => setBudgetDrillModal(p => p ? { ...p, drillStep: 'detail', drillCC: key === '__null__' ? null : key } : null)} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')} onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}>
                                                    <td style={{ padding: '0.65rem 0.75rem', color: '#2563eb', fontWeight: 600 }}>{data.name} ›</td>
                                                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#1e293b', fontWeight: 600 }}>{formatCurrency(data.total)}</td>
                                                </tr>
                                            ))}
                                            {detailEntries.map((e: any, iVal: number) => {
                                                const compItem = companies.find(c => c.id === e.tenantId);
                                                const ccItem = costCenters.find(c => c.id === e.costCenterId || (c.id && c.id.includes(':' + e.costCenterId)) || (e.costCenterId && e.costCenterId.includes(':' + c.id)));
                                                const hasComps = e.compositionItems && e.compositionItems.length > 0;
                                                return (
                                                    <React.Fragment key={iVal}>
                                                        <tr style={{ borderBottom: hasComps ? 'none' : '1px solid #f1f5f9', background: iVal % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                            <td style={{ padding: '0.65rem 0.75rem', color: '#334155' }}>{compItem?.name || e.tenantId}</td>
                                                            <td style={{ padding: '0.65rem 0.75rem', color: '#64748b' }}>{ccItem?.name || (e.costCenterId ? e.costCenterId : 'Geral')}</td>
                                                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#1e293b', fontWeight: 600 }}>{formatCurrency(e.amount)}</td>
                                                        </tr>
                                                        {hasComps && e.compositionItems.map((comp: any, cIdx: number) => (
                                                            <tr key={`comp-${iVal}-${cIdx}`} style={{ borderBottom: cIdx === e.compositionItems.length - 1 ? '1px solid #f1f5f9' : 'none', background: iVal % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                                <td colSpan={2} style={{ padding: '0.4rem 0.75rem 0.4rem 2.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                                                                    <span style={{ color: '#cbd5e1', marginRight: '0.5rem' }}>└</span> 
                                                                    {comp.description || 'Sem Descrição'}
                                                                </td>
                                                                <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', color: '#475569', fontSize: '0.8rem' }}>
                                                                    {formatCurrency(comp.amount)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: '#f0f9ff', fontWeight: 700 }}>
                                                <td colSpan={drillStep === 'detail' ? 2 : 1} style={{ padding: '0.65rem 0.75rem', color: '#0369a1', borderTop: '2px solid #bae6fd' }}>Total</td>
                                                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#0369a1', borderTop: '2px solid #bae6fd' }}>
                                                    {drillStep === 'company' && formatCurrency(Object.values(byCompany).reduce((s, d) => s + d.total, 0))}
                                                    {drillStep === 'costcenter' && formatCurrency(Object.values(byCC).reduce((s, d) => s + d.total, 0))}
                                                    {drillStep === 'detail' && formatCurrency(detailEntries.reduce((s: number, e: any) => s + (e.amount || 0), 0))}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                                {/* Observation display for detail step */}
                                {drillStep === 'detail' && detailEntries.some((e: any) => e.observation) && (
                                    <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', marginBottom: '0.35rem' }}>📝 Observação / Justificativa</div>
                                        {detailEntries.filter((e: any) => e.observation).map((e: any, idx: number) => (
                                            <p key={idx} style={{ margin: 0, fontSize: '0.85rem', color: '#78350f', lineHeight: '1.5' }}>{e.observation}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
                {isTransferModalOpen && (
                    <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(8px)' }}>
                        <div className="glass-card" style={{ maxWidth: '500px', width: '90%', padding: '2rem', borderRadius: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span>💸</span> Transferência Gerencial de Custos
                                </h3>
                                <button 
                                    onClick={() => setIsTransferModalOpen(false)} 
                                    style={{ border: 'none', background: 'var(--bg-base)', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-secondary)', padding: '0.4rem 0.6rem', borderRadius: '8px', transition: 'all 0.2s' }}
                                >✕</button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Empresa Origem (Saída)</label>
                                    <select
                                        value={transferSourceTenantId}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setTransferSourceTenantId(val);
                                            if (val === transferTargetTenantId) {
                                                const other = companies.find(c => c.id !== val)?.id || '';
                                                setTransferTargetTenantId(other);
                                            }
                                        }}
                                        style={{ width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
                                    >
                                        {companies.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Empresa Destino (Entrada)</label>
                                    <select
                                        value={transferTargetTenantId}
                                        onChange={(e) => setTransferTargetTenantId(e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
                                    >
                                        {companies.filter(c => c.id !== transferSourceTenantId).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Mês</label>
                                        <select
                                            value={transferMonth}
                                            onChange={(e) => setTransferMonth(Number(e.target.value))}
                                            style={{ width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
                                        >
                                            {MONTHS.map((m, idx) => (
                                                <option key={idx} value={idx + 1}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Ano</label>
                                        <select
                                            value={transferYear}
                                            onChange={(e) => setTransferYear(Number(e.target.value))}
                                            style={{ width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }}
                                        >
                                            {[2025, 2026, 2027].map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Valor (R$)</label>
                                    <input
                                        type="text"
                                        placeholder="0,00"
                                        value={transferAmount}
                                        onChange={(e) => {
                                            let v = e.target.value.replace(/\D/g, '');
                                            if (v) {
                                                const numeric = parseFloat(v) / 100;
                                                setTransferAmount(numeric.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                            } else {
                                                setTransferAmount('');
                                            }
                                        }}
                                        style={{ width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none', fontWeight: 700 }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Justificativa / Motivo</label>
                                    <textarea
                                        placeholder="Explique o motivo deste rateio ou transferência gerencial..."
                                        value={transferReason}
                                        onChange={(e) => setTransferReason(e.target.value)}
                                        style={{ width: '100%', height: '80px', padding: '0.6rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                                    <button
                                        onClick={() => setIsTransferModalOpen(false)}
                                        style={{ flex: 1, padding: '0.65rem', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, transition: 'all 0.2s' }}
                                    >Cancelar</button>
                                    
                                    <button
                                        onClick={handleConfirmTransfer}
                                        disabled={isTransferring || !transferAmount || !transferReason.trim()}
                                        style={{ 
                                            flex: 1, 
                                            padding: '0.65rem', 
                                            fontSize: '0.8rem', 
                                            borderRadius: '8px', 
                                            border: 'none', 
                                            background: (isTransferring || !transferAmount || !transferReason.trim()) ? 'var(--border-default)' : 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', 
                                            color: '#ffffff', 
                                            cursor: (isTransferring || !transferAmount || !transferReason.trim()) ? 'not-allowed' : 'pointer', 
                                            fontWeight: 700, 
                                            transition: 'all 0.2s',
                                            boxShadow: (isTransferring || !transferAmount || !transferReason.trim()) ? 'none' : '0 2px 4px rgba(79, 70, 229, 0.2)'
                                        }}
                                    >
                                        {isTransferring ? 'Processando...' : 'Confirmar Transferência'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {selectedCell && (
                    <div 
                        className="modern-overlay" 
                        style={{ 
                            zIndex: 1100, 
                            position: 'fixed', 
                            top: 0, 
                            left: 0, 
                            right: 0, 
                            bottom: 0, 
                            backgroundColor: 'rgba(9, 9, 11, 0.45)', 
                            backdropFilter: 'blur(12px)', 
                            display: 'flex', 
                            justifyContent: 'center', 
                            alignItems: 'center', 
                            padding: '1.5rem' 
                        }}
                        onClick={closeModal}
                    >
                        <div 
                            className="modern-content" 
                            style={{ 
                                maxWidth: '650px', 
                                width: '100%', 
                                maxHeight: '82vh', 
                                height: 'auto', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                backgroundColor: '#ffffff', 
                                borderRadius: '24px', 
                                boxShadow: '0 25px 50px -12px rgba(9, 9, 11, 0.15), 0 0 0 1px rgba(9, 9, 11, 0.04)', 
                                padding: '1.75rem', 
                                overflow: 'hidden',
                                border: '1px solid rgba(15, 23, 42, 0.06)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <style>{`
                                @keyframes modalFadeIn {
                                    from { opacity: 0; }
                                    to { opacity: 1; }
                                }
                                @keyframes modalScaleIn {
                                    from { transform: scale(0.96); opacity: 0; }
                                    to { transform: scale(1); opacity: 1; }
                                }
                                .modern-overlay {
                                    animation: modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                                }
                                .modern-content {
                                    animation: modalScaleIn 0.28s cubic-bezier(0.34, 1.25, 0.64, 1) forwards;
                                }
                                .interactive-item {
                                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                                }
                                .interactive-item:hover {
                                    background-color: #f8fafc !important;
                                    border-color: rgba(79, 70, 229, 0.12) !important;
                                    transform: translateX(4px);
                                    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);
                                }
                                .interactive-item:active {
                                    transform: translateX(1px);
                                }
                                .interactive-item:hover .item-icon-bg {
                                    background-color: rgba(79, 70, 229, 0.12) !important;
                                    transform: scale(1.03);
                                }
                                .interactive-item:hover .item-arrow {
                                    transform: translateX(3px);
                                    stroke: #4f46e5 !important;
                                }
                                .close-btn {
                                    transition: all 0.25s ease;
                                }
                                .close-btn:hover {
                                    transform: rotate(90deg) scale(1.05);
                                    background-color: #f1f5f9 !important;
                                    color: #0f172a !important;
                                }
                                .breadcrumb-pill {
                                    transition: all 0.2s ease;
                                }
                                .breadcrumb-pill:hover:not(.active) {
                                    background-color: rgba(15, 23, 42, 0.04) !important;
                                    color: #0f172a !important;
                                }
                                /* Custom Scrollbar */
                                .custom-scroll::-webkit-scrollbar {
                                    width: 6px;
                                }
                                .custom-scroll::-webkit-scrollbar-track {
                                    background: transparent;
                                }
                                .custom-scroll::-webkit-scrollbar-thumb {
                                    background: #e2e8f0;
                                    border-radius: 9999px;
                                }
                                .custom-scroll::-webkit-scrollbar-thumb:hover {
                                    background: #cbd5e1;
                                }
                            `}</style>

                            {/* Header */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid rgba(15, 23, 42, 0.06)', paddingBottom: '1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.08)', padding: '3px 8px', borderRadius: '6px' }}>
                                                Lançamentos Realizados
                                            </span>
                                        </div>
                                        <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                                            {selectedCell.categoryName}
                                        </h3>
                                    </div>
                                    <button 
                                        onClick={closeModal} 
                                        className="close-btn"
                                        style={{ 
                                            border: 'none', 
                                            background: '#f8fafc', 
                                            cursor: 'pointer', 
                                            color: '#64748b', 
                                            padding: '0', 
                                            borderRadius: '50%', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            width: '36px',
                                            height: '36px',
                                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 0 0 1px rgba(15, 23, 42, 0.04)'
                                        }} 
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94a3b8' }}>
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="16" y1="2" x2="16" y2="6"></line>
                                        <line x1="8" y1="2" x2="8" y2="6"></line>
                                        <line x1="3" y1="10" x2="21" y2="10"></line>
                                    </svg>
                                    <span>Competência:</span> 
                                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{MONTHS[selectedCell.month]} / {selectedYear}</span>
                                </div>

                                {/* Breadcrumb Navigation - Modern Pill-style without crude emojis */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '0.5rem', padding: '4px', backgroundColor: '#f8fafc', borderRadius: '14px', width: 'fit-content', border: '1px solid rgba(15, 23, 42, 0.04)' }}>
                                    <button
                                        onClick={() => setTransactionModalStep('company')}
                                        className={`breadcrumb-pill ${transactionModalStep === 'company' ? 'active' : ''}`}
                                        style={{ 
                                            background: 'none', 
                                            border: 'none', 
                                            padding: '6px 12px', 
                                            borderRadius: '10px',
                                            color: transactionModalStep === 'company' ? '#ffffff' : '#64748b', 
                                            backgroundColor: transactionModalStep === 'company' ? '#4f46e5' : 'transparent',
                                            fontWeight: 700, 
                                            fontSize: '0.72rem', 
                                            cursor: transactionModalStep === 'company' ? 'default' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            boxShadow: transactionModalStep === 'company' ? '0 4px 10px -2px rgba(79, 70, 229, 0.4)' : 'none'
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                                            <line x1="9" y1="22" x2="9" y2="16"></line>
                                            <line x1="15" y1="22" x2="15" y2="16"></line>
                                            <line x1="9" y1="16" x2="15" y2="16"></line>
                                        </svg>
                                        <span>Empresas</span>
                                    </button>

                                    {transactionModalStep !== 'company' && transactionSelectedCompany && (
                                        <>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                                <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                            <button
                                                onClick={() => setTransactionModalStep('costcenter')}
                                                className={`breadcrumb-pill ${transactionModalStep === 'costcenter' ? 'active' : ''}`}
                                                style={{ 
                                                    background: 'none', 
                                                    border: 'none', 
                                                    padding: '6px 12px', 
                                                    borderRadius: '10px',
                                                    color: transactionModalStep === 'costcenter' ? '#ffffff' : '#4f46e5', 
                                                    backgroundColor: transactionModalStep === 'costcenter' ? '#4f46e5' : 'rgba(79, 70, 229, 0.06)',
                                                    fontWeight: 700, 
                                                    fontSize: '0.72rem', 
                                                    cursor: transactionModalStep === 'costcenter' ? 'default' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    boxShadow: transactionModalStep === 'costcenter' ? '0 4px 10px -2px rgba(79, 70, 229, 0.4)' : 'none'
                                                }}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <circle cx="12" cy="12" r="2"></circle>
                                                </svg>
                                                <span style={{ maxWidth: '120px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{transactionSelectedCompany}</span>
                                            </button>
                                        </>
                                    )}

                                    {transactionModalStep === 'transactions' && transactionSelectedCostCenter && (
                                        <>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                                <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                            <span style={{ 
                                                padding: '6px 12px', 
                                                borderRadius: '10px',
                                                color: '#1e293b', 
                                                backgroundColor: 'rgba(15, 23, 42, 0.05)',
                                                fontWeight: 700, 
                                                fontSize: '0.72rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                    <polyline points="14 2 14 8 20 8"></polyline>
                                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                                    <polyline points="10 9 9 9 8 9"></polyline>
                                                </svg>
                                                <span style={{ maxWidth: '120px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{transactionSelectedCostCenter}</span>
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Content list with custom scrollbar */}
                            <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '4px', marginBottom: '1.25rem' }}>
                                {loadingTransactions ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem' }}>
                                        <div style={{ width: '36px', height: '36px', border: '3px solid #f1f5f9', borderTop: '3px solid #4f46e5', borderRadius: '50%', marginBottom: '1.25rem', animation: 'spin 1s linear infinite' }} />
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Buscando detalhamentos...</div>
                                    </div>
                                ) : transactions.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Nenhum lançamento encontrado.</div>
                                ) : (
                                    <>
                                        {transactionModalStep === 'company' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {groupedByCompany.map((group, idx) => (
                                                    <div 
                                                        key={idx}
                                                        onClick={() => { setTransactionSelectedCompany(group.name); setTransactionModalStep('costcenter'); }}
                                                        style={{ 
                                                            display: 'flex', 
                                                            justifyContent: 'space-between', 
                                                            alignItems: 'center', 
                                                            padding: '0.9rem 1.1rem', 
                                                            borderRadius: '16px', 
                                                            border: '1px solid rgba(15, 23, 42, 0.04)', 
                                                            backgroundColor: '#ffffff',
                                                            cursor: 'pointer'
                                                        }}
                                                        className="interactive-item"
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div className="item-icon-bg" style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(79, 70, 229, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                                                                    <line x1="9" y1="22" x2="9" y2="16"></line>
                                                                    <line x1="15" y1="22" x2="15" y2="16"></line>
                                                                    <line x1="9" y1="16" x2="15" y2="16"></line>
                                                                    <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M12 14h.01M12 10h.01M12 6h.01"></path>
                                                                </svg>
                                                            </div>
                                                            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>{group.name}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                                                                {group.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                            </span>
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s' }} className="item-arrow">
                                                                <polyline points="9 18 15 12 9 6"></polyline>
                                                            </svg>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {transactionModalStep === 'costcenter' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {groupedByCostCenter.map((group, idx) => (
                                                    <div 
                                                        key={idx}
                                                        onClick={() => { setTransactionSelectedCostCenter(group.name); setTransactionModalStep('transactions'); }}
                                                        style={{ 
                                                            display: 'flex', 
                                                            justifyContent: 'space-between', 
                                                            alignItems: 'center', 
                                                            padding: '0.9rem 1.1rem', 
                                                            borderRadius: '16px', 
                                                            border: '1px solid rgba(15, 23, 42, 0.04)', 
                                                            backgroundColor: '#ffffff',
                                                            cursor: 'pointer'
                                                        }}
                                                        className="interactive-item"
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div className="item-icon-bg" style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(6, 182, 212, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <circle cx="12" cy="12" r="10"></circle>
                                                                    <circle cx="12" cy="12" r="6"></circle>
                                                                    <circle cx="12" cy="12" r="2"></circle>
                                                                </svg>
                                                            </div>
                                                            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>{group.name}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                                                                {group.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
</span>
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s' }} className="item-arrow">
                                                                <polyline points="9 18 15 12 9 6"></polyline>
                                                            </svg>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {transactionModalStep === 'transactions' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {finalTransactions.map((tx: any) => {
                                                    const isReclassified = !tx.externalId?.startsWith('adj-') && !tx.externalId?.startsWith('transf-') && transactions.some((t: any) => t.externalId === `adj-neg-${tx.id}-${viewMode}`);
                                                    const isAdjustmentPos = tx.externalId?.startsWith('adj-pos-');
                                                    const isTransferOut = tx.externalId?.startsWith('transf-out-');
                                                    const isTransferIn = tx.externalId?.startsWith('transf-in-');
                                                    const isTransfer = isTransferOut || isTransferIn;
                                                    const isCurrentReclassifying = reclassifyingTx?.id === tx.id;
                                                    const negAdj = isReclassified ? transactions.find((t: any) => t.externalId === `adj-neg-${tx.id}-${viewMode}`) : null;

                                                    return (
                                                        <div key={tx.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            {/* Transação Card */}
                                                            <div 
                                                                style={{ 
                                                                    display: 'flex', 
                                                                    justifyContent: 'space-between', 
                                                                    alignItems: 'center', 
                                                                    padding: '0.9rem 1.1rem', 
                                                                    borderRadius: '16px', 
                                                                    border: '1px solid rgba(15, 23, 42, 0.03)', 
                                                                    backgroundColor: '#ffffff',
                                                                    boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.02)',
                                                                    opacity: isReclassified ? 0.75 : 1
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                                                                    {/* Data Badge premium */}
                                                                    <div style={{ 
                                                                        flexShrink: 0,
                                                                        backgroundColor: '#f1f5f9', 
                                                                        color: '#334155', 
                                                                        fontSize: '0.75rem', 
                                                                        fontWeight: 800, 
                                                                        padding: '6px 10px', 
                                                                        borderRadius: '10px',
                                                                        textAlign: 'center',
                                                                        minWidth: '85px',
                                                                        border: '1px solid rgba(15, 23, 42, 0.02)',
                                                                        fontFamily: 'Inter, sans-serif'
                                                                    }}>
                                                                        {formatDateSafe(tx.date, { timeZone: 'UTC' })}
                                                                    </div>

                                                                    {/* Descrição e Cliente */}
                                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                                        <div style={{ 
                                                                            fontWeight: 700, 
                                                                            color: '#0f172a', 
                                                                            fontSize: '0.85rem', 
                                                                            textOverflow: 'ellipsis', 
                                                                            overflow: 'hidden', 
                                                                            whiteSpace: 'nowrap',
                                                                            textDecoration: isReclassified ? 'line-through' : 'none'
                                                                        }} title={tx.description}>
                                                                            {isTransfer 
                                                                                ? (tx.description.startsWith('[Saída') ? '[Saída Transferida] Transferência Gerencial' : '[Entrada Transferida] Transferência Gerencial')
                                                                                : tx.description}
                                                                        </div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', color: '#64748b', fontSize: '0.72rem', fontWeight: 600 }}>
                                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                                                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                                                                <circle cx="12" cy="7" r="4"></circle>
                                                                            </svg>
                                                                            <span>{tx.customer || '-'}</span>
                                                                        </div>

                                                                        {/* Mensagem Histórico: Transação de Origem Estornada */}
                                                                        {isReclassified && negAdj && (() => {
                                                                            const desc = negAdj.description || '';
                                                                            const paraMatch = desc.match(/para:\s*([^|]+)/);
                                                                            const motivoMatch = desc.match(/Motivo:\s*(.+)$/);
                                                                            const paraInfo = paraMatch ? paraMatch[1].trim() : '';
                                                                            const motivoInfo = motivoMatch ? motivoMatch[1].trim() : '';
                                                                            return (
                                                                                <div style={{ 
                                                                                    fontSize: '0.7rem', 
                                                                                    color: '#4f46e5', 
                                                                                    fontWeight: 700, 
                                                                                    marginTop: '6px',
                                                                                    display: 'flex',
                                                                                    flexDirection: 'column',
                                                                                    gap: '2px',
                                                                                    backgroundColor: 'rgba(79, 70, 229, 0.04)',
                                                                                    padding: '6px 10px',
                                                                                    borderRadius: '8px',
                                                                                    border: '1px dashed rgba(79, 70, 229, 0.15)',
                                                                                    width: 'fit-content'
                                                                                }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                        <span>➡️</span>
                                                                                        <span>Reclassificado para: <strong style={{ color: '#312e81' }}>{paraInfo || 'outra conta'}</strong></span>
                                                                                    </div>
                                                                                    {motivoInfo && (
                                                                                        <div style={{ color: '#475569', fontWeight: 600, fontSize: '0.68rem', paddingLeft: '18px' }}>
                                                                                            Motivo: <span style={{ fontStyle: 'italic', color: '#1e293b' }}>"{motivoInfo}"</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })()}

                                                                        {/* Mensagem Histórico: Transação de Ajuste Positivo (Destino) */}
                                                                        {isAdjustmentPos && (() => {
                                                                            const desc = tx.description || '';
                                                                            const deMatch = desc.match(/De:\s*([^|]+)/);
                                                                            const motivoMatch = desc.match(/Motivo:\s*(.+)$/);
                                                                            const deInfo = deMatch ? deMatch[1].trim() : '';
                                                                            const motivoInfo = motivoMatch ? motivoMatch[1].trim() : '';
                                                                            return (
                                                                                <div style={{ 
                                                                                    fontSize: '0.7rem', 
                                                                                    color: '#0891b2', 
                                                                                    fontWeight: 700, 
                                                                                    marginTop: '6px',
                                                                                    display: 'flex',
                                                                                    flexDirection: 'column',
                                                                                    gap: '2px',
                                                                                    backgroundColor: 'rgba(8, 145, 178, 0.04)',
                                                                                    padding: '6px 10px',
                                                                                    borderRadius: '8px',
                                                                                    border: '1px dashed rgba(8, 145, 178, 0.15)',
                                                                                    width: 'fit-content'
                                                                                }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                        <span>⬅️</span>
                                                                                        <span>Origem gerencial: <strong style={{ color: '#164e63' }}>{deInfo || 'outra conta'}</strong></span>
                                                                                    </div>
                                                                                    {motivoInfo && (
                                                                                        <div style={{ color: '#475569', fontWeight: 600, fontSize: '0.68rem', paddingLeft: '18px' }}>
                                                                                            Motivo: <span style={{ fontStyle: 'italic', color: '#1e293b' }}>"{motivoInfo}"</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })()}

                                                                        {/* Mensagem Histórico: Transação de Transferência Gerencial */}
                                                                        {isTransfer && (() => {
                                                                            const desc = tx.description || '';
                                                                            const deMatch = desc.match(/De:\s*([^|]+)/);
                                                                            const paraMatch = desc.match(/para:\s*([^|]+)/);
                                                                            const justificativaMatch = desc.match(/Justificativa:\s*(.+)$/);
                                                                            const deInfo = deMatch ? deMatch[1].trim() : '';
                                                                            const paraInfo = paraMatch ? paraMatch[1].trim() : '';
                                                                            const justificativaInfo = justificativaMatch ? justificativaMatch[1].trim() : '';
                                                                            return (
                                                                                <div style={{ 
                                                                                    fontSize: '0.7rem', 
                                                                                    color: '#6366f1', 
                                                                                    fontWeight: 700, 
                                                                                    marginTop: '6px',
                                                                                    display: 'flex',
                                                                                    flexDirection: 'column',
                                                                                    gap: '2px',
                                                                                    backgroundColor: 'rgba(99, 102, 241, 0.04)',
                                                                                    padding: '6px 10px',
                                                                                    borderRadius: '8px',
                                                                                    border: '1px dashed rgba(99, 102, 241, 0.25)',
                                                                                    width: 'fit-content'
                                                                                }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                        <span>🔄</span>
                                                                                        <span>Remanejamento: De <strong style={{ color: '#312e81' }}>{deInfo || 'origem'}</strong> para <strong style={{ color: '#312e81' }}>{paraInfo || 'destino'}</strong></span>
                                                                                    </div>
                                                                                    {justificativaInfo && (
                                                                                        <div style={{ color: '#475569', fontWeight: 600, fontSize: '0.68rem', paddingLeft: '18px' }}>
                                                                                            Justificativa: <span style={{ fontStyle: 'italic', color: '#1e293b' }}>"{justificativaInfo}"</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                </div>

                                                                {/* Valor e Ações Gerenciais */}
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingLeft: '1rem', flexShrink: 0 }}>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                                        <div style={{ 
                                                                            fontWeight: 800, 
                                                                            color: isReclassified ? '#94a3b8' : '#0f172a', 
                                                                            fontSize: '0.9rem', 
                                                                            fontFamily: 'Inter, sans-serif',
                                                                            textDecoration: isReclassified ? 'line-through' : 'none'
                                                                        }}>
                                                                            {parseFloat(tx.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                        </div>
                                                                        {isReclassified && (
                                                                            <span style={{
                                                                                fontSize: '0.65rem',
                                                                                fontWeight: 800,
                                                                                color: '#ef4444',
                                                                                backgroundColor: '#fef2f2',
                                                                                padding: '2px 6px',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid rgba(239, 68, 68, 0.1)',
                                                                                textTransform: 'uppercase',
                                                                                letterSpacing: '0.05em'
                                                                            }}>
                                                                                Estornado
                                                                            </span>
                                                                        )}
                                                                        {isAdjustmentPos && (
                                                                            <span style={{
                                                                                fontSize: '0.65rem',
                                                                                fontWeight: 800,
                                                                                color: '#3b82f6',
                                                                                backgroundColor: '#eff6ff',
                                                                                padding: '2px 6px',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid rgba(59, 130, 246, 0.1)',
                                                                                textTransform: 'uppercase',
                                                                                letterSpacing: '0.05em'
                                                                            }}>
                                                                                Ajuste
                                                                            </span>
                                                                        )}
                                                                        {isTransfer && (
                                                                            <span style={{
                                                                                fontSize: '0.65rem',
                                                                                fontWeight: 800,
                                                                                color: '#6366f1',
                                                                                backgroundColor: '#e0e7ff',
                                                                                padding: '2px 6px',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid rgba(99, 102, 241, 0.15)',
                                                                                textTransform: 'uppercase',
                                                                                letterSpacing: '0.05em'
                                                                            }}>
                                                                                Transferência
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {/* Botões de Ação */}
                                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                                        {!tx.externalId?.startsWith('adj-') && !tx.externalId?.startsWith('transf-') && !isReclassified && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    setReclassifyingTx(tx);
                                                                                    setTargetReclassCategoryId('');
                                                                                    setTargetReclassMonth(selectedCell?.month !== undefined ? selectedCell.month + 1 : 1);
                                                                                    setTargetReclassYear(selectedYear);
                                                                                    setReclassReason('');
                                                                                    setTargetReclassTenantId(tx.tenantId || (selectedCompany.includes('DEFAULT') ? companies[0]?.id : selectedCompany[0]));
                                                                                    const initialAmount = tx.value !== undefined ? Math.abs(tx.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                                                                                    setReclassAmount(initialAmount);
                                                                                }}
                                                                                disabled={isReclassifying}
                                                                                style={{
                                                                                    padding: '6px 12px',
                                                                                    borderRadius: '8px',
                                                                                    border: '1px solid rgba(15, 23, 42, 0.08)',
                                                                                    backgroundColor: '#f8fafc',
                                                                                    color: '#334155',
                                                                                    fontSize: '0.75rem',
                                                                                    fontWeight: 700,
                                                                                    cursor: 'pointer',
                                                                                    transition: 'all 0.2s',
                                                                                    outline: 'none'
                                                                                }}
                                                                                onMouseOver={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                                                                                    e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.15)';
                                                                                }}
                                                                                onMouseOut={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = '#f8fafc';
                                                                                    e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.08)';
                                                                                }}
                                                                            >
                                                                                Reclassificar
                                                                            </button>
                                                                        )}

                                                                        {(isReclassified || isAdjustmentPos) && (
                                                                            <button
                                                                                onClick={() => handleUndoReclassify(tx)}
                                                                                disabled={isReclassifying}
                                                                                style={{
                                                                                    padding: '6px 12px',
                                                                                    borderRadius: '8px',
                                                                                    border: '1px solid rgba(239, 68, 68, 0.15)',
                                                                                    backgroundColor: '#fef2f2',
                                                                                    color: '#ef4444',
                                                                                    fontSize: '0.75rem',
                                                                                    fontWeight: 700,
                                                                                    cursor: 'pointer',
                                                                                    transition: 'all 0.2s',
                                                                                    outline: 'none'
                                                                                }}
                                                                                onMouseOver={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = '#fee2e2';
                                                                                }}
                                                                                onMouseOut={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = '#fef2f2';
                                                                                }}
                                                                            >
                                                                                Desfazer
                                                                            </button>
                                                                        )}

                                                                        {isTransfer && (
                                                                            <button
                                                                                onClick={() => handleUndoTransfer(tx)}
                                                                                disabled={isReclassifying}
                                                                                style={{
                                                                                    padding: '6px 12px',
                                                                                    borderRadius: '8px',
                                                                                    border: '1px solid rgba(239, 68, 68, 0.15)',
                                                                                    backgroundColor: '#fef2f2',
                                                                                    color: '#ef4444',
                                                                                    fontSize: '0.75rem',
                                                                                    fontWeight: 700,
                                                                                    cursor: 'pointer',
                                                                                    transition: 'all 0.2s',
                                                                                    outline: 'none'
                                                                                }}
                                                                                onMouseOver={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = '#fee2e2';
                                                                                }}
                                                                                onMouseOut={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = '#fef2f2';
                                                                                }}
                                                                            >
                                                                                Desfazer Transferência
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Painel Inline de Reclassificação */}
                                                            {isCurrentReclassifying && (
                                                                <div 
                                                                    style={{
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: '10px',
                                                                        padding: '1rem',
                                                                        borderRadius: '16px',
                                                                        backgroundColor: '#f8fafc',
                                                                        border: '1px dashed rgba(79, 70, 229, 0.3)',
                                                                        animation: 'modalFadeIn 0.2s ease-out'
                                                                    }}
                                                                >
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                                                                        Selecione a categoria e competência gerencial de destino:
                                                                    </div>
                                                                    {/* Container dos Dropdowns */}
                                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                                        
                                                                        {/* Select de Empresa */}
                                                                        <select
                                                                            value={targetReclassTenantId}
                                                                            onChange={(e) => {
                                                                                setTargetReclassTenantId(e.target.value);
                                                                                setTargetReclassCategoryId('');
                                                                            }}
                                                                            style={{
                                                                                flex: 1.5,
                                                                                minWidth: '160px',
                                                                                padding: '8px 12px',
                                                                                borderRadius: '10px',
                                                                                border: '1px solid rgba(15, 23, 42, 0.1)',
                                                                                backgroundColor: '#ffffff',
                                                                                fontSize: '0.8rem',
                                                                                fontWeight: 600,
                                                                                color: '#334155',
                                                                                outline: 'none',
                                                                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                                                            }}
                                                                        >
                                                                            {companies.map((c: any) => (
                                                                                <option key={c.id} value={c.id}>
                                                                                    {c.name}
                                                                                </option>
                                                                            ))}
                                                                        </select>

                                                                        {/* Dropdown de Categoria Customizado com Campo de Pesquisa */}
                                                                        <div style={{ position: 'relative', flex: 2, minWidth: '200px' }}>
                                                                            <div
                                                                                onClick={() => {
                                                                                    setIsReclassCategoryDropdownOpen(!isReclassCategoryDropdownOpen);
                                                                                    setReclassCategorySearch('');
                                                                                }}
                                                                                style={{
                                                                                    cursor: 'pointer',
                                                                                    display: 'flex',
                                                                                    justifyContent: 'space-between',
                                                                                    alignItems: 'center',
                                                                                    padding: '8px 12px',
                                                                                    borderRadius: '10px',
                                                                                    border: '1px solid rgba(15, 23, 42, 0.1)',
                                                                                    backgroundColor: '#ffffff',
                                                                                    fontSize: '0.8rem',
                                                                                    fontWeight: 600,
                                                                                    color: '#334155',
                                                                                    outline: 'none',
                                                                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                                                                    userSelect: 'none'
                                                                                }}
                                                                            >
                                                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                    {targetReclassCategoryId 
                                                                                        ? (categories.find((c: any) => c.id === targetReclassCategoryId)?.name || targetReclassCategoryId)
                                                                                        : '-- Escolha uma Categoria --'}
                                                                                </span>
                                                                                <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>▼</span>
                                                                            </div>

                                                                            {isReclassCategoryDropdownOpen && (
                                                                                <>
                                                                                    <div 
                                                                                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }} 
                                                                                        onClick={() => setIsReclassCategoryDropdownOpen(false)} 
                                                                                    />
                                                                                    <div 
                                                                                        className="glass-card" 
                                                                                        style={{ 
                                                                                            position: 'absolute', 
                                                                                            top: 'calc(100% + 4px)', 
                                                                                            left: 0, 
                                                                                            right: 0, 
                                                                                            zIndex: 10000, 
                                                                                            maxHeight: '260px', 
                                                                                            overflowY: 'auto', 
                                                                                            background: '#ffffff', 
                                                                                            border: '1px solid #cbd5e1',
                                                                                            borderRadius: '8px',
                                                                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                                                                                            padding: '0.25rem 0'
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>
                                                                                            <input 
                                                                                                type="text" 
                                                                                                placeholder="Comece a digitar..." 
                                                                                                value={reclassCategorySearch}
                                                                                                onChange={(e) => setReclassCategorySearch(e.target.value)}
                                                                                                onClick={(e) => e.stopPropagation()}
                                                                                                autoFocus
                                                                                                style={{ 
                                                                                                    width: '100%', 
                                                                                                    padding: '0.4rem 0.6rem', 
                                                                                                    fontSize: '0.75rem', 
                                                                                                    borderRadius: '6px', 
                                                                                                    border: '1px solid #cbd5e1', 
                                                                                                    background: '#f8fafc', 
                                                                                                    outline: 'none',
                                                                                                    boxSizing: 'border-box'
                                                                                                }}
                                                                                            />
                                                                                        </div>
                                                                                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                                                                            <div
                                                                                                onClick={() => {
                                                                                                    setTargetReclassCategoryId('');
                                                                                                    setIsReclassCategoryDropdownOpen(false);
                                                                                                }}
                                                                                                style={{ 
                                                                                                    padding: '0.5rem 0.75rem', 
                                                                                                    cursor: 'pointer', 
                                                                                                    fontSize: '0.75rem', 
                                                                                                    fontWeight: 500,
                                                                                                    color: '#64748b',
                                                                                                    background: targetReclassCategoryId === '' ? '#f1f5f9' : 'transparent'
                                                                                                }}
                                                                                                className="hover-row"
                                                                                            >
                                                                                                -- Escolha uma Categoria --
                                                                                            </div>
                                                                                            {categories
                                                                                                .filter((cat: any) => {
                                                                                                    if (cat.id === selectedCell?.categoryId) return false;
                                                                                                    const catTenantId = cat.tenantId || (cat.id.includes(':') ? cat.id.split(':')[0] : null);
                                                                                                    return !catTenantId || catTenantId === targetReclassTenantId;
                                                                                                })
                                                                                                .filter((cat: any) => {
                                                                                                    if (!reclassCategorySearch) return true;
                                                                                                    const search = reclassCategorySearch.toLowerCase();
                                                                                                    return (cat.name || '').toLowerCase().includes(search) || (cat.id || '').toLowerCase().includes(search);
                                                                                                })
                                                                                                .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
                                                                                                .map((cat: any) => (
                                                                                                    <div
                                                                                                        key={cat.id}
                                                                                                        onClick={() => {
                                                                                                            setTargetReclassCategoryId(cat.id);
                                                                                                            setIsReclassCategoryDropdownOpen(false);
                                                                                                        }}
                                                                                                        style={{ 
                                                                                                            padding: '0.5rem 0.75rem', 
                                                                                                            cursor: 'pointer', 
                                                                                                            fontSize: '0.75rem', 
                                                                                                            fontWeight: 600,
                                                                                                            color: '#1e293b',
                                                                                                            background: targetReclassCategoryId === cat.id ? '#eff6ff' : 'transparent'
                                                                                                        }}
                                                                                                        className="hover-row"
                                                                                                    >
                                                                                                        {cat.name}
                                                                                                    </div>
                                                                                                ))
                                                                                            }
                                                                                        </div>
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </div>

                                                                        {/* Select de Mês */}
                                                                        <select
                                                                            value={targetReclassMonth}
                                                                            onChange={(e) => setTargetReclassMonth(parseInt(e.target.value, 10))}
                                                                            style={{
                                                                                flex: 1,
                                                                                minWidth: '120px',
                                                                                padding: '8px 12px',
                                                                                borderRadius: '10px',
                                                                                border: '1px solid rgba(15, 23, 42, 0.1)',
                                                                                backgroundColor: '#ffffff',
                                                                                fontSize: '0.8rem',
                                                                                fontWeight: 600,
                                                                                color: '#334155',
                                                                                outline: 'none',
                                                                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                                                            }}
                                                                        >
                                                                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                                                                                const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                                                                const capitalizedMonth = monthNames[m - 1];
                                                                                return (
                                                                                    <option key={m} value={m}>
                                                                                        {capitalizedMonth}
                                                                                    </option>
                                                                                );
                                                                            })}
                                                                        </select>

                                                                        {/* Select de Ano */}
                                                                        <select
                                                                            value={targetReclassYear}
                                                                            onChange={(e) => setTargetReclassYear(parseInt(e.target.value, 10))}
                                                                            style={{
                                                                                flex: 1,
                                                                                minWidth: '85px',
                                                                                padding: '8px 12px',
                                                                                borderRadius: '10px',
                                                                                border: '1px solid rgba(15, 23, 42, 0.1)',
                                                                                backgroundColor: '#ffffff',
                                                                                fontSize: '0.8rem',
                                                                                fontWeight: 600,
                                                                                color: '#334155',
                                                                                outline: 'none',
                                                                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                                                            }}
                                                                        >
                                                                            {Array.from({ length: 4 }, (_, i) => selectedYear - 1 + i).map((y) => (
                                                                                <option key={y} value={y}>
                                                                                    {y}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
 
                                                                    {/* Campo para o Valor a Reclassificar (Parcial ou Total) */}
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', marginTop: '4px' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', padding: '0 2px' }}>
                                                                            <span>Valor a reclassificar:</span>
                                                                            <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>Total: R$ {Math.abs(tx.value !== undefined ? tx.value : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                        <input 
                                                                            type="text" 
                                                                            placeholder="Valor a reclassificar..." 
                                                                            value={reclassAmount}
                                                                            onChange={(e) => setReclassAmount(e.target.value)}
                                                                            style={{
                                                                                width: '100%',
                                                                                padding: '8px 12px',
                                                                                borderRadius: '10px',
                                                                                border: '1px solid rgba(15, 23, 42, 0.1)',
                                                                                backgroundColor: '#ffffff',
                                                                                fontSize: '0.8rem',
                                                                                fontWeight: 600,
                                                                                color: '#334155',
                                                                                outline: 'none',
                                                                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                                                                boxSizing: 'border-box'
                                                                            }}
                                                                        />
                                                                    </div>

                                                                    {/* Campo para o Motivo da Reclassificação */}
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', marginTop: '4px' }}>
                                                                        <input 
                                                                            type="text" 
                                                                            placeholder="Escreva o motivo da reclassificação (opcional)..." 
                                                                            value={reclassReason}
                                                                            onChange={(e) => setReclassReason(e.target.value)}
                                                                            style={{
                                                                                width: '100%',
                                                                                padding: '8px 12px',
                                                                                borderRadius: '10px',
                                                                                border: '1px solid rgba(15, 23, 42, 0.1)',
                                                                                backgroundColor: '#ffffff',
                                                                                fontSize: '0.8rem',
                                                                                fontWeight: 600,
                                                                                color: '#334155',
                                                                                outline: 'none',
                                                                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                                                                boxSizing: 'border-box'
                                                                            }}
                                                                        />
                                                                    </div>

                                                                    {/* Container dos Botões */}
                                                                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                                        <button
                                                                            onClick={() => handleReclassifyConfirm(tx)}
                                                                            disabled={!targetReclassCategoryId || !targetReclassMonth || !targetReclassYear || !reclassAmount || isReclassifying}
                                                                            style={{
                                                                                padding: '8px 16px',
                                                                                borderRadius: '10px',
                                                                                backgroundColor: '#4f46e5',
                                                                                color: '#ffffff',
                                                                                border: 'none',
                                                                                fontSize: '0.78rem',
                                                                                fontWeight: 700,
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.2s',
                                                                                boxShadow: '0 4px 12px -3px rgba(79, 70, 229, 0.3)'
                                                                            }}
                                                                            onMouseOver={(e) => {
                                                                                if (!e.currentTarget.disabled) {
                                                                                    e.currentTarget.style.backgroundColor = '#4338ca';
                                                                                }
                                                                            }}
                                                                            onMouseOut={(e) => {
                                                                                if (!e.currentTarget.disabled) {
                                                                                    e.currentTarget.style.backgroundColor = '#4f46e5';
                                                                                }
                                                                            }}
                                                                        >
                                                                            {isReclassifying ? 'Processando...' : 'Confirmar'}
                                                                        </button>

                                                                        <button
                                                                            onClick={() => {
                                                                                setReclassifyingTx(null);
                                                                                setTargetReclassCategoryId('');
                                                                                setTargetReclassMonth(0);
                                                                                setTargetReclassYear(2026);
                                                                                setReclassReason('');
                                                                                setTargetReclassTenantId('');
                                                                            }}
                                                                            disabled={isReclassifying}
                                                                            style={{
                                                                                padding: '8px 14px',
                                                                                borderRadius: '10px',
                                                                                backgroundColor: '#ffffff',
                                                                                color: '#64748b',
                                                                                border: '1px solid rgba(15, 23, 42, 0.08)',
                                                                                fontSize: '0.78rem',
                                                                                fontWeight: 700,
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.2s'
                                                                            }}
                                                                            onMouseOver={(e) => {
                                                                                if (!e.currentTarget.disabled) {
                                                                                    e.currentTarget.style.backgroundColor = '#f8fafc';
                                                                                    e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.15)';
                                                                                }
                                                                            }}
                                                                            onMouseOut={(e) => {
                                                                                if (!e.currentTarget.disabled) {
                                                                                    e.currentTarget.style.backgroundColor = '#ffffff';
                                                                                    e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.08)';
                                                                                }
                                                                            }}
                                                                        >
                                                                            Cancelar
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Rodapé Totalizador Premium */}
                            {!loadingTransactions && transactions.length > 0 && (
                                <div 
                                    style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        padding: '1.1rem 1.4rem', 
                                        borderRadius: '18px', 
                                        background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                                        boxShadow: '0 10px 25px -8px rgba(79, 70, 229, 0.45)',
                                        animation: 'modalFadeIn 0.3s ease-out'
                                    }}
                                >
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255, 255, 255, 0.8)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {transactionModalStep === 'company' ? 'Total Geral do Mês:' : 
                                         transactionModalStep === 'costcenter' ? 'Total na Empresa:' : 
                                         'Total no Centro de Custo:'}
                                    </span>
                                    <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffffff', fontFamily: 'Inter, monospace', letterSpacing: '-0.02em' }}>
                                        {transactionModalStep === 'company' && groupedByCompany.reduce((acc, g) => acc + g.total, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        {transactionModalStep === 'costcenter' && groupedByCostCenter.reduce((acc, g) => acc + g.total, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        {transactionModalStep === 'transactions' && finalTransactions.reduce((acc, tx) => {
                                            const isReclassified = !tx.externalId?.startsWith('adj-') && transactions.some((t: any) => t.externalId === `adj-neg-${tx.id}-${viewMode}`);
                                            return acc + (isReclassified ? 0 : (parseFloat(tx.value) || 0));
                                        }, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 2. Budget Entry Modal (Lançamento) */}
                {budgetModal && (
                    <div className="modal-overlay" style={{ zIndex: 1200 }}>
                        <div className="modal-content" style={{ maxWidth: '1000px', width: '95%', backgroundColor: '#fff', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
                            <div style={{ padding: '2rem' }}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>
                                            {budgetModal.type === 'budget' ? '🎯 Planejamento Orçamentário' : '📡 Radar'}: {budgetModal.categoryName}
                                        </h3>
                                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#64748b' }}>Configure os valores para o exercício de {selectedYear}</p>
                                    </div>
                                    <button onClick={() => setBudgetModal(null)} style={{ border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b', padding: '0.6rem', borderRadius: '12px', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor='#e2e8f0'} onMouseOut={e => e.currentTarget.style.backgroundColor='#f1f5f9'}>✕</button>
                                </div>

                                {/* Month Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem', marginBottom: '2rem', backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                                    {MONTHS.map((month, idx) => {
                                        const isLocked = lockedMonths[idx];
                                        const canEdit = !isLocked || userRole === 'MASTER';
                                        const hasItems = modalCompositionRows.some(r => r.values[idx] && r.values[idx].trim() !== '');
                                        
                                        return (
                                            <div key={idx} style={{ 
                                                display: 'flex', 
                                                flexDirection: 'column', 
                                                gap: '0.5rem',
                                                opacity: !canEdit ? 0.6 : 1,
                                                padding: '0.75rem',
                                                borderRadius: '16px',
                                                backgroundColor: activeMonth === idx ? '#fff' : 'transparent',
                                                boxShadow: activeMonth === idx ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none',
                                                border: activeMonth === idx ? '1px solid #e2e8f0' : '1px solid transparent',
                                                transition: 'all 0.2s'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: activeMonth === idx ? '#2563eb' : '#64748b', textTransform: 'uppercase' }}>{month}</label>
                                                    {isLocked && <span title="Mês bloqueado" style={{ fontSize: '0.7rem' }}>🔒</span>}
                                                </div>
                                                <div style={{ position: 'relative' }}>
                                                    <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700 }}>R$</span>
                                                    <input
                                                        type="text"
                                                        value={modalValues[idx]}
                                                        style={{ 
                                                            width: '100%', 
                                                            textAlign: 'right', 
                                                            fontWeight: 700,
                                                            fontSize: '0.95rem',
                                                            padding: '0.5rem 0.5rem 0.5rem 2rem',
                                                            border: !canEdit ? '1px dashed #cbd5e1' : (activeMonth === idx ? '1px solid #2563eb' : '1px solid #e2e8f0'),
                                                            backgroundColor: !canEdit ? '#f8fafc' : '#ffffff'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Compositions Table */}
                                <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '0.5rem', borderRadius: '10px', fontSize: '1.2rem' }}>📋</div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Sub-lançamentos Estruturais
                                                </label>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Detalhamento por item para composição do valor mensal</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setModalCompositionRows(prev => [...prev, { id: Math.random().toString(36).substring(2,9), description: '', values: new Array(12).fill('') }])}
                                            style={{ padding: '0.6rem 1.2rem', fontSize: '0.8rem', fontWeight: 700, backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)', transition: 'all 0.2s' }}
                                        >
                                            + Novo Item
                                        </button>
                                    </div>

                                    <div style={{ overflowX: 'auto', maxHeight: '30vh' }}>
                                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.5rem', minWidth: '1100px' }}>
                                            <thead>
                                                <tr style={{ textAlign: 'left' }}>
                                                    <th style={{ padding: '0.5rem 1rem', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Descrição</th>
                                                    {MONTHS.map(m => <th key={m} style={{ padding: '0.5rem', fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', fontWeight: 800 }}>{m}</th>)}
                                                    <th style={{ width: '80px' }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {modalCompositionRows.map((row, rIdx) => (
                                                    <tr key={row.id}>
                                                        <td style={{ padding: '0' }}>
                                                            <input
                                                                type="text"
                                                                value={row.description}
                                                                placeholder="ex: Verba de Marketing"
                                                                onChange={(e) => {
                                                                    const next = [...modalCompositionRows];
                                                                    next[rIdx].description = e.target.value;
                                                                    setModalCompositionRows(next);
                                                                }}
                                                                style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.85rem', border: '1px solid #f1f5f9', borderRadius: '12px', backgroundColor: '#f8fafc', fontWeight: 600 }}
                                                            />
                                                        </td>
                                                        {row.values.map((v, cIdx) => (
                                                            <td key={cIdx} style={{ padding: '0 0.25rem' }}>
                                                                <input
                                                                    type="text"
                                                                    value={v}
                                                                    placeholder="0,00"
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        const next = [...modalCompositionRows];
                                                                        next[rIdx].values[cIdx] = val;
                                                                        setModalCompositionRows(next);
                                                                        
                                                                        const sum = next.reduce((acc, r) => acc + evaluateFormula(r.values[cIdx] || '0'), 0);
                                                                        const nextTotals = [...modalValues];
                                                                        nextTotals[cIdx] = sum > 0 ? sum.toFixed(2).replace('.', ',') : '';
                                                                        setModalValues(nextTotals);
                                                                    }}
                                                                    style={{ width: '100%', padding: '0.75rem 0.5rem', fontSize: '0.85rem', textAlign: 'right', border: '1px solid #f1f5f9', borderRadius: '12px', backgroundColor: '#fff', fontWeight: 700, color: '#2563eb' }}
                                                                />
                                                            </td>
                                                        ))}
                                                        <td style={{ padding: '0 0.5rem', textAlign: 'right' }}>
                                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                                <button 
                                                                    title="Replicar"
                                                                    onClick={() => {
                                                                        const firstVal = row.values.find(v => v !== '');
                                                                        if (!firstVal) return;
                                                                        const firstIdx = row.values.indexOf(firstVal);
                                                                        const next = [...modalCompositionRows];
                                                                        for (let i = firstIdx + 1; i < 12; i++) next[rIdx].values[i] = firstVal;
                                                                        setModalCompositionRows(next);
                                                                        
                                                                        const nextTotals = [...modalValues];
                                                                        for (let i = firstIdx; i < 12; i++) {
                                                                            const sum = next.reduce((acc, r) => acc + evaluateFormula(r.values[i] || '0'), 0);
                                                                            nextTotals[i] = sum > 0 ? sum.toFixed(2).replace('.', ',') : '';
                                                                        }
                                                                        setModalValues(nextTotals);
                                                                    }}
                                                                    style={{ border: 'none', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', padding: '0.5rem', borderRadius: '10px' }}
                                                                >⏩</button>
                                                                <button 
                                                                    onClick={() => {
                                                                        const next = modalCompositionRows.filter((_, i) => i !== rIdx);
                                                                        setModalCompositionRows(next);
                                                                        const nextTotals = new Array(12).fill('').map((_, i) => {
                                                                            const sum = next.reduce((acc, r) => acc + evaluateFormula(r.values[i] || '0'), 0);
                                                                            return sum > 0 ? sum.toFixed(2).replace('.', ',') : '';
                                                                        });
                                                                        setModalValues(nextTotals);
                                                                    }}
                                                                    style={{ border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', padding: '0.5rem', borderRadius: '10px' }}
                                                                >✕</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Observation & Footer */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'end' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 900, color: '#64748b', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Observações</label>
                                        <textarea
                                            value={modalObservation}
                                            onChange={(e) => setModalObservation(e.target.value)}
                                            placeholder="Detalhes sobre este planejamento..."
                                            style={{ width: '100%', minHeight: '80px', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1rem' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <button 
                                            disabled={isSavingBudget} 
                                            onClick={handleSaveBudget} 
                                            style={{ 
                                                padding: '1.25rem', 
                                                backgroundColor: '#2563eb', 
                                                color: '#fff', 
                                                border: 'none', 
                                                borderRadius: '16px', 
                                                fontWeight: 800, 
                                                boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)'
                                            }}
                                        >
                                            {isSavingBudget ? 'Processando...' : 'Salvar Tudo'}
                                        </button>
                                        <button onClick={() => setBudgetModal(null)} style={{ padding: '1rem', backgroundColor: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '16px', fontWeight: 700 }}>Cancelar</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Realized Justification Modal (Análise) */}
                {justificationModal && (() => {
                    const isConsolidated = justificationModal.costCenterId === 'ALL';
                    
                    return (
                        <div className="modal-overlay" style={{ zIndex: 1200 }}>
                            <div className="modal-content" style={{ maxWidth: '800px', width: '90%', backgroundColor: '#fff', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                                {isConsolidated ? '💬 Análises Consolidadas' : '📝 Análise Realizado'}: {justificationModal.categoryName}
                                            </h3>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem', marginBottom: 0 }}>
                                                {MONTHS[justificationModal.month]} / {selectedYear}
                                                {isConsolidated ? ' • Visualizando todos os centros de custo' : ` • ${justificationModal.costCenterId || 'Geral'}`}
                                            </p>
                                        </div>
                                        <button onClick={() => setJustificationModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
                                    </div>
                                </div>
                                
                                <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                                    {isConsolidated ? (
                                        <div style={{ minHeight: '200px' }}>
                                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
                                                <thead>
                                                    <tr style={{ textAlign: 'left' }}>
                                                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800 }}>Empresa / CC</th>
                                                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800 }}>Usuário</th>
                                                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800 }}>Data</th>
                                                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800 }}>Justificativa / Análise</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {justificationHistory.map((j, idx) => (
                                                        <tr key={j.id || idx} style={{ backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                                            <td style={{ padding: '1rem', borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px' }}>
                                                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{j.costCenter?.name || 'Geral'}</div>
                                                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{j.tenant?.name}</div>
                                                            </td>
                                                            <td style={{ padding: '1rem', fontWeight: 600, color: '#475569' }}>{j.userName}</td>
                                                            <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.75rem' }}>
                                                                {formatDateSafe(j.createdAt)} 
                                                                <br />
                                                                {formatTimeSafe(j.createdAt, { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td style={{ padding: '1rem', borderTopRightRadius: '8px', borderBottomRightRadius: '8px', fontSize: '0.9rem', color: '#334155', fontStyle: 'italic', maxWidth: '300px', wordBreak: 'break-word' }}>
                                                                "{j.content}"
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {justificationHistory.length === 0 && !loadingJustification && (
                                                        <tr>
                                                            <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                                                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔍</div>
                                                                Nenhuma análise registrada para este período.
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {loadingJustification && (
                                                        <tr>
                                                            <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Carregando análises...</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ marginBottom: '1.5rem', backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#0369a1', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Nova Justificativa / Análise</label>
                                                <textarea
                                                    value={newJustification}
                                                    onChange={(e) => setNewJustification(e.target.value)}
                                                    placeholder="Descreva o motivo da variação ou observação sobre este valor real..."
                                                    style={{ 
                                                        width: '100%', 
                                                        minHeight: '100px', 
                                                        border: '1px solid #bae6fd', 
                                                        borderRadius: '8px', 
                                                        padding: '0.75rem', 
                                                        fontSize: '0.95rem',
                                                        resize: 'vertical',
                                                        outline: 'none'
                                                    }}
                                                />
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                                                    <button 
                                                        onClick={saveJustification}
                                                        disabled={isSavingJustification || !newJustification.trim()}
                                                        style={{ 
                                                            padding: '0.6rem 1.5rem', 
                                                            backgroundColor: '#0284c7', 
                                                            color: '#fff', 
                                                            border: 'none', 
                                                            borderRadius: '8px', 
                                                            fontWeight: 700, 
                                                            cursor: (isSavingJustification || !newJustification.trim()) ? 'default' : 'pointer',
                                                            opacity: (isSavingJustification || !newJustification.trim()) ? 0.6 : 1
                                                        }}
                                                    >
                                                        {isSavingJustification ? 'Salvando...' : 'Salvar Justificativa'}
                                                    </button>
                                                </div>
                                            </div>

                                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
                                                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: '1rem', textTransform: 'uppercase' }}>Histórico de Análises</h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    {justificationHistory.map((j, idx) => (
                                                        <div key={j.id || idx} style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{j.userName}</span>
                                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{formatDateTimeSafe(j.createdAt)}</span>
                                                            </div>
                                                            <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>{j.content}</p>
                                                        </div>
                                                    ))}
                                                    {justificationHistory.length === 0 && !loadingJustification && (
                                                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '2rem' }}>Nenhuma análise anterior registrada.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setJustificationModal(null)} style={{ padding: '0.6rem 1.5rem', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Fechar</button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

            <ExcelPasteModal 
                isOpen={isExcelModalOpen}
                onClose={() => { setIsExcelModalOpen(false); triggerRefresh(); }}
                tenantId={selectedCompany[0]}
                companies={companies}
                categories={categories}
                costCenters={costCenters}
                year={selectedYear}
                viewMode={viewMode}
            />

            <div style={{ height: '2rem' }}></div> {/* Spacer after card */}

            {contractsMarginTooltip && (() => {
                const isClient = typeof window !== 'undefined';
                const screenWidth = isClient ? window.innerWidth : 1200;
                const screenHeight = isClient ? window.innerHeight : 800;
                const tooltipWidth = 190;
                const tooltipHeight = 110;
                const xOffset = contractsMarginTooltip.x + 15 + tooltipWidth > screenWidth
                    ? contractsMarginTooltip.x - tooltipWidth - 15
                    : contractsMarginTooltip.x + 15;
                const yOffset = contractsMarginTooltip.y + 15 + tooltipHeight > screenHeight
                    ? contractsMarginTooltip.y - tooltipHeight - 15
                    : contractsMarginTooltip.y + 15;
                return (
                    <div style={{
                        position: 'fixed',
                        left: `${xOffset}px`,
                        top: `${yOffset}px`,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(4px)',
                        color: '#ffffff',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        zIndex: 9999,
                        pointerEvents: 'none',
                        fontSize: '0.75rem',
                        fontFamily: 'inherit',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        minWidth: `${tooltipWidth}px`
                    }}>
                        <div style={{ fontWeight: 800, fontSize: '0.8rem', borderBottom: '1px solid rgba(255, 255, 255, 0.2)', paddingBottom: '4px', marginBottom: '4px', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contractsMarginTooltip.title}>
                            {contractsMarginTooltip.title}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                            <span style={{ color: '#cbd5e1', fontWeight: 500 }}>Orçado:</span>
                            <span style={{ fontWeight: 700 }}>{contractsMarginTooltip.budget}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                            <span style={{ color: '#cbd5e1', fontWeight: 500 }}>Realizado:</span>
                            <span style={{ fontWeight: 700, color: contractsMarginTooltip.type === 'percentage' ? '#10b981' : '#818cf8' }}>{contractsMarginTooltip.realized}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '4px', marginTop: '2px' }}>
                            <span style={{ color: '#94a3b8', fontWeight: 600 }}>Atingimento:</span>
                            <span style={{ fontWeight: 800, color: '#f59e0b' }}>{contractsMarginTooltip.achievement}</span>
                        </div>
                    </div>
                );
            })()}

            {/* Indicator Analysis Modal */}
            {isAnalysisModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem'
                }}>
                    <div className="glass-card" style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        width: '100%',
                        maxWidth: '900px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        animation: 'modalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)'
                        }}>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                                    📝 Análise e Plano de Ação do Indicador
                                </h3>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
                                    Registre desvios, crie ações corretivas e discuta soluções.
                                </span>
                            </div>
                            <button
                                onClick={() => {
                                    setIsAnalysisModalOpen(false);
                                    setIsQuickCategoryFormOpen(false);
                                }}
                                style={{
                                    background: '#f1f5f9',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '30px',
                                    height: '30px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#64748b',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{
                            padding: '1.5rem',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.5rem',
                            flex: 1
                        }}>
                            {/* Tab Switcher */}
                            <div style={{
                                display: 'flex',
                                background: '#f1f5f9',
                                padding: '0.25rem',
                                borderRadius: '10px',
                                gap: '0.25rem'
                            }}>
                                <button
                                    onClick={() => {
                                        setActiveModalTab('deviation');
                                        setIsEditingChart(false);
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        background: activeModalTab === 'deviation' ? '#ffffff' : 'transparent',
                                        color: activeModalTab === 'deviation' ? '#0f172a' : '#64748b',
                                        boxShadow: activeModalTab === 'deviation' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                                    }}
                                >
                                    🔍 Desvios e Ações
                                </button>
                                <button
                                    onClick={() => {
                                        setActiveModalTab('detailed');
                                        setIsEditingChart(false);
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        background: activeModalTab === 'detailed' ? '#ffffff' : 'transparent',
                                        color: activeModalTab === 'detailed' ? '#0f172a' : '#64748b',
                                        boxShadow: activeModalTab === 'detailed' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                                    }}
                                >
                                    📊 Análises Detalhadas
                                </button>
                            </div>

                            {/* Row 1: Empresa, Mês e Categoria */}
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                {/* Empresa */}
                                <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Empresa</label>
                                    <select
                                        value={analysisSelectedTenant}
                                        onChange={(e) => {
                                            setAnalysisSelectedTenant(e.target.value);
                                            setAnalysisSelectedCategory('');
                                        }}
                                        className="premium-input"
                                        style={{ width: '100%', height: '36px', padding: '0 0.5rem', fontSize: '0.8rem', fontWeight: 600, border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
                                    >
                                        <option value="">Selecione uma empresa...</option>
                                        {companies.map((c: any) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Mês */}
                                <div style={{ width: '140px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mês</label>
                                    <select
                                        value={analysisSelectedMonth}
                                        onChange={(e) => setAnalysisSelectedMonth(Number(e.target.value))}
                                        className="premium-input"
                                        style={{ width: '100%', height: '36px', padding: '0 0.5rem', fontSize: '0.8rem', fontWeight: 600, border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
                                    >
                                        {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, idx) => (
                                            <option key={idx} value={idx + 1}>{m}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Categoria (Conta DRE) */}
                                <div style={{ flex: 2, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Conta do DRE / Indicador</span>
                                        <button
                                            onClick={() => setIsQuickCategoryFormOpen(!isQuickCategoryFormOpen)}
                                            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                        >
                                            {isQuickCategoryFormOpen ? '✕ Fechar Cadastro' : '➕ Cadastro Rápido'}
                                        </button>
                                    </label>
                                    <div style={{ position: 'relative', width: '100%' }}>
                                         {/* Dropdown Toggle trigger */}
                                         <div
                                             onClick={() => {
                                                 setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                                                 setAnalysisCategorySearch('');
                                             }}
                                             className="premium-input"
                                             style={{
                                                 cursor: 'pointer',
                                                 display: 'flex',
                                                 justifyContent: 'space-between',
                                                 alignItems: 'center',
                                                 padding: '0 0.75rem',
                                                 height: '36px',
                                                 fontSize: '0.8rem',
                                                 fontWeight: 600,
                                                 border: '1px solid #cbd5e1',
                                                 borderRadius: '8px',
                                                 background: '#ffffff',
                                                 outline: 'none',
                                                 userSelect: 'none'
                                             }}
                                         >
                                             <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                 {selectedCategoryName}
                                             </span>
                                             <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>▼</span>
                                         </div>

                                         {/* Dropdown Floating Panel */}
                                         {isCategoryDropdownOpen && (
                                             <>
                                                 <div 
                                                     style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }} 
                                                     onClick={() => setIsCategoryDropdownOpen(false)} 
                                                 />
                                                 <div 
                                                     className="glass-card" 
                                                     style={{ 
                                                         position: 'absolute', 
                                                         top: 'calc(100% + 4px)', 
                                                         left: 0, 
                                                         right: 0, 
                                                         zIndex: 10000, 
                                                         maxHeight: '260px', 
                                                         overflowY: 'auto', 
                                                         background: '#ffffff', 
                                                         border: '1px solid #cbd5e1',
                                                         borderRadius: '8px',
                                                         boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                                                         padding: '0.25rem 0'
                                                     }}
                                                 >
                                                     {/* Search Bar inside popover */}
                                                     <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>
                                                         <input 
                                                             type="text" 
                                                             placeholder="Pesquisar conta..." 
                                                             value={analysisCategorySearch}
                                                             onChange={(e) => setAnalysisCategorySearch(e.target.value)}
                                                             onClick={(e) => e.stopPropagation()}
                                                             autoFocus
                                                             style={{ 
                                                                 width: '100%', 
                                                                 padding: '0.4rem 0.6rem', 
                                                                 fontSize: '0.75rem', 
                                                                 borderRadius: '6px', 
                                                                 border: '1px solid #cbd5e1', 
                                                                 background: '#f8fafc', 
                                                                 outline: 'none',
                                                                 boxSizing: 'border-box'
                                                             }}
                                                         />
                                                     </div>
                                                     {/* Category list items */}
                                                     <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                                         <div
                                                             onClick={() => {
                                                                 setAnalysisSelectedCategory('');
                                                                 setIsCategoryDropdownOpen(false);
                                                             }}
                                                             style={{ 
                                                                 padding: '0.5rem 0.75rem', 
                                                                 cursor: 'pointer', 
                                                                 fontSize: '0.75rem', 
                                                                 fontWeight: 500,
                                                                 color: '#64748b',
                                                                 background: analysisSelectedCategory === '' ? '#f1f5f9' : 'transparent'
                                                             }}
                                                             className="hover-row"
                                                         >
                                                             Selecione uma conta...
                                                         </div>
                                                         {categories
                                                             .filter(cat => !analysisSelectedTenant || cat.tenantId === analysisSelectedTenant)
                                                             .filter(cat => !analysisCategorySearch || cat.name.toLowerCase().includes(analysisCategorySearch.toLowerCase()))
                                                             .sort((a, b) => a.name.localeCompare(b.name))
                                                             .map((cat: any) => (
                                                                 <div
                                                                     key={cat.id}
                                                                     onClick={() => {
                                                                         setAnalysisSelectedCategory(cat.id);
                                                                         setIsCategoryDropdownOpen(false);
                                                                     }}
                                                                     style={{ 
                                                                         padding: '0.5rem 0.75rem', 
                                                                         cursor: 'pointer', 
                                                                         fontSize: '0.75rem', 
                                                                         fontWeight: 600,
                                                                         color: '#1e293b',
                                                                         background: analysisSelectedCategory === cat.id ? '#eff6ff' : 'transparent'
                                                                     }}
                                                                     className="hover-row"
                                                                 >
                                                                     {cat.name}
                                                                 </div>
                                                             ))
                                                         }
                                                     </div>
                                                 </div>
                                             </>
                                         )}
                                     </div>
                                </div>
                            </div>

                            {/* Inline Form: Cadastro Rápido de Categoria */}
                            {isQuickCategoryFormOpen && (
                                <div style={{
                                    padding: '1rem',
                                    background: '#f8fafc',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.75rem',
                                    animation: 'fadeIn 0.2s ease-out'
                                }}>
                                    <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                                        ➕ Cadastro Rápido de Categoria DRE
                                    </h4>
                                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        {/* Nome */}
                                        <div style={{ flex: 2, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b' }}>Nome da Categoria</span>
                                            <input
                                                type="text"
                                                placeholder="Ex: 04.1.2 Energia Elétrica"
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                style={{ height: '32px', padding: '0 0.5rem', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
                                            />
                                        </div>
                                        {/* Tipo */}
                                        <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b' }}>Tipo</span>
                                            <select
                                                value={newCategoryType}
                                                onChange={(e) => setNewCategoryType(e.target.value)}
                                                style={{ height: '32px', padding: '0 0.5rem', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', cursor: 'pointer' }}
                                            >
                                                <option value="EXPENSE">Despesa</option>
                                                <option value="REVENUE">Receita</option>
                                            </select>
                                        </div>
                                        {/* Grupo DRE */}
                                        <div style={{ flex: 1.5, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b' }}>Grupo DRE (entradaDre)</span>
                                            <select
                                                value={newCategoryGroup}
                                                onChange={(e) => setNewCategoryGroup(e.target.value)}
                                                style={{ height: '32px', padding: '0 0.5rem', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', cursor: 'pointer' }}
                                            >
                                                <option value="01. RECEITA BRUTA">01. Receita Bruta</option>
                                                <option value="02. DEDUCOES">02. Deduções / Impostos</option>
                                                <option value="03. CUSTOS">03. Custos Operacionais</option>
                                                <option value="04. DESPESAS">04. Despesas Operacionais</option>
                                                <option value="06. DESPESAS FINANCEIRAS">06. Despesas Financeiras</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => setIsQuickCategoryFormOpen(false)}
                                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff', cursor: 'pointer' }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleRegisterCategory}
                                            disabled={isCategoryRegistering}
                                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, border: 'none', borderRadius: '6px', background: '#2563eb', color: '#ffffff', cursor: 'pointer' }}
                                        >
                                            {isCategoryRegistering ? 'Cadastrando...' : 'Confirmar Cadastro'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ABA 1: DESVIOS E AÇÕES */}
                            {activeModalTab === 'deviation' && (
                                isAnalysisLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '150px' }}>
                                        <div style={{ border: '3px solid #f3f3f3', borderTop: '3px solid #3b82f6', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite' }} />
                                    </div>
                                ) : (
                                    <>
                                        {/* Row 2: Textareas - Relato de Desvio & Análise Realizada */}
                                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                            {/* Relato de Desvio */}
                                            <div style={{ flex: 1, minWidth: '350px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Relato do Desvio do Indicador</label>
                                                <textarea
                                                    value={deviationReport}
                                                    onChange={(e) => setDeviationReport(e.target.value)}
                                                    placeholder="Descreva o desvio identificado em relação à meta..."
                                                    style={{ height: '100px', padding: '0.5rem', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                                />
                                            </div>

                                            {/* Análise Realizada */}
                                            <div style={{ flex: 1, minWidth: '350px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Análise Realizada (Causa Raiz)</label>
                                                <textarea
                                                    value={analysisPerformed}
                                                    onChange={(e) => setAnalysisPerformed(e.target.value)}
                                                    placeholder="Descreva os fatores que levaram a este desvio (causa raiz)..."
                                                    style={{ height: '100px', padding: '0.5rem', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                                />
                                            </div>
                                        </div>

                                        {/* Row 3: Plano de Ação (Tabela de itens) */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    📋 Plano de Ação (Ações Corretivas)
                                                </label>
                                                <button
                                                    onClick={() => {
                                                        setAnalysisActions(prev => [...prev, { description: '', dueDate: new Date().toISOString().split('T')[0], isDone: false }]);
                                                    }}
                                                    style={{
                                                        padding: '0.3rem 0.75rem',
                                                        background: '#10b981',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}
                                                >
                                                    ➕ Adicionar Ação
                                                </button>
                                            </div>

                                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#475569' }}>
                                                            <th style={{ padding: '0.5rem', textAlign: 'center', width: '60px' }}>Status</th>
                                                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Descrição da Ação</th>
                                                            <th style={{ padding: '0.5rem', textAlign: 'center', width: '160px' }}>Vencimento</th>
                                                            <th style={{ padding: '0.5rem', textAlign: 'center', width: '60px' }}>Excluir</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {analysisActions.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                                                                    Nenhuma ação cadastrada para este desvio. Clique em "Adicionar Ação" para registrar.
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            analysisActions.map((action, idx) => (
                                                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                    <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!action.isDone}
                                                                            onChange={(e) => {
                                                                                const updated = [...analysisActions];
                                                                                updated[idx].isDone = e.target.checked;
                                                                                setAnalysisActions(updated);
                                                                            }}
                                                                            style={{ accentColor: '#10b981', cursor: 'pointer' }}
                                                                        />
                                                                    </td>
                                                                    <td style={{ padding: '0.4rem' }}>
                                                                        <input
                                                                            type="text"
                                                                            value={action.description}
                                                                            onChange={(e) => {
                                                                                const updated = [...analysisActions];
                                                                                updated[idx].description = e.target.value;
                                                                                setAnalysisActions(updated);
                                                                            }}
                                                                            placeholder="Descreva a ação de forma clara..."
                                                                            style={{ width: '100%', height: '30px', padding: '0 0.4rem', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none' }}
                                                                        />
                                                                    </td>
                                                                    <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                                                                        <input
                                                                            type="date"
                                                                            value={action.dueDate ? action.dueDate.split('T')[0] : ''}
                                                                            onChange={(e) => {
                                                                                const updated = [...analysisActions];
                                                                                updated[idx].dueDate = e.target.value;
                                                                                setAnalysisActions(updated);
                                                                            }}
                                                                            style={{ height: '30px', padding: '0 0.4rem', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', cursor: 'pointer' }}
                                                                        />
                                                                    </td>
                                                                    <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                                                                        <button
                                                                            onClick={() => {
                                                                                setAnalysisActions(prev => prev.filter((_, i) => i !== idx));
                                                                            }}
                                                                            style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}
                                                                        >
                                                                            🗑️
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Row 4: Feed de Comentários */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                💬 Discussão e Feed de Comentários
                                            </label>

                                            {/* Feed List */}
                                            <div style={{
                                                maxHeight: '180px',
                                                overflowY: 'auto',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.75rem',
                                                background: '#f8fafc',
                                                padding: '1rem',
                                                borderRadius: '8px',
                                                border: '1px solid #e2e8f0'
                                            }}>
                                                {analysisComments.length === 0 ? (
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', fontStyle: 'italic' }}>
                                                        Nenhum comentário publicado. Seja o primeiro a comentar abaixo!
                                                    </div>
                                                ) : (
                                                    analysisComments.map((comment) => (
                                                        <div key={comment.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>
                                                                <span>👤 {comment.userName}</span>
                                                                <span style={{ color: '#94a3b8' }}>
                                                                    {formatDateTimeSafe(comment.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: '#1e293b', paddingLeft: '1rem', borderLeft: '2px solid #cbd5e1' }}>
                                                                {comment.content}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            {/* Add Comment Input */}
                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Seu nome..."
                                                    value={newCommentUser}
                                                    onChange={(e) => setNewCommentUser(e.target.value)}
                                                    style={{ width: '130px', height: '32px', padding: '0 0.5rem', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Escreva uma mensagem..."
                                                    value={newCommentText}
                                                    onChange={(e) => setNewCommentText(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && postComment()}
                                                    style={{ flex: 1, height: '32px', padding: '0 0.5rem', fontSize: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
                                                />
                                                <button
                                                    onClick={postComment}
                                                    disabled={!analysisId}
                                                    style={{
                                                        padding: '0 0.75rem',
                                                        background: analysisId ? '#3b82f6' : '#cbd5e1',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        cursor: analysisId ? 'pointer' : 'not-allowed',
                                                        height: '32px'
                                                    }}
                                                >
                                                    Comentar
                                                </button>
                                            </div>
                                            {!analysisId && (
                                                <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 600 }}>
                                                    ⚠️ Salve a análise do indicador antes de poder adicionar comentários.
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )
                            )}

                            {/* ABA 2: ANÁLISES DETALHADAS */}
                            {activeModalTab === 'detailed' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {!isEditingChart ? (
                                        <>
                                            {/* Header list view */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                                                    📊 Gráficos Customizados Cadastrados
                                                </h3>
                                                <button
                                                    onClick={handleAddChartClick}
                                                    style={{
                                                        padding: '0.45rem 1rem',
                                                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.35rem',
                                                        boxShadow: '0 4px 6px rgba(37, 99, 235, 0.15)'
                                                    }}
                                                >
                                                    ➕ Adicionar Gráfico
                                                </button>
                                            </div>

                                            {loadingDetailed ? (
                                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '180px' }}>
                                                    <div style={{ border: '3px solid #f3f3f3', borderTop: '3px solid #3b82f6', borderRadius: '50%', width: '28px', height: '28px', animation: 'spin 1s linear infinite' }} />
                                                </div>
                                            ) : detailedAnalyses.length === 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', textAlign: 'center', gap: '0.75rem' }}>
                                                    <div style={{ fontSize: '2.5rem' }}>📊</div>
                                                    <div>
                                                        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#475569' }}>Nenhum gráfico cadastrado</h4>
                                                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                                            Adicione gráficos para acompanhar o histórico das contas do DRE de forma gráfica e detalhada.
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
                                                            mainMonth={analysisSelectedMonth} 
                                                            year={selectedYear} 
                                                            viewMode={viewMode} 
                                                            categories={categories} 
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        /* Editor inline */
                                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                            {/* Form column */}
                                            <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                                                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                                                        {editingChartId ? '✏️ Editar Configuração do Gráfico' : '➕ Configurar Novo Gráfico'}
                                                    </h4>
                                                </div>

                                                {/* Chart Types selector buttons */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Tipo de Gráfico *</label>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.4rem' }}>
                                                        {[
                                                            { id: 'VERTICAL_BAR', label: '📊 Vertical', icon: '📊' },
                                                            { id: 'HORIZONTAL_BAR', label: '➖ Horizontal', icon: '➖' },
                                                            { id: 'LINE', label: '📈 Linha', icon: '📈' },
                                                            { id: 'LINE_MARKERS', label: '📉 Linha/Marc.', icon: '📉' },
                                                            { id: 'PIE', label: '🍕 Pizza', icon: '🍕' },
                                                            { id: 'DONUT', label: '🍩 Rosca', icon: '🍩' },
                                                            { id: 'GAUGE', label: '⏱️ Velocímetro', icon: '⏱️' }
                                                        ].map((typeItem) => (
                                                            <button
                                                                key={typeItem.id}
                                                                type="button"
                                                                onClick={() => setChartType(typeItem.id)}
                                                                style={{
                                                                    padding: '0.5rem',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 700,
                                                                    borderRadius: '8px',
                                                                    border: '1px solid',
                                                                    borderColor: chartType === typeItem.id ? '#2563eb' : '#e2e8f0',
                                                                    background: chartType === typeItem.id ? '#eff6ff' : '#ffffff',
                                                                    color: chartType === typeItem.id ? '#1d4ed8' : '#475569',
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

                                                {/* Category searchable dropdown */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', position: 'relative' }}>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Conta do DRE / Indicador *</label>
                                                    <div
                                                        onClick={() => {
                                                            setIsChartCategoryDropdownOpen(!isChartCategoryDropdownOpen);
                                                            setChartCategorySearch('');
                                                        }}
                                                        className="premium-input"
                                                        style={{
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            padding: '0 0.75rem',
                                                            height: '36px',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 600,
                                                            border: '1px solid #cbd5e1',
                                                            borderRadius: '8px',
                                                            background: '#ffffff',
                                                            outline: 'none',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {(() => {
                                                                const dreLabels: Record<string, string> = {
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
                                                                    vNetProfit: '(=) Lucro Líquido',
                                                                    vInvest: '07. Investimentos'
                                                                };
                                                                if (dreLabels[chartCategory]) return dreLabels[chartCategory];
                                                                const found = categories.find((cat: any) => cat.id === chartCategory);
                                                                return found ? found.name : 'Selecione uma conta...';
                                                            })()}
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
                                                                    background: '#ffffff', 
                                                                    border: '1px solid #cbd5e1',
                                                                    borderRadius: '8px',
                                                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                                                                    padding: '0.25rem 0'
                                                                }}
                                                            >
                                                                <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder="Pesquisar conta..." 
                                                                        value={chartCategorySearch}
                                                                        onChange={(e) => setChartCategorySearch(e.target.value)}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        autoFocus
                                                                        style={{ 
                                                                            width: '100%', 
                                                                            padding: '0.4rem 0.6rem', 
                                                                            fontSize: '0.75rem', 
                                                                            borderRadius: '6px', 
                                                                            border: '1px solid #cbd5e1', 
                                                                            background: '#f8fafc', 
                                                                            outline: 'none',
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
                                                                        vNetProfit: '(=) Lucro Líquido',
                                                                        vInvest: '07. Investimentos'
                                                                    })
                                                                    .filter(([_, name]) => !chartCategorySearch || name.toLowerCase().includes(chartCategorySearch.toLowerCase()))
                                                                    .map(([id, name]) => (
                                                                        <div
                                                                            key={id}
                                                                            onClick={() => {
                                                                                setChartCategory(id);
                                                                                setIsChartCategoryDropdownOpen(false);
                                                                            }}
                                                                            style={{ 
                                                                                padding: '0.4rem 0.75rem', 
                                                                                cursor: 'pointer', 
                                                                                fontSize: '0.75rem', 
                                                                                fontWeight: 700,
                                                                                color: '#1e3a8a',
                                                                                background: chartCategory === id ? '#eff6ff' : 'transparent'
                                                                            }}
                                                                            className="premium-row"
                                                                        >
                                                                            ⭐ {name}
                                                                        </div>
                                                                    ))}
                                                                    {/* Synthetic Parents Options */}
                                                                    {Object.entries(syntheticLabels)
                                                                    .filter(([_, name]) => !chartCategorySearch || name.toLowerCase().includes(chartCategorySearch.toLowerCase()))
                                                                    .map(([id, name]) => (
                                                                        <div
                                                                            key={id}
                                                                            onClick={() => {
                                                                                setChartCategory(id);
                                                                                setIsChartCategoryDropdownOpen(false);
                                                                            }}
                                                                            style={{ 
                                                                                padding: '0.4rem 0.75rem', 
                                                                                cursor: 'pointer', 
                                                                                fontSize: '0.75rem', 
                                                                                fontWeight: 700,
                                                                                color: '#1e3a8a',
                                                                                background: chartCategory === id ? '#eff6ff' : 'transparent'
                                                                            }}
                                                                            className="premium-row"
                                                                        >
                                                                            📁 {name} (Consolidado)
                                                                        </div>
                                                                    ))}
                                                                    {/* Categories list */}
                                                                    {categories
                                                                        .filter(cat => !analysisSelectedTenant || cat.tenantId === analysisSelectedTenant)
                                                                        .filter(cat => !chartCategorySearch || cat.name.toLowerCase().includes(chartCategorySearch.toLowerCase()))
                                                                        .sort((a, b) => a.name.localeCompare(b.name))
                                                                        .map((cat: any) => (
                                                                            <div
                                                                                key={cat.id}
                                                                                onClick={() => {
                                                                                    setChartCategory(cat.id);
                                                                                    setIsChartCategoryDropdownOpen(false);
                                                                                }}
                                                                                style={{ 
                                                                                    padding: '0.4rem 0.75rem', 
                                                                                    cursor: 'pointer', 
                                                                                    fontSize: '0.75rem', 
                                                                                    fontWeight: 600,
                                                                                    color: '#334155',
                                                                                    background: chartCategory === cat.id ? '#eff6ff' : 'transparent'
                                                                                }}
                                                                                className="hover-row"
                                                                            >
                                                                                {cat.name}
                                                                            </div>
                                                                        ))
                                                                    }
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Filters: Tenant & Cost Center */}
                                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Filtro de Empresa *</label>
                                                        <select
                                                            value={chartTenant}
                                                            onChange={(e) => setChartTenant(e.target.value)}
                                                            className="premium-input"
                                                            style={{ width: '100%', height: '36px', padding: '0 0.5rem', fontSize: '0.8rem', fontWeight: 600, border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
                                                        >
                                                            <option value="ALL">Todas Empresas (Consolidado)</option>
                                                            {companies.map((c: any) => (
                                                                <option key={c.id} value={c.id}>{c.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Centro de Custo</label>
                                                        <select
                                                            value={chartCC}
                                                            onChange={(e) => setChartCC(e.target.value)}
                                                            className="premium-input"
                                                            style={{ width: '100%', height: '36px', padding: '0 0.5rem', fontSize: '0.8rem', fontWeight: 600, border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
                                                        >
                                                            <option value="ALL">Todos Centros de Custo</option>
                                                            {costCenters.map((cc: any) => (
                                                                <option key={cc.id} value={cc.nome}>{cc.nome}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Option switches checkboxes */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={chartOnlyRealized}
                                                            onChange={(e) => setChartOnlyRealized(e.target.checked)}
                                                            style={{ accentColor: '#2563eb', cursor: 'pointer' }}
                                                        />
                                                        Somente Realizado (oculta o Orçado/Meta)
                                                    </label>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={chartShowAtingido}
                                                            onChange={(e) => setChartShowAtingido(e.target.checked)}
                                                            style={{ accentColor: '#2563eb', cursor: 'pointer' }}
                                                        />
                                                        Adicionar Linha de Atingido
                                                    </label>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={chartPctOfRevenue}
                                                            onChange={(e) => setChartPctOfRevenue(e.target.checked)}
                                                            style={{ accentColor: '#2563eb', cursor: 'pointer' }}
                                                        />
                                                        Percentual sobre Receita (calculado sobre Receita Líquida)
                                                    </label>
                                                </div>

                                                {/* Historical Analysis Textarea */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Análise e Histórico Relacionado</label>
                                                    <textarea
                                                        value={chartAnalysisText}
                                                        onChange={(e) => setChartAnalysisText(e.target.value)}
                                                        placeholder="Registre aqui observações históricas ou análises qualitativas desse gráfico..."
                                                        style={{ height: '80px', padding: '0.5rem', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                                    />
                                                </div>

                                                {/* Form actions */}
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsEditingChart(false)}
                                                        style={{ padding: '0.45rem 1rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={saveDetailedAnalysis}
                                                        disabled={savingChart}
                                                        style={{ padding: '0.45rem 1.25rem', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px rgba(37, 99, 235, 0.15)' }}
                                                    >
                                                        {savingChart ? 'Salvando...' : 'Salvar Gráfico'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Preview column */}
                                            <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', alignSelf: 'stretch', justifyContent: 'center' }}>
                                                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                                                    <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        👁️ Pré-visualização Real-Time
                                                    </h4>
                                                </div>

                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '260px' }}>
                                                    {loadingPreviewData ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                            <div style={{ border: '3px solid #f3f3f3', borderTop: '3px solid #3b82f6', borderRadius: '50%', width: '28px', height: '28px', animation: 'spin 1s linear infinite' }} />
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Carregando dados...</span>
                                                        </div>
                                                    ) : !chartCategory ? (
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>
                                                            Selecione uma conta para ver o gráfico.
                                                        </div>
                                                    ) : (
                                                        <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                                                            {renderDetailedChart(chartType, chartPreviewData, chartOnlyRealized, chartShowAtingido, chartPctOfRevenue, analysisSelectedMonth, chartColor, undefined, externalYear)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '0.75rem',
                            background: '#f8fafc'
                        }}>
                            <button
                                onClick={() => {
                                    setIsAnalysisModalOpen(false);
                                    setIsQuickCategoryFormOpen(false);
                                }}
                                style={{
                                    padding: '0.5rem 1.25rem',
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    color: '#475569',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#f1f5f9';
                                    e.currentTarget.style.borderColor = '#94a3b8';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#ffffff';
                                    e.currentTarget.style.borderColor = '#cbd5e1';
                                }}
                            >
                                Fechar
                            </button>
                            {activeModalTab === 'deviation' && (
                                <button
                                    onClick={saveAnalysisData}
                                    disabled={isAnalysisSaving || isAnalysisLoading || !analysisSelectedCategory}
                                    style={{
                                        padding: '0.5rem 1.25rem',
                                        background: !analysisSelectedCategory ? '#cbd5e1' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: !analysisSelectedCategory ? 'not-allowed' : 'pointer',
                                        boxShadow: !analysisSelectedCategory ? 'none' : '0 4px 6px rgba(37, 99, 235, 0.2)',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {isAnalysisSaving ? 'Salvando...' : 'Salvar Análise'}
                                </button>
                            )}
                        </div>
                    </div>
                    {/* Spin Animation Definition */}
                    <style>{`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        @keyframes modalSlideIn {
                            from { transform: translateY(30px); opacity: 0; }
                            to { transform: translateY(0); opacity: 1; }
                        }
                    `}</style>
                </div>
            )}
            {isDeviationModalOpen && activeDeviationNode && (
                <div className="modal-overlay" style={{ zIndex: 1210, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="modal-content" style={{ maxWidth: '850px', width: '100%', maxHeight: '90vh', backgroundColor: 'var(--bg-surface)', borderRadius: '24px', boxShadow: 'var(--shadow-card)', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-default)', animation: 'modalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                        
                        {/* Header */}
                        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)' }}>
                            <div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Apontamento de Desvios & Ações</span>
                                <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    📋 {activeDeviationNode.name}
                                </h3>
                            </div>
                            <button 
                                onClick={() => {
                                    setIsDeviationModalOpen(false);
                                    setActiveDeviationNode(null);
                                }} 
                                style={{ border: 'none', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '10px', transition: 'all 0.2s', border: '1px solid var(--border-default)' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '2rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            
                            {/* Novo Desvio Form */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', borderRadius: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Registrar Novo Desvio</h4>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                    {/* Mês */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Mês de Competência</label>
                                        <select
                                            value={deviationMonth}
                                            onChange={(e) => setDeviationMonth(parseInt(e.target.value, 10))}
                                            style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', fontWeight: 650 }}
                                        >
                                            {MONTHS.map((m, idx) => (
                                                <option key={idx} value={idx + 1}>{m} / {selectedYear}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Tipo de Desvio */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Tipo de Análise / Ação</label>
                                        <select
                                            value={deviationType}
                                            onChange={(e) => setDeviationType(e.target.value)}
                                            style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', fontWeight: 650 }}
                                        >
                                            <option value="Reclassificar na fonte (Conta Azul)">Reclassificar na fonte (Conta Azul)</option>
                                            <option value="Desvios de orçamento">Desvios de orçamento</option>
                                            <option value="Reclassificação gerencial">Reclassificação gerencial</option>
                                            <option value="Ajuste de lançamentos">Ajuste de lançamentos</option>
                                            <option value="Outro">Outro (Anotações gerais)</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                    {/* Relato / Descrição */}
                                    <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Descrição do Desvio / Ocorrência</label>
                                        <textarea
                                            value={deviationDescription}
                                            onChange={(e) => setDeviationDescription(e.target.value)}
                                            placeholder="Descreva o problema ou observação identificada..."
                                            style={{ height: '80px', padding: '0.5rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                        />
                                    </div>

                                    {/* Ação Corretiva */}
                                    <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Plano de Correção (Ação Gerencial)</label>
                                        <textarea
                                            value={deviationCorrectionAction}
                                            onChange={(e) => setDeviationCorrectionAction(e.target.value)}
                                            placeholder="Descreva a ação corretiva que deve ser tomada..."
                                            style={{ height: '80px', padding: '0.5rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                                    {/* Responsável */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Responsável pela Ação</label>
                                        <select
                                            value={deviationResponsibleId}
                                            onChange={(e) => setDeviationResponsibleId(e.target.value)}
                                            style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', fontWeight: 650 }}
                                        >
                                            <option value="">-- Sem responsável --</option>
                                            {usersList.map((u: any) => (
                                                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Prazo */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Prazo de Conclusão</label>
                                        <input
                                            type="date"
                                            value={deviationDueDate}
                                            onChange={(e) => setDeviationDueDate(e.target.value)}
                                            style={{ padding: '0.45rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', fontWeight: 650 }}
                                        />
                                    </div>

                                    {/* Salvar Button */}
                                    <button
                                        onClick={handleSaveDeviation}
                                        disabled={isSavingDeviation}
                                        style={{
                                            padding: '0.6rem 1.5rem',
                                            background: 'var(--gradient-brand)',
                                            color: '#ffffff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            boxShadow: 'var(--shadow-button)',
                                            transition: 'all 0.2s',
                                            height: '38px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        {isSavingDeviation ? 'Salvando...' : 'Adicionar Ação'}
                                    </button>
                                </div>
                            </div>

                            {/* Histórico / Lista de Desvios */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Desvios e Planos de Ação Registrados</h4>
                                
                                {deviations?.filter((d: any) => d?.categoryId && (d.categoryId === activeDeviationNode.id || d.categoryId.endsWith(':' + activeDeviationNode.id))).length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px dashed var(--border-default)', borderRadius: '12px', fontStyle: 'italic' }}>
                                        Nenhum desvio ou plano de ação registrado para esta conta neste ano.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {deviations?.filter((d: any) => d?.categoryId && (d.categoryId === activeDeviationNode.id || d.categoryId.endsWith(':' + activeDeviationNode.id))).map((d: any) => {
                                            return (
                                                <div 
                                                    key={d.id} 
                                                    style={{ 
                                                        padding: '1.25rem', 
                                                        borderRadius: '14px', 
                                                        border: '1px solid var(--border-default)', 
                                                        backgroundColor: d.isResolved ? 'rgba(16, 185, 129, 0.03)' : 'var(--bg-surface)',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                        transition: 'all 0.2s',
                                                        opacity: d.isResolved ? 0.75 : 1,
                                                        position: 'relative'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.25rem 0.6rem', borderRadius: '99px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                                                                📅 {MONTHS[d.month - 1]} / {d.year}
                                                            </span>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.25rem 0.6rem', borderRadius: '99px', background: d.isResolved ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: d.isResolved ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                                                {d.isResolved ? 'Corrigido / Resolvido' : 'Pendente'}
                                                            </span>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                                {d.deviationType}
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            <button
                                                                onClick={() => handleToggleResolveDeviation(d.id, d.isResolved)}
                                                                style={{
                                                                    padding: '0.35rem 0.75rem',
                                                                    background: d.isResolved ? '#f1f5f9' : 'rgba(16, 185, 129, 0.1)',
                                                                    border: d.isResolved ? '1px solid #cbd5e1' : '1px solid rgba(16, 185, 129, 0.3)',
                                                                    borderRadius: '8px',
                                                                    color: d.isResolved ? '#475569' : 'var(--accent-green)',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.15s'
                                                                }}
                                                            >
                                                                {d.isResolved ? 'Reabrir Ação' : 'Marcar Resolvido'}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDeviation(d.id)}
                                                                style={{
                                                                    padding: '0.35rem',
                                                                    background: 'none',
                                                                    border: '1px solid var(--border-default)',
                                                                    borderRadius: '8px',
                                                                    color: 'var(--accent-red)',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.85rem'
                                                                }}
                                                                title="Excluir desvio"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.75rem', borderTop: '1px solid var(--border-default)', paddingTop: '0.75rem' }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ocorrência / Relato:</div>
                                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.2rem', whiteSpace: 'pre-wrap', textDecoration: d.isResolved ? 'line-through' : 'none' }}>
                                                                {d.description}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Plano de Ação:</div>
                                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.2rem', whiteSpace: 'pre-wrap', textDecoration: d.isResolved ? 'line-through' : 'none' }}>
                                                                {d.correctionAction}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <span>👤 Responsável:</span>
                                                            <strong style={{ color: 'var(--text-primary)' }}>
                                                                {d.responsible?.name || d.responsibleName || 'Não designado'}
                                                            </strong>
                                                        </div>
                                                        {d.dueDate && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                <span>📅 Prazo:</span>
                                                                <strong style={{ color: new Date(d.dueDate) < new Date() && !d.isResolved ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                                                                    {formatDateSafe(d.dueDate)}
                                                                </strong>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '1rem 2rem', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-elevated)' }}>
                            <button
                                onClick={() => {
                                    setIsDeviationModalOpen(false);
                                    setActiveDeviationNode(null);
                                }}
                                style={{ padding: '0.55rem 1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
