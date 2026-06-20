'use client';
// V47.130 - Hierarchical Indentation Fix (Recursive Leveling + Deep Padding)

import React, { useState, useMemo, useEffect, useRef } from 'react';
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

// Tree Node Interface
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
    companies,
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
    const [contractsLoading, setContractsLoading] = useState(false);
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

    // --- DRE Group Card Collapse States ---
    const [isReceitasExpanded, setIsReceitasExpanded] = useState(true);
    const [isCustosExpanded, setIsCustosExpanded] = useState(true);
    const [isResultadosExpanded, setIsResultadosExpanded] = useState(true);

    const highlightedMonth = -1; // Desativar destaque de mês vigente

    const headerScrollRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);

    const handleScrollSync = () => {
        if (bodyScrollRef.current && headerScrollRef.current) {
            headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
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
        return transactions.filter((tx: any) =>
            (tx.tenantName || 'Geral') === transactionSelectedCompany &&
            ((tx.costCenters && tx.costCenters.length > 0) ? tx.costCenters[0].nome : 'Geral') === transactionSelectedCostCenter
        );
    }, [transactions, transactionSelectedCompany, transactionSelectedCostCenter]);

    const [categories, setCategories] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>(MOCK_COST_CENTERS);
    const [error, setError] = useState<string | null>(null);

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
                    setCategories(setupData.categories);
                    if (setupData.costCenters.length > 0) {
                        setCostCenters([...MOCK_COST_CENTERS.filter(m => m.id === 'DEFAULT'), ...setupData.costCenters]);
                    }
                }
            } catch (err) {
                console.error("Setup Error:", err);
            }
        };
        loadSetup();
    }, [refreshKey, selectedYear]);

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
            } catch (err: any) {
                console.error('Grid Load Error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadValues();
    }, [selectedCostCenter, selectedCompany, selectedYear, refreshKey, viewMode]);

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
        const recalculateLevels = (nodes: CategoryNode[], lvl: number) => {
            nodes.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));
            nodes.forEach(n => {
                n.level = lvl;
                recalculateLevels(n.children, lvl + 1);
            });
        };
        recalculateLevels(finalRoots, 0);

        return finalRoots;
    }, [categories, selectedCompany]);

    // --- RECURSIVE TOTALS ---
    const nodeTotals = useMemo(() => {
        const totalsMap = new Map<string, { budget: number[], realized: number[], radar: number[] }>();
        const isNegatedCode = (code: string) => code.startsWith('06.1');

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
            other: [] as CategoryNode[]
        };

        treeRoots.forEach(root => {
            const code = root.code || '';
            if (code.startsWith('01') || code === '1') buckets.rev.push(root);
            else if (code.startsWith('02') || code === '2') buckets.taxes.push(root);
            else if (code.startsWith('3') || code.startsWith('03')) buckets.costs.push(root);
            else if (code.startsWith('4') || code.startsWith('04')) buckets.opExp.push(root);
            else if (code.startsWith('5') || code.startsWith('05') || code.startsWith('7') || code.startsWith('07') || code.startsWith('8') || code.startsWith('08')) buckets.adminExp.push(root);
            else if (code.startsWith('6') || code.startsWith('06') || code.startsWith('9') || code.startsWith('09') || code.startsWith('10')) buckets.fin.push(root);
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

                return { vRev, vTaxes, vRecLiq, vCosts, vGrossMarg, vOpExp, vContribMarg, vAdminExp, vEbitda, vFin, vNetProfit };
            }
        };
    }, [treeRoots, nodeTotals]);

    // Formatters
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
                vNetProfit: { b: accNetProfitB, r: accNetProfitR, rd: accNetProfitRd }
            };
        });
    }, [precomputedDreTotals]);

    const companyRevenueData = useMemo(() => {
        const visibleCompanyIds = selectedCompany.includes('DEFAULT')
            ? companies.map(c => c.id)
            : selectedCompany;

        const isRevenueCategory = (cat: any) => {
            const cleanCode = (cat.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return cleanCode.startsWith('01') || cleanCode === '1';
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
            return code.startsWith('01') || code === '1';
        };
        const isTax = (c: any) => {
            const code = (c.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            return code.startsWith('02') || code === '2';
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
                                whiteSpace: 'nowrap',
                                textShadow: isInteractiveTree ? '0 1px 1px rgba(0,0,0,0.05)' : 'none'
                            }}>
                                {node.name}
                            </span>
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
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <span style={{ marginRight: '0.5rem', color: '#cbd5e1' }}>└</span>
                                    {itemName}
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
        const isLucroLiquido = false;

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
                        color: isLucroLiquido ? '#ffffff !important' : '#0f172a',
                        background: isLucroLiquido ? 'linear-gradient(135deg, #2563eb, #1d4ed8) !important' : '#f8fafc',
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
                        if (validx === 'vFin') {
                            budgetVal = -budgetVal;
                            realizedVal = -realizedVal;
                        }
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
                                className="spreadsheet-value" 
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
                                className="spreadsheet-value" 
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
        dataKey: 'vRev' | 'vTaxes' | 'vCosts' | 'vGrossMarg' | 'vOpExp' | 'vContribMarg' | 'vAdminExp' | 'vEbitda' | 'vFin' | 'vNetProfit',
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
        const hasNegative = dataToUse.some(m => m[dataKey].b < 0 || (m[dataKey].r !== undefined && m[dataKey].r < 0));

        // Max absolute value across all 12 months for scale calculation
        const maxVal = Math.max(...dataToUse.map(m => Math.max(
            visible.budget ? Math.abs(m[dataKey].b) : 0, 
            visible.realized ? Math.abs(m[dataKey].r || 0) : 0
        ))) || 1;

        // Find the maximum rate to define the Y scale for percentages, default to 100
        const maxRate = Math.max(1, ...dataToUse.map(month => {
            const bRev = month.vRev.b;
            const bVal = month[dataKey].b;
            const bRate = bRev > 0 ? (bVal / bRev) * 100 : 0;
            
            const rRev = month.vRev.r;
            const rVal = month[dataKey].r || 0;
            const rRate = rRev > 0 ? (rVal / rRev) * 100 : 0;
            
            return Math.max(Math.abs(bRate), Math.abs(rRate));
        })) || 100;

        // Y Layout parameters:
        // hasNegative: baseline Y=170, max height 115px
        // positive-only: baseline Y=300, max height 210px
        const yBaseline = hasNegative ? 170 : 300;
        const maxBarHeight = hasNegative ? 115 : 210;

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
                    ? Math.max(30, Math.min(290, 170 - (bRate / maxRate) * 120))
                    : Math.max(30, Math.min(290, 300 - (bRate / maxRate) * 250));
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
                        ? Math.max(30, Math.min(290, 170 - (rRate / maxRate) * 120))
                        : Math.max(30, Math.min(290, 300 - (rRate / maxRate) * 250));
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
                        ? Math.max(30, Math.min(290, 170 - (pctAtingido / 100) * 60))
                        : Math.max(30, Math.min(290, 280 - (pctAtingido / 100) * 150));
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
                    <div className="toggle-group" style={{ height: '30px', padding: '2px' }}>
                        <button onClick={() => setViewMode('mensal')} className={`toggle-btn ${viewMode === 'mensal' ? 'active' : ''}`} style={{ padding: '0 0.75rem', fontSize: '0.7rem' }}>Mensal</button>
                        <button onClick={() => setViewMode('acumulado')} className={`toggle-btn ${viewMode === 'acumulado' ? 'active' : ''}`} style={{ padding: '0 0.75rem', fontSize: '0.7rem' }}>Acumulado</button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                        <svg viewBox="0 0 1200 350" width="100%" height="350px" style={{ minWidth: '800px', display: 'block' }}>
                            {/* Grid Lines */}
                            {hasNegative ? (
                                <>
                                    <line x1="40" y1="170" x2="1160" y2="170" stroke="#475569" strokeWidth="2" /> {/* Center Baseline */}
                                    <line x1="40" y1="230" x2="1160" y2="230" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="290" x2="1160" y2="290" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="110" x2="1160" y2="110" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="50" x2="1160" y2="50" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                                </>
                            ) : (
                                <>
                                    <line x1="40" y1="300" x2="1160" y2="300" stroke="#cbd5e1" strokeWidth="1" /> {/* Bottom Baseline */}
                                    <line x1="40" y1="236" x2="1160" y2="236" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="172" x2="1160" y2="172" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="108" x2="1160" y2="108" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                                    <line x1="40" y1="44" x2="1160" y2="44" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
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
                                            y={hasNegative ? "330" : "325"} 
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
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.5rem', textAlign: 'center' }}>
                    Receita por Empresa (Período Selecionado)
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, display: 'block', marginTop: '0.25rem' }}>
                        Valores em Mil R$
                    </span>
                </h3>

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
            <div className="glass-card" style={{ padding: '2rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', width: '100%' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.5rem' }}>
                    Margem Bruta (MB) por Empresa (Período Selecionado)
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, display: 'block', marginTop: '0.25rem' }}>
                        Valores Absolutos em Mil R$ e Margem Percentual (%)
                    </span>
                </h3>

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
                        <select 
                            value={selectedContractsMonth} 
                            onChange={(e) => setSelectedContractsMonth(e.target.value)}
                            style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: 600, color: '#334155', background: '#ffffff', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="accumulated">Acumulado do Período</option>
                            {monthsInPeriod.map(m => (
                                <option key={m} value={m.toString()}>{MONTH_SHORT[m]}</option>
                            ))}
                        </select>
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
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        <option value="accumulated">Acumulado do Período</option>
                        {monthsInPeriod.map(m => (
                            <option key={m} value={m.toString()}>{MONTH_SHORT[m]}</option>
                        ))}
                    </select>
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
                        <div style={{ flex: 1, minWidth: '350px' }}>
                            {renderCompanyRevenueDonut()}
                        </div>
                        <div style={{ flex: 1, minWidth: '350px' }}>
                            {renderContractsBarChart()}
                        </div>
                    </div>
                    <div style={{ width: '100%' }}>
                        {renderCompanyGrossMargin()}
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
                                            {renderSummaryRow('04. DESPESAS OPERACIONAIS', 'vOpExp', true, 'opExp')}
                                            {expandedGroups.has('opExp') && dreStructure.buckets.opExp.map(root => renderNode(root))}
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
                {selectedCell && (
                    <div className="modal-overlay" style={{ zIndex: 1100 }}>
                        <div className="modal-content" style={{ maxWidth: '1000px', height: '90vh', backgroundColor: '#fff' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#1e293b' }}>{selectedCell.categoryName}</h3>
                                    <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>
                                    Competência: {MONTHS[selectedCell.month]} / {selectedYear}
                                </div>

                                {/* Breadcrumb Navigation */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                    <button
                                        onClick={() => setTransactionModalStep('company')}
                                        style={{ background: 'none', border: 'none', padding: 0, color: transactionModalStep === 'company' ? '#1e293b' : '#3b82f6', fontWeight: transactionModalStep === 'company' ? 700 : 500, cursor: transactionModalStep === 'company' ? 'default' : 'pointer' }}
                                    >
                                        🏢 Empresas
                                    </button>

                                    {transactionModalStep !== 'company' && transactionSelectedCompany && (
                                        <>
                                            <span style={{ color: '#cbd5e1' }}>/</span>
                                            <button
                                                onClick={() => setTransactionModalStep('costcenter')}
                                                style={{ background: 'none', border: 'none', padding: 0, color: transactionModalStep === 'costcenter' ? '#1e293b' : '#3b82f6', fontWeight: transactionModalStep === 'costcenter' ? 700 : 500, cursor: transactionModalStep === 'costcenter' ? 'default' : 'pointer' }}
                                            >
                                                📍 {transactionSelectedCompany}
                                            </button>
                                        </>
                                    )}

                                    {transactionModalStep === 'transactions' && transactionSelectedCostCenter && (
                                        <>
                                            <span style={{ color: '#cbd5e1' }}>/</span>
                                            <span style={{ color: '#1e293b', fontWeight: 700 }}>📄 {transactionSelectedCostCenter}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {loadingTransactions ? <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                                <style>{`
                                    @keyframes force-spin {
                                        from { transform: rotate(0deg); }
                                        to { transform: rotate(360deg); }
                                    }
                                `}</style>
                                <div style={{ width: '40px', height: '40px', border: '3px solid #f1f5f9', borderTop: '3px solid #3b82f6', borderRadius: '50%', margin: '0 auto 1rem', animation: 'force-spin 1s linear infinite' }} />
                                <div>Carregando detalhamentos...</div>
                            </div> : transactions.length === 0 ? <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Nenhum lançamento encontrado.</div> : (
                                <>
                                    {transactionModalStep === 'company' && (
                                        <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                                    <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Empresas Contribuintes</th>
                                                    <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>Realizado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {groupedByCompany.map((group, idx) => (
                                                    <tr key={idx}
                                                        onClick={() => { setTransactionSelectedCompany(group.name); setTransactionModalStep('costcenter'); }}
                                                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.2s' }}
                                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            🏢 {group.name}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>{group.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', borderTop: '2px solid #cbd5e1', fontSize: '0.85rem' }}>Total Geral do Mês:</td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', borderTop: '2px solid #cbd5e1', color: '#0f172a', fontSize: '0.95rem' }}>
                                                        {groupedByCompany.reduce((acc, g) => acc + g.total, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    )}

                                    {transactionModalStep === 'costcenter' && (
                                        <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                                    <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Centros de Custo (em {transactionSelectedCompany})</th>
                                                    <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>Realizado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {groupedByCostCenter.map((group, idx) => (
                                                    <tr key={idx}
                                                        onClick={() => { setTransactionSelectedCostCenter(group.name); setTransactionModalStep('transactions'); }}
                                                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.2s' }}
                                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            📍 {group.name}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>{group.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', borderTop: '2px solid #cbd5e1', fontSize: '0.85rem' }}>Total na Empresa:</td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', borderTop: '2px solid #cbd5e1', color: '#0f172a', fontSize: '0.95rem' }}>
                                                        {groupedByCostCenter.reduce((acc, g) => acc + g.total, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    )}

                                    {transactionModalStep === 'transactions' && (
                                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                                    <th style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid #e2e8f0', color: '#475569', minWidth: '90px' }}>Data</th>
                                                    <th style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Descrição</th>
                                                    <th style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Cliente/Forn.</th>
                                                    <th style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {finalTransactions.map((tx: any) => (
                                                    <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '0.5rem' }}>{tx.date ? new Date(tx.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</td>
                                                        <td style={{ padding: '0.5rem' }}>{tx.description}</td>
                                                        <td style={{ padding: '0.5rem' }}>{tx.customer || '-'}</td>
                                                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{parseFloat(tx.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                                                    <td colSpan={3} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderTop: '2px solid #cbd5e1', fontSize: '0.85rem' }}>Total neste Centro de Custo:</td>
                                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderTop: '2px solid #cbd5e1', color: '#0f172a', fontSize: '0.85rem' }}>
                                                {finalTransactions.reduce((acc, tx) => acc + (parseFloat(tx.value) || 0), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    )}
                                </>
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
                                                                {new Date(j.createdAt).toLocaleDateString('pt-BR')} 
                                                                <br />
                                                                {new Date(j.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(j.createdAt).toLocaleString('pt-BR')}</span>
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
        </>
    );
}
