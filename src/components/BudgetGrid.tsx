'use client';
// V47.130 - Hierarchical Indentation Fix (Recursive Leveling + Deep Padding)

import React, { useState, useMemo, useEffect } from 'react';
import { MONTHS, MOCK_COST_CENTERS } from '@/lib/mock-data';

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
}

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
    externalYear = new Date().getFullYear()
}: BudgetGridProps) {
    const [internalRefresh, setInternalRefresh] = useState(0);
    const triggerRefresh = () => setInternalRefresh((prev: number) => prev + 1);

    const [budgetValues, setBudgetValues] = useState<Record<string, { amount: number, radarAmount: number | null, isLocked: boolean, observation?: string | null }>>({});
    const [isCCLocked, setIsCCLocked] = useState(false);
    const [radarLocks, setRadarLocks] = useState<any[]>([]);
    const [realizedValues, setRealizedValues] = useState<Record<string, number>>({});

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
    const [viewMode, setViewMode] = useState<'caixa' | 'competencia'>('competencia');
    const [viewPeriod, setViewPeriod] = useState<'month' | 'quarter'>('month');

    // Sync selectedYear with externalYear
    useEffect(() => {
        setSelectedYear(externalYear);
    }, [externalYear]);

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
    // --- Budget Drill-Down State ---
    const [budgetDrillModal, setBudgetDrillModal] = useState<{ categoryId: string, categoryName: string, month: number, entries: any[], loading: boolean, drillStep: 'company' | 'costcenter' | 'detail', drillCompany: string | null, drillCC: string | null } | null>(null);

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
        try {
            const companyParam = selectedCompany.includes('DEFAULT') ? 'ALL' : selectedCompany.join(',');
            const res = await fetch(`/api/transactions?categoryId=${categoryId}&month=${month}&year=${selectedYear}&costCenterId=${selectedCostCenter.join(',')}&tenantId=${companyParam}&viewMode=${viewMode}&t=${Date.now()}`);
            const data = await res.json();
            if (data.success) {
                setTransactions(data.transactions);
            }
        } catch (error) {
            console.error("Failed to fetch transactions", error);
        } finally {
            setLoadingTransactions(false);
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
        const map = new Map<string, number>();
        transactions.forEach((tx: any) => {
            const comp = tx.tenantName || 'Geral';
            map.set(comp, (map.get(comp) || 0) + (parseFloat(tx.value) || 0));
        });
        return Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    }, [transactions]);

    const groupedByCostCenter = useMemo(() => {
        if (!transactions || transactions.length === 0 || !transactionSelectedCompany) return [];
        const filtered = transactions.filter((tx: any) => (tx.tenantName || 'Geral') === transactionSelectedCompany);
        const map = new Map<string, number>();
        filtered.forEach((tx: any) => {
            const ccStr = (tx.costCenters && tx.costCenters.length > 0) ? tx.costCenters[0].nome : 'Geral';
            map.set(ccStr, (map.get(ccStr) || 0) + (parseFloat(tx.value) || 0));
        });
        return Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
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
                const setupRes = await fetch('/api/setup?t=' + Date.now(), { cache: 'no-store' });
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
    }, [refreshKey]);

    // 2. Data Effect
    useEffect(() => {
        const loadValues = async () => {
            setLoading(true);
            setError(null);
            try {
                const companyParam = selectedCompany.includes('DEFAULT') ? 'ALL' : selectedCompany.join(',');
                const [budgetRes, syncRes] = await Promise.all([
                    fetch(`/api/budgets?costCenterId=${selectedCostCenter.join(',')}&tenantId=${companyParam}&year=${selectedYear}&t=${Date.now()}`, { cache: 'no-store' }),
                    fetch(`/api/sync?costCenterId=${selectedCostCenter.join(',')}&tenantId=${companyParam}&year=${selectedYear}&viewMode=${viewMode}&t=${Date.now()}`, { cache: 'no-store' })
                ]);

                const budgetData = await budgetRes.json();
                const syncData = await syncRes.json();

                if (budgetData.success) {
                    setIsCCLocked(budgetData.isCCLocked || false);
                    setRadarLocks(budgetData.radarLocks || []);
                    const values: Record<string, { amount: number, radarAmount: number | null, isLocked: boolean, observation: string | null }> = {};


                    budgetData.data.forEach((item: any) => {
                        // Map 1-12 from DB to 0-11 for UI
                        values[`${item.categoryId}-${item.month - 1}`] = {
                            amount: item.amount || 0,
                            radarAmount: (item.radarAmount !== undefined && item.radarAmount !== null) ? item.radarAmount : null,
                            isLocked: item.isLocked || false,
                            observation: item.observation || null
                        };
                    });
                    setBudgetValues(values);
                }

                if (syncData.success && syncData.realizedValues) {
                    setRealizedValues(syncData.realizedValues);
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

    // --- HIERARCHY BUILDER ---
    const treeRoots = useMemo(() => {
        const map = new Map<string, CategoryNode>();
        const potentialRoots: CategoryNode[] = [];
        const codeMap = new Map<string, CategoryNode>();
        const nameMap = new Map<string, CategoryNode>();

        const validCategories = selectedCompany.includes('DEFAULT') 
            ? categories 
            : categories.filter((c: any) => selectedCompany.includes(c.tenantId || ''));

        // 1. Initial Load
        validCategories.forEach((cat: any) => {
            // V47.142 - Strict Key: Isolation + Identity
            const cleanCode = (cat.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
            const uniqueKey = `${cat.tenantId}|${cat.type}|${cleanCode}|${cat.name}`;

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
            { code: '02.1', name: '02.1 - Tributos', parentCode: null },
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
            if (node.isSynthetic) return;
            const code = node.code || '';

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
                // RULE: Only consider items with 3 segments (Ex: 01.1.1) as data points.
                // 1 or 2 segments (Ex: 01, 01.1) are treated as summaries calculated by the system.
                const codeSegments = (node.code || '').split('.').filter(Boolean).length;
                const isDataPoint = codeSegments === 3;

                if (!node.isSynthetic && isDataPoint) {
                    const sign = negated ? -1 : 1;
                    const idsToRead = node.id.split(',');
                    let sumB = 0, sumR = 0, sumRadar = 0;

                    for (const rawId of idsToRead) {
                        const bData = budgetValues[`${rawId}-${i}`] || { amount: 0, radarAmount: 0, isLocked: false };
                        sumB += bData.amount;
                        sumR += (realizedValues[`${rawId}-${i}`] || 0);
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
    }, [treeRoots, budgetValues, realizedValues, viewMode]);

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

                const entry: any = {
                    categoryId: targetId,
                    month: i,
                    year: selectedYear,
                    costCenterId: selectedCostCenter[0],
                    tenantId: targetCompanyParam === 'ALL' ? (categories.find(c => c.id === targetId)?.tenantId || 'ALL') : targetCompanyParam,
                    observation: modalObservation.trim() || null
                };

                if (isBudget) {
                    if (!lockedMonths[i] || userRole === 'MASTER') entry.amount = numericVal;
                    if (userRole === 'MASTER') entry.isLocked = lockedMonths[i];
                } else {
                    entry.radarAmount = numericVal;
                }
                
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

    const renderNode = (node: CategoryNode) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedRows.has(node.id);
        const totals = nodeTotals.get(node.id) || { budget: new Array(12).fill(0), realized: new Array(12).fill(0), radar: new Array(12).fill(0) };
        const isEditable = !hasChildren && !node.isSynthetic;

        return (
            <React.Fragment key={node.id}>
                <tr>
                    <td 
                        className={`sticky-col spreadsheet-indent-${node.level}`}
                        onClick={() => hasChildren && toggleRow(node.id)}
                        style={{ cursor: hasChildren ? 'pointer' : 'default', fontWeight: hasChildren ? 700 : 500 }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', color: hasChildren ? '#0f172a' : '#475569', paddingLeft: `${node.level * 2.25}rem` }}>
                            {hasChildren && <span style={{ marginRight: '0.4rem', fontSize: '0.7rem', color: '#3b82f6' }}>{isExpanded ? '▼' : '▶'}</span>}
                            {!hasChildren && <span style={{ width: '1.1rem' }}></span>}
                            {node.name}
                        </div>
                    </td>
                    {(viewPeriod === 'month' ? MONTHS : [1, 2, 3, 4]).map((_, i) => {
                        let bVal = 0, rVal = 0, rdVal = 0;
                        let isLocked = false;

                        if (viewPeriod === 'month') {
                            bVal = totals.budget[i];
                            rVal = totals.realized[i];
                            rdVal = totals.radar[i];
                            isLocked = isCCLocked || node.id.split(',').some(id => (budgetValues[`${id}-${i}`] || {}).isLocked);
                            const rLock = radarLocks.find(l => l.tenantId === selectedCompany[0] && l.month === (i + 1));
                            const isRadarLocked = isLocked || (rLock?.isLocked) || (rLock?.deadline && new Date() > new Date(rLock.deadline));
                            (node as any)._isRadarLocked = isRadarLocked;
                        } else {
                            for (let m = i * 3; m < i * 3 + 3; m++) {
                                bVal += totals.budget[m];
                                rVal += totals.realized[m];
                                rdVal += totals.radar[m];
                                if (isCCLocked || node.id.split(',').some(id => (budgetValues[`${id}-${m}`] || {}).isLocked)) isLocked = true;
                            }
                            const anyRadarLocked = [0, 1, 2].some(offset => {
                                const monthNum = (i * 3) + offset + 1;
                                const rLock = radarLocks.find(l => l.tenantId === selectedCompany[0] && l.month === monthNum);
                                return isLocked || (rLock?.isLocked) || (rLock?.deadline && new Date() > new Date(rLock.deadline));
                            });
                            (node as any)._isRadarLocked = anyRadarLocked;
                        }

                        const isCellEditable = isEditable && viewPeriod === 'month';

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
                                        color: bVal < 0 ? '#dc2626' : '#475569'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                                        {isLocked && <span style={{ fontSize: '0.6rem' }}>🔒</span>}
                                        {formatCurrency(bVal)}
                                    </div>
                                </td>
                                <td
                                    className="spreadsheet-value"
                                    onClick={() => isCellEditable && openBudgetModal(node.id, node.name, i, 'radar')}
                                    style={{ 
                                        cursor: isCellEditable ? 'pointer' : 'default',
                                        color: rdVal < 0 ? '#dc2626' : '#334155'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end', fontWeight: 600 }}>
                                        {(node as any)._isRadarLocked && <span style={{ fontSize: '0.6rem' }}>🔒</span>}
                                        {formatCurrency(rdVal)}
                                    </div>
                                </td>
                                <td 
                                    className="spreadsheet-value"
                                    onClick={() => viewPeriod === 'month' && handleCellClick(node.id, i, node.name)} 
                                    style={{ 
                                        cursor: viewPeriod === 'month' ? 'pointer' : 'default',
                                        color: rVal < 0 ? '#dc2626' : 'var(--accent-blue)',
                                        fontWeight: 700 
                                    }}
                                >
                                    {formatCurrency(rVal)}
                                </td>
                            </React.Fragment>
                        );
                    })}
                </tr>
                {isExpanded && node.children.map(child => renderNode(child))}
            </React.Fragment>
        );
    };

    const renderSummaryRow = (label: string, validx: keyof ReturnType<typeof dreStructure.calculateTotals>, isBold = false, groupId?: string) => {
        const isGroupExpanded = groupId ? expandedGroups.has(groupId) : true;
        const isLucroLiquido = label.includes('LUCRO LÍQUIDO');

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
                        color: isLucroLiquido ? '#ffffff !important' : '#1e293b',
                        background: isLucroLiquido ? '#2563eb !important' : undefined,
                        fontSize: '0.75rem',
                        zIndex: 25 // Ensure it stays above normal rows
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', opacity: 1, visibility: 'visible' }}>
                        {groupId && (
                            <span style={{ marginRight: '0.5rem', fontSize: '0.7rem' }}>
                                {isGroupExpanded ? '▼' : '▶'}
                            </span>
                        )}
                        {!groupId && <span style={{ width: '1.2rem' }}></span>}
                        <span style={{ color: 'inherit' }}>{label}</span>
                    </div>
                </td>
                {(viewPeriod === 'month' ? MONTHS : [1, 2, 3, 4]).map((_, i) => {
                    const sums = precomputedDreTotals[i];
                    const rowData = sums[validx];
                    let budgetVal = 0, realizedVal = 0, radarVal = 0;
                    if (rowData) {
                        budgetVal = (rowData as any).b || 0;
                        realizedVal = (rowData as any).r || 0;
                        radarVal = (rowData as any).rd || 0;
                    }

                    if (viewPeriod === 'quarter') {
                        budgetVal = 0; realizedVal = 0; radarVal = 0;
                        for (let m = i * 3; m < i * 3 + 3; m++) {
                            const monthTotal = precomputedDreTotals[m];
                            budgetVal += monthTotal[validx].b;
                            realizedVal += monthTotal[validx].r;
                            radarVal += monthTotal[validx].rd;
                        }
                    }

                    const bColor = budgetVal < 0 ? '#ef4444' : (isLucroLiquido ? '#fff' : '#64748b');
                    const rdColor = radarVal < 0 ? '#ef4444' : (isLucroLiquido ? '#fff' : 'var(--text-primary)');
                    const rColor = realizedVal < 0 ? '#ef4444' : (isLucroLiquido ? '#fff' : 'var(--accent-blue)');

                    return (
                        <React.Fragment key={i}>
                            <td className="spreadsheet-value" style={{ borderLeft: '2px solid #cbd5e1', color: bColor, fontWeight: 700, background: isLucroLiquido ? '#2563eb' : undefined }}>{formatCurrency(budgetVal)}</td>
                            <td className="spreadsheet-value" style={{ color: rdColor, fontWeight: 700, background: isLucroLiquido ? '#2563eb' : undefined }}>{formatCurrency(radarVal)}</td>
                            <td className="spreadsheet-value" style={{ color: rColor, fontWeight: 800, background: isLucroLiquido ? '#2563eb' : undefined }}>{formatCurrency(realizedVal)}</td>
                        </React.Fragment>
                    );
                })}
            </tr>
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
        if (current.includes('DEFAULT') && current.length === 1) return 'Geral (Todos)';
        const names = filteredCostCenters.filter(c => current.includes(c.id)).map(c => c.name);
        if (names.length === 0) return 'Geral (Todos)';
        if (names.length === 1) return names[0];
        if (names.length === filteredCostCenters.length) return 'Todos Selecionados';
        return `${names.length} selecionados`;
    };

    const getSelectedCompanyNames = (current: string[]) => {
        if (current.includes('DEFAULT') && current.length === 1) return 'Geral (Todas)';
        const names = companies.filter(c => current.includes(c.id)).map(c => c.name);
        if (names.length === 0) return 'Geral (Todas)';
        if (names.length === 1) return names[0];
        if (names.length === companies.length) return 'Todas Selecionadas';
        return `${names.length} selecionadas`;
    };

    return (
        <>
            {/* SECTION 2: FILTERS & CONTROLS - SINGLE ROW PREMIUM */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 2rem 0', width: '100%', flexWrap: 'nowrap', gap: '1rem', background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', border: '1px solid var(--border-subtle)' }}>
                
                {/* LEFT: Empresa & Centro de Custo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Empresa Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Empresa</label>
                        <div style={{ position: 'relative', minWidth: '200px' }}>
                            <div
                                onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                                className="premium-input"
                                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', paddingRight: '0.75rem', height: 'auto', minHeight: '32px' }}
                            >
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem', fontWeight: 600 }}>{getSelectedCompanyNames(pendingCompany)}</span>
                                <span style={{ fontSize: '0.6rem', opacity: 0.5, marginLeft: '0.5rem' }}>▼</span>
                            </div>

                            {companyDropdownOpen && (
                                <>
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }} onClick={() => setCompanyDropdownOpen(false)} />
                                    <div className="glass-card" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 40, maxHeight: '350px', overflowY: 'auto', background: 'var(--bg-surface)', padding: '0.5rem 0' }}>
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
                                onClick={() => setCostCenterDropdownOpen(!costCenterDropdownOpen)}
                                className="premium-input"
                                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', paddingRight: '0.75rem', height: 'auto', minHeight: '32px' }}
                            >
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem', fontWeight: 600 }}>{getSelectedCostCenterNames(pendingCostCenter)}</span>
                                <span style={{ fontSize: '0.6rem', opacity: 0.5, marginLeft: '0.5rem' }}>▼</span>
                            </div>

                            {costCenterDropdownOpen && (
                                <>
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }} onClick={() => setCostCenterDropdownOpen(false)} />
                                    <div className="glass-card" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 40, maxHeight: '350px', overflowY: 'auto', background: 'var(--bg-surface)', padding: '0.5rem 0' }}>
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

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={applyFilter} className="btn btn-primary" style={{ padding: '0 1rem', height: '32px', fontSize: '0.75rem' }}>Filtrar</button>
                        <button onClick={clearFilter} className="btn btn-secondary" style={{ padding: '0 1rem', height: '32px', fontSize: '0.75rem' }}>Limpar</button>
                    </div>
                </div>

                <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }} />

                {/* RIGHT: Análises & Toggles */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    
                    {/* Análises Checkboxes Premium */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.2rem' }}>Análises</span>

                        {[
                            { label: 'Análise Vertical', state: showAV, setState: setShowAV },
                            { label: 'AH (Orçado x Real)', state: showAH, setState: setShowAH },
                            { label: 'AH (Radar x Real)', state: showAR, setState: setShowAR },
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
                        <div className="toggle-group" style={{ height: '30px', padding: '2px' }}>
                            <button onClick={() => setViewMode('competencia')} className={`toggle-btn ${viewMode === 'competencia' ? 'active' : ''}`} style={{ padding: '0 0.75rem', fontSize: '0.7rem' }}>Competência</button>
                            <button onClick={() => setViewMode('caixa')} className={`toggle-btn ${viewMode === 'caixa' ? 'active' : ''}`} style={{ padding: '0 0.75rem', fontSize: '0.7rem' }}>Caixa</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="spreadsheet-container" style={{ minHeight: '300px', position: 'relative' }}>
                {(loading || isExternalLoading) && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255, 255, 255, 0.4)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(1px)' }}>
                        <div className="spinner" />
                        <span style={{ marginTop: '0.5rem', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.75rem' }}>CARREGANDO...</span>
                    </div>
                )}
                <table className="spreadsheet-table">
                    <thead>
                        <tr>
                            <th className="sticky-col" style={{ minWidth: '400px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0 0.5rem' }}>
                                    <button
                                        onClick={handleToggleAll}
                                        className="spreadsheet-btn-expand"
                                        style={{ background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                    >
                                        {isAnyExpanded ? '−' : '+'}
                                    </button>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>ESTRUTURA DRE — {selectedYear}</span>
                                </div>
                            </th>
                            {(viewPeriod === 'month' ? MONTHS : ['1º Tri', '2º Tri', '3º Tri', '4º Tri']).map((c, i) => {
                                return (
                                    <th key={i} colSpan={3} style={{ textAlign: 'center', padding: '0.4rem', borderLeft: '2px solid #cbd5e1', fontSize: '0.7rem' }}>
                                        {c}
                                    </th>
                                );
                            })}
                        </tr>
                        <tr>
                            <th className="sticky-col"></th>
                            {(viewPeriod === 'month' ? MONTHS : [1, 2, 3, 4]).map((_, i) => (
                                <React.Fragment key={i}>
                                    <th style={{ fontSize: '0.6rem', color: '#64748b', borderLeft: '2px solid #cbd5e1', textAlign: 'center', padding: '0.2rem' }}>ORÇ</th>
                                    <th style={{ fontSize: '0.6rem', color: '#64748b', textAlign: 'center', padding: '0.2rem' }}>RADAR</th>
                                    <th style={{ fontSize: '0.6rem', color: '#64748b', textAlign: 'center', padding: '0.2rem' }}>REAL</th>
                                </React.Fragment>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {renderSummaryRow('01. RECEITA BRUTA', 'vRev', true, 'rev')}
                        {expandedGroups.has('rev') && dreStructure.buckets.rev.map(root => renderNode(root))}
                         {renderSummaryRow('02. TRIBUTO SOBRE FATURAMENTO', 'vTaxes', true, 'taxes')}
                        {expandedGroups.has('taxes') && dreStructure.buckets.taxes.map(root => renderNode(root))}
                        {renderSummaryRow('(=) RECEITA LÍQUIDA', 'vRecLiq', true)}
                        {renderSummaryRow('03. CUSTO OPERACIONAL', 'vCosts', true, 'costs')}
                        {expandedGroups.has('costs') && dreStructure.buckets.costs.map(root => renderNode(root))}
                        {renderSummaryRow('(=) MARGEM BRUTA', 'vGrossMarg', true)}
                        {renderSummaryRow('04. DESPESA OPERACIONAL', 'vOpExp', true, 'opExp')}
                        {expandedGroups.has('opExp') && dreStructure.buckets.opExp.map(root => renderNode(root))}
                        {renderSummaryRow('(=) MARGEM DE CONTRIBUIÇÃO', 'vContribMarg', true)}
                        {renderSummaryRow('05. DESPESAS ADMINISTRATIVAS', 'vAdminExp', true, 'adminExp')}
                        {expandedGroups.has('adminExp') && dreStructure.buckets.adminExp.map(root => renderNode(root))}
                        {renderSummaryRow('(=) EBITDA', 'vEbitda', true)}
                        {renderSummaryRow('06. DESPESAS FINANCEIRAS', 'vFin', true, 'fin')}
                        {expandedGroups.has('fin') && dreStructure.buckets.fin.map(root => renderNode(root))}
                        {renderSummaryRow('(=) LUCRO LÍQUIDO', 'vNetProfit', true)}
                    </tbody>
                </table>
            </div>
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
                            const cc = costCenters.find(c => c.id === e.costCenterId);
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
                                                {drillStep === 'company' && <><th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>Empresa</th><th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>Orçado</th></>}
                                                {drillStep === 'costcenter' && <><th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>Centro de Custo</th><th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>Orçado</th></>}
                                                {drillStep === 'detail' && <><th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>Empresa</th><th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>Centro de Custo</th><th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>Orçado</th></>}
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
                                                const ccItem = costCenters.find(c => c.id === e.costCenterId);
                                                return (
                                                    <tr key={iVal} style={{ borderBottom: '1px solid #f1f5f9', background: iVal % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                        <td style={{ padding: '0.65rem 0.75rem', color: '#334155' }}>{compItem?.name || e.tenantId}</td>
                                                        <td style={{ padding: '0.65rem 0.75rem', color: '#64748b' }}>{ccItem?.name || (e.costCenterId ? e.costCenterId : 'Geral')}</td>
                                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#1e293b', fontWeight: 600 }}>{formatCurrency(e.amount)}</td>
                                                    </tr>
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
                                                    <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>Sub-Total</th>
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
                                                    <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>Sub-Total</th>
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
                                                        <td style={{ padding: '0.5rem' }}>{new Date(tx.date).toLocaleDateString('pt-BR')}</td>
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
                        <div className="modal-content" style={{ maxWidth: '600px', backgroundColor: '#fff' }}>
                            <div style={{ padding: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>
                                            {budgetModal.type === 'budget' ? 'Orçado' : 'Radar'}: {budgetModal.categoryName}
                                        </h3>
                                    </div>
                                    <button onClick={() => setBudgetModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#94a3b8', padding: '0.5rem' }}>✕</button>
                                </div>

                                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-start' }}>
                                    <button 
                                        onClick={replicateValue}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            padding: '0.5rem 1rem',
                                            backgroundColor: '#f1f5f9',
                                            color: '#2563eb',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
                                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                                    >
                                        <span>⏩ Preencher meses seguintes</span>
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                    {MONTHS.map((month, idx) => {
                                        const isLocked = lockedMonths[idx];
                                        const canEdit = !isLocked || userRole === 'MASTER';
                                        
                                        return (
                                            <div key={idx} style={{ 
                                                display: 'flex', 
                                                flexDirection: 'column', 
                                                gap: '0.4rem',
                                                opacity: !canEdit ? 0.6 : 1,
                                                border: activeMonth === idx ? '1px solid #2563eb' : '1px solid transparent',
                                                padding: '0.5rem',
                                                borderRadius: '12px',
                                                backgroundColor: activeMonth === idx ? '#eff6ff' : 'transparent',
                                                transition: 'all 0.2s'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{month}</label>
                                                    {isLocked && <span title="Mês bloqueado para edição" style={{ cursor: 'help' }}>🔒</span>}
                                                </div>
                                                <div style={{ position: 'relative' }}>
                                                    <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem' }}>R$</span>
                                                    <input
                                                        type="text"
                                                        value={modalValues[idx]}
                                                        disabled={!canEdit}
                                                        onFocus={() => setActiveMonth(idx)}
                                                        onChange={(e) => {
                                                            const next = [...modalValues];
                                                            next[idx] = e.target.value;
                                                            setModalValues(next);
                                                        }}
                                                        placeholder="0,00"
                                                        className="premium-input"
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

                                <div style={{ marginBottom: '2rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Observação do Item</label>
                                    <textarea
                                        value={modalObservation}
                                        onChange={(e) => setModalObservation(e.target.value)}
                                        placeholder="Adicione detalhes sobre este lançamento..."
                                        className="premium-input"
                                        style={{ width: '100%', minHeight: '80px', resize: 'vertical', fontSize: '0.9rem' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
                                    <button onClick={() => setBudgetModal(null)} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', color: '#64748b', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>Cancelar</button>
                                    <button 
                                        disabled={isSavingBudget || (lockedMonths.every(l => l) && userRole !== 'MASTER')} 
                                        onClick={handleSaveBudget} 
                                        style={{ 
                                            padding: '0.75rem 2rem', 
                                            backgroundColor: (lockedMonths.every(l => l) && userRole !== 'MASTER') ? '#94a3b8' : '#2563eb', 
                                            color: '#fff', 
                                            border: 'none', 
                                            borderRadius: '8px', 
                                            fontWeight: 700, 
                                            cursor: (isSavingBudget || (lockedMonths.every(l => l) && userRole !== 'MASTER')) ? 'default' : 'pointer', 
                                            fontSize: '0.95rem', 
                                            minWidth: '120px', 
                                            opacity: isSavingBudget ? 0.7 : 1 
                                        }}
                                    >
                                        {isSavingBudget ? 'Salvando...' : 'Salvar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            <div style={{ height: '2rem' }}></div> {/* Spacer after card */}
        </>
    );
}
