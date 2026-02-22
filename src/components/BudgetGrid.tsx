'use client';
// V47.130 - Hierarchical Indentation Fix (Recursive Leveling + Deep Padding)

import React, { useState, useMemo, useEffect } from 'react';
import { MONTHS, MOCK_COST_CENTERS } from '@/lib/mock-data';

interface BudgetGridProps {
    refreshKey?: number;
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
}

export default function BudgetGrid({ refreshKey = 0 }: BudgetGridProps) {
    const [budgetValues, setBudgetValues] = useState<Record<string, number>>({});
    const [realizedValues, setRealizedValues] = useState<Record<string, number>>({});
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); // New state for main groups
    const [loading, setLoading] = useState(true);
    const [selectedCostCenter, setSelectedCostCenter] = useState('DEFAULT');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [viewMode, setViewMode] = useState<'caixa' | 'competencia'>('competencia');

    // --- Transaction Drill-down State ---
    const [selectedCell, setSelectedCell] = useState<{ categoryId: string, month: number, categoryName: string } | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);

    const handleCellClick = async (categoryId: string, month: number, categoryName: string) => {
        setSelectedCell({ categoryId, month, categoryName });
        setLoadingTransactions(true);
        setTransactions([]);
        try {
            const res = await fetch(`/api/transactions?categoryId=${categoryId}&month=${month}&year=${selectedYear}&costCenterId=${selectedCostCenter}`);
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
    };

    const [categories, setCategories] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>(MOCK_COST_CENTERS);
    const [error, setError] = useState<string | null>(null);

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
                const [budgetRes, syncRes] = await Promise.all([
                    fetch(`/api/budgets?costCenterId=${selectedCostCenter}&year=${selectedYear}&t=${Date.now()}`, { cache: 'no-store' }),
                    fetch(`/api/sync?costCenterId=${selectedCostCenter}&year=${selectedYear}&viewMode=${viewMode}&t=${Date.now()}`, { cache: 'no-store' })
                ]);

                const budgetData = await budgetRes.json();
                const syncData = await syncRes.json();

                if (budgetData.success) {
                    const values: Record<string, number> = {};
                    budgetData.data.forEach((item: any) => {
                        values[`${item.categoryId}-${item.month}`] = item.amount;
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
    }, [selectedCostCenter, selectedYear, refreshKey, viewMode]);

    // --- HIERARCHY BUILDER ---
    const treeRoots = useMemo(() => {
        const map = new Map<string, CategoryNode>();
        const potentialRoots: CategoryNode[] = [];
        const codeMap = new Map<string, CategoryNode>();

        // 1. Initial Load
        categories.forEach(cat => {
            const codeMatch = cat.name.match(/^([\d.]+)/);
            const rawCode = codeMatch ? codeMatch[1] : '';
            if (rawCode.startsWith('2.3') || rawCode.startsWith('2.4')) return;

            let effectiveName = cat.name;
            let effectiveCode = rawCode;

            if (rawCode.startsWith('02') || (rawCode.startsWith('2') && !cat.name.toLowerCase().includes('tributo') && !rawCode.startsWith('2.1'))) {
                if (rawCode.startsWith('02')) {
                    let suffix = rawCode.replace(/^0?2/, '');
                    if (suffix.startsWith('.')) suffix = suffix.substring(1);
                    effectiveCode = suffix ? `01.2.${suffix}` : '01.2';
                    effectiveName = cat.name.replace(rawCode, effectiveCode).replace('01.2. ', '01.2 - ');
                    if (effectiveCode === '01.2') effectiveName = '01.2 - Receitas de Vendas';
                }
            }

            // Force naming for 03.1 to 03.9 to maintain consistency even if API brings them differently
            if (rawCode.match(/^03\.[1-9]$/)) {
                if (rawCode === '03.1') effectiveName = '03.1 Salarios e Remuneração';
                if (rawCode === '03.2') effectiveName = '03.2 Encargos Sociais';
                if (rawCode === '03.3') effectiveName = '03.3 Beneficios';
                if (rawCode === '03.4') effectiveName = '03.4 Diárias';
                if (rawCode === '03.5') effectiveName = '03.5 SSMA';
                if (rawCode === '03.6') effectiveName = '03.6 Materiais';
                if (rawCode === '03.7') effectiveName = '03.7 Equipamentos';
                if (rawCode === '03.8') effectiveName = '03.8 Comunicação/Sistema/Licenças';
                if (rawCode === '03.9') effectiveName = '03.9 Custo com Veiculo';
            }

            // Force naming for 04.1 to 04.8
            if (rawCode.match(/^04\.[1-8]$/)) {
                if (rawCode === '04.1') effectiveName = '04.1 Salarios e Remuneração';
                if (rawCode === '04.2') effectiveName = '04.2 Encargos Sociais';
                if (rawCode === '04.3') effectiveName = '04.3 Beneficios';
                if (rawCode === '04.4') effectiveName = '04.4 SSMA';
                if (rawCode === '04.5') effectiveName = '04.5 Viagens';
                if (rawCode === '04.6') effectiveName = '04.6 Custo com Veículos';
                if (rawCode === '04.7') effectiveName = '04.7 Cartão Corporativo';
                if (rawCode === '04.8') effectiveName = '04.8 Serviços Terceirizados';
            }

            // Force naming for 05.1 to 05.13
            if (rawCode.match(/^05\.([1-9]|1[0-3])$/)) {
                if (rawCode === '05.1') effectiveName = '05.1 Salario e Remuneração';
                if (rawCode === '05.2') effectiveName = '05.2 Encargos Sociais';
                if (rawCode === '05.3') effectiveName = '05.3 Beneficios';
                if (rawCode === '05.4') effectiveName = '05.4 SSMA';
                if (rawCode === '05.5') effectiveName = '05.5 Viagens';
                if (rawCode === '05.6') effectiveName = '05.6 Despesa com Socios';
                if (rawCode === '05.7') effectiveName = '05.7 Serviços Contratados';
                if (rawCode === '05.8') effectiveName = '05.8 Despesa Comercial/Marketing';
                if (rawCode === '05.9') effectiveName = '05.9 Despesa com Estrutura';
                if (rawCode === '05.10') effectiveName = '05.10 Despesa Copa e Cozinha';
                if (rawCode === '05.11') effectiveName = '05.11 Despesa com Veículos';
                if (rawCode === '05.12') effectiveName = '05.12 Despesa de Informatica';
                if (rawCode === '05.13') effectiveName = '05.13 Taxas e Despesas Legais';
            }

            // Force naming for 06.1 to 06.8
            if (rawCode.match(/^06\.[1-8]$/)) {
                if (rawCode === '06.1') effectiveName = '06.1 Entradas Financeiras';
                if (rawCode === '06.2') effectiveName = '06.2 Saidas Financeiras';
                if (rawCode === '06.3') effectiveName = '06.3 Financiamento';
                if (rawCode === '06.4') effectiveName = '06.4 Juros/Multas';
                if (rawCode === '06.5') effectiveName = '06.5 Passivo Trabalhista';
                if (rawCode === '06.6') effectiveName = '06.6 Depreciação';
                if (rawCode === '06.7') effectiveName = '06.7 Cartão de Credito';
                if (rawCode === '06.8') effectiveName = '06.8 PDD';
            }

            const node: CategoryNode = {
                ...cat,
                name: effectiveName,
                code: effectiveCode,
                children: [],
                level: 0,
                isSynthetic: false
            };
            map.set(cat.id, node);
            if (effectiveCode) codeMap.set(effectiveCode, node);
        });

        const syntheticParents = [
            { code: '01.1', name: 'RECEITA DE SERVIÇOS', parentCode: '01' },
            { code: '01.2', name: 'RECEITAS DE VENDAS', parentCode: '01' },
            { code: '02.1', name: 'TRIBUTOS', parentCode: null },
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

            // Fix: Directly map any deep code to its closest synthetic parent if it starts with a match
            // e.g., 03.3.2 -> matches synthetic parent '03.3'
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

            // Fallback for codes like 03.3.2 if the above didn't catch (e.g., if codeMap doesn't have intermediate levels like 03.3.2 but has 03.3)
            if (!parentFound && code.match(/^(0[3456])\.(\d+)\./)) {
                const match = code.match(/^(0[3456])\.(\d+)/);
                if (match) {
                    const synthParentCode = match[0];
                    const synthParent = codeMap.get(synthParentCode);
                    if (synthParent && !synthParent.children.includes(node)) {
                        synthParent.children.push(node);
                    }
                }
            }
        });

        // 4. Roots Retrieval
        const allChildren = new Set<string>();
        map.forEach(node => node.children.forEach(c => allChildren.add(c.id)));

        map.forEach(node => {
            if (!allChildren.has(node.id)) {
                if ((node.code === '01.1' || node.code === '01.2') && !codeMap.has('01')) {
                    const p01 = { id: `synth-01`, name: 'RECEITAS', parentId: null, children: [node], level: 0, code: '01', isSynthetic: true };
                    map.set(p01.id, p01);
                    codeMap.set('01', p01);
                    allChildren.add(node.id);
                    potentialRoots.push(p01);
                    return;
                } else if ((node.code === '01.1' || node.code === '01.2') && codeMap.has('01')) {
                    const p01 = codeMap.get('01')!;
                    if (!p01.children.includes(node)) p01.children.push(node);
                    allChildren.add(node.id);
                    return;
                }
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

        // 6. FIX LEVELS & SORT
        // Recursive Level Set (CRITICAL FIX for Indentation)
        const recalculateLevels = (nodes: CategoryNode[], lvl: number) => {
            // Sort children first to ensure order
            nodes.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));

            nodes.forEach(n => {
                n.level = lvl;
                recalculateLevels(n.children, lvl + 1);
            });
        };
        recalculateLevels(finalRoots, 0);

        return finalRoots;

    }, [categories]);

    // --- RECURSIVE TOTALS ---
    const nodeTotals = useMemo(() => {
        const totalsMap = new Map<string, { budget: number[], realized: number[] }>();

        // Categories that represent income inside an expense group - their values are negated
        // so they REDUCE the group total instead of increasing it.
        // 06.1 = Entradas Financeiras (inside DESPESAS FINANCEIRAS, but it's actually income).
        const isNegatedCode = (code: string) => code.startsWith('06.1');

        const calculateNode = (node: CategoryNode, parentNegated = false) => {
            // De-dup children in case they were pushed multiple times
            const uniqueChildren = Array.from(new Set(node.children.map(c => c.id))).map(id => node.children.find(c => c.id === id)!);
            node.children = uniqueChildren;

            const negated = parentNegated || isNegatedCode(node.code || '');

            const childrenTotals = uniqueChildren.map(child => calculateNode(child, negated));
            const myBudget = new Array(12).fill(0);
            const myRealized = new Array(12).fill(0);

            childrenTotals.forEach(childTotal => {
                for (let i = 0; i < 12; i++) {
                    myBudget[i] += childTotal.budget[i];
                    myRealized[i] += childTotal.realized[i];
                }
            });

            for (let i = 0; i < 12; i++) {
                if (!node.isSynthetic) {
                    const sign = negated ? -1 : 1;
                    myBudget[i] += sign * (budgetValues[`${node.id}-${i}`] || 0);
                    myRealized[i] += sign * (realizedValues[`${node.id}-${i}`] || 0);
                }
            }

            totalsMap.set(node.id, { budget: myBudget, realized: myRealized });
            return { budget: myBudget, realized: myRealized };
        };

        treeRoots.forEach(root => calculateNode(root));
        return totalsMap;
    }, [treeRoots, budgetValues, realizedValues]);

    // --- DRE STRUCTURE ---
    const dreStructure = useMemo(() => {
        const sumRoots = (roots: CategoryNode[], monthIdx: number, type: 'budget' | 'realized') => {
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
                const vRev = { b: sumRoots(buckets.rev, monthIdx, 'budget'), r: sumRoots(buckets.rev, monthIdx, 'realized') };
                const vTaxes = { b: sumRoots(buckets.taxes, monthIdx, 'budget'), r: sumRoots(buckets.taxes, monthIdx, 'realized') };
                const vRecLiq = { b: vRev.b - Math.abs(vTaxes.b), r: vRev.r - Math.abs(vTaxes.r) };
                const vCosts = { b: sumRoots(buckets.costs, monthIdx, 'budget'), r: sumRoots(buckets.costs, monthIdx, 'realized') };
                const vGrossMarg = { b: vRecLiq.b - Math.abs(vCosts.b), r: vRecLiq.r - Math.abs(vCosts.r) };
                const vOpExp = { b: sumRoots(buckets.opExp, monthIdx, 'budget'), r: sumRoots(buckets.opExp, monthIdx, 'realized') };
                const vContribMarg = { b: vGrossMarg.b - Math.abs(vOpExp.b), r: vGrossMarg.r - Math.abs(vOpExp.r) };
                const vAdminExp = { b: sumRoots(buckets.adminExp, monthIdx, 'budget'), r: sumRoots(buckets.adminExp, monthIdx, 'realized') };
                const vEbitda = { b: vContribMarg.b - Math.abs(vAdminExp.b), r: vContribMarg.r - Math.abs(vAdminExp.r) };
                const vFin = { b: sumRoots(buckets.fin, monthIdx, 'budget'), r: sumRoots(buckets.fin, monthIdx, 'realized') };
                const vNetProfit = { b: vEbitda.b + vFin.b, r: vEbitda.r + vFin.r };

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

    const handleBudgetChange = async (categoryId: string, monthIndex: number, value: string) => {
        const numericValue = parseFloat(value.replace(/\D/g, '')) / 100 || 0;
        setBudgetValues(prev => ({ ...prev, [`${categoryId}-${monthIndex}`]: numericValue }));
        try { await fetch('/api/budgets', { method: 'POST', body: JSON.stringify({ categoryId, costCenterId: selectedCostCenter, year: selectedYear, month: monthIndex, amount: numericValue }), headers: { 'Content-Type': 'application/json' } }); } catch (e) { console.error("Save failed", e); }
    };

    const renderNode = (node: CategoryNode) => {
        const totals = nodeTotals.get(node.id) || { budget: new Array(12).fill(0), realized: new Array(12).fill(0) };
        const isExpanded = expandedRows.has(node.id);
        const hasChildren = node.children.length > 0;

        return (
            <React.Fragment key={node.id}>
                <tr onClick={() => hasChildren && toggleRow(node.id)} style={{ background: hasChildren ? '#fdfdfd' : 'white', cursor: hasChildren ? 'pointer' : 'default', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{
                        padding: '0.5rem',
                        // FIX: Base indent of 1.5rem (for Level 0) + 1.5rem per level
                        paddingLeft: `${1.5 + (node.level * 1.5)}rem`,
                        position: 'sticky', left: 0, background: hasChildren ? '#fdfdfd' : 'white', zIndex: 5, display: 'flex', alignItems: 'center', color: hasChildren ? '#1e293b' : '#334155', fontWeight: hasChildren ? 600 : 400, fontSize: '0.8rem'
                    }}>
                        {hasChildren && <span style={{ marginRight: '0.5rem', fontSize: '0.7rem', width: '1rem', color: '#94a3b8' }}>{isExpanded ? '▼' : '▶'}</span>}
                        {!hasChildren && <span style={{ width: '1.5rem' }}></span>}
                        {node.name}
                    </td>
                    {MONTHS.map((_, i) => (
                        <React.Fragment key={i}>
                            <td style={{ borderLeft: '1px solid #f1f5f9', padding: hasChildren ? '0.5rem' : '0' }}>
                                {hasChildren || node.isSynthetic ? (
                                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#64748b' }}>{formatCurrency(totals.budget[i])}</div>
                                ) : (
                                    <input type="text" placeholder="0,00" onBlur={(e) => handleBudgetChange(node.id, i, e.target.value)} defaultValue={totals.budget[i] ? totals.budget[i].toFixed(2) : ''} style={{ width: '100%', padding: '0.5rem', border: '1px solid transparent', textAlign: 'right', background: 'transparent', fontSize: '0.75rem', color: '#334155' }} />
                                )}
                            </td>
                            <td onClick={() => handleCellClick(node.id, i, node.name)} style={{ textAlign: 'right', padding: '0.5rem', color: '#3b82f6', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>{formatCurrency(totals.realized[i])}</td>
                        </React.Fragment>
                    ))}
                </tr>
                {isExpanded && node.children.map(child => renderNode(child))}
            </React.Fragment>
        );
    };

    const renderSummaryRow = (label: string, validx: keyof ReturnType<typeof dreStructure.calculateTotals>, isBold = false, bgColor = '#f8fafc', textColor = '#0f172a', groupId?: string) => {
        const isGroupExpanded = groupId ? expandedGroups.has(groupId) : true;

        return (
            <tr onClick={() => groupId && toggleGroup(groupId)} style={{ background: bgColor, borderBottom: '1px solid #e2e8f0', fontWeight: isBold ? 700 : 600, cursor: groupId ? 'pointer' : 'default', textTransform: 'uppercase' }}>
                <td style={{ padding: '0.75rem', position: 'sticky', left: 0, background: bgColor, zIndex: 10, color: textColor, fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
                    {groupId && (
                        <span style={{ marginRight: '0.5rem', fontSize: '0.8rem', width: '1rem', color: textColor, opacity: 0.7 }}>
                            {isGroupExpanded ? '▼' : '▶'}
                        </span>
                    )}
                    {!groupId && <span style={{ width: '1.5rem' }}></span>}
                    {label}
                </td>
                {MONTHS.map((_, i) => (
                    <React.Fragment key={i}>
                        <td style={{ textAlign: 'right', padding: '0.75rem', borderLeft: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem' }}>{formatCurrency(dreStructure.calculateTotals(i)[validx].b)}</td>
                        <td style={{ textAlign: 'right', padding: '0.75rem', color: textColor, fontSize: '0.8rem' }}>{formatCurrency(dreStructure.calculateTotals(i)[validx].r)}</td>
                    </React.Fragment>
                ))}
            </tr>
        );
    };

    return (
        <div style={{ position: 'relative', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', minHeight: '300px' }}>
            {loading && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255, 255, 255, 0.7)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ width: '40px', height: '40px', border: '4px solid #f1f5f9', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin-loading 1s linear infinite' }} />
                    <span style={{ marginTop: '1rem', color: '#1e293b', fontWeight: 600, fontSize: '0.9rem' }}>Atualizando...</span>
                    <style>{`@keyframes spin-loading { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
            )}
            <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Centro de Custo</label>
                    <select value={selectedCostCenter} onChange={(e) => setSelectedCostCenter(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', minWidth: '200px' }}>
                        {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </select>
                </div>
                {/* View Mode Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', borderRadius: '8px', padding: '0.25rem' }}>
                    <button
                        onClick={() => setViewMode('competencia')}
                        style={{
                            padding: '0.4rem 0.9rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: viewMode === 'competencia' ? '#2563eb' : 'transparent',
                            color: viewMode === 'competencia' ? 'white' : '#64748b',
                            transition: 'all 0.2s',
                        }}
                    >
                        📊 Competência
                    </button>
                    <button
                        onClick={() => setViewMode('caixa')}
                        style={{
                            padding: '0.4rem 0.9rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: viewMode === 'caixa' ? '#2563eb' : 'transparent',
                            color: viewMode === 'caixa' ? 'white' : '#64748b',
                            transition: 'all 0.2s',
                        }}
                    >
                        💵 Caixa
                    </button>
                </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '300px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 20, color: '#475569' }}>DRE Gerencial</th>
                        {MONTHS.map((m) => <th key={m} colSpan={2} style={{ textAlign: 'center', padding: '0.75rem 0.5rem', borderLeft: '1px solid #cbd5e1', color: '#475569' }}>{m}</th>)}
                    </tr>
                    <tr style={{ background: '#fff' }}>
                        <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 20, borderBottom: '1px solid #e2e8f0' }}></th>
                        {MONTHS.map((m) => (<React.Fragment key={m}><th style={{ fontSize: '0.7rem', color: '#94a3b8', borderLeft: '1px solid #f1f5f9', fontWeight: 500, paddingBottom: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Orçado</th><th style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500, paddingBottom: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Realizado</th></React.Fragment>))}
                    </tr>
                </thead>
                <tbody>
                    {renderSummaryRow('RECEITA BRUTA', 'vRev', true, '#eff6ff', '#1e3a8a', 'rev')}
                    {expandedGroups.has('rev') && dreStructure.buckets.rev.map(root => renderNode(root))}

                    {renderSummaryRow('TRIBUTO SOBRE FATURAMENTO', 'vTaxes', true, '#f1f5f9', '#64748b', 'taxes')}
                    {expandedGroups.has('taxes') && dreStructure.buckets.taxes.map(root => renderNode(root))}

                    {renderSummaryRow('(=) RECEITA LÍQUIDA', 'vRecLiq', true, '#e0f2fe', '#0369a1')}

                    {renderSummaryRow('CUSTO OPERACIONAL', 'vCosts', true, '#f1f5f9', '#64748b', 'costs')}
                    {expandedGroups.has('costs') && dreStructure.buckets.costs.map(root => renderNode(root))}

                    {renderSummaryRow('(=) MARGEM BRUTA', 'vGrossMarg', true, '#dcfce7', '#15803d')}

                    {renderSummaryRow('DESPESA OPERACIONAL', 'vOpExp', true, '#f1f5f9', '#64748b', 'opExp')}
                    {expandedGroups.has('opExp') && dreStructure.buckets.opExp.map(root => renderNode(root))}

                    {renderSummaryRow('(=) MARGEM DE CONTRIBUIÇÃO', 'vContribMarg', true, '#fff7ed', '#c2410c')}

                    {renderSummaryRow('DESPESAS ADMINISTRATIVAS', 'vAdminExp', true, '#f1f5f9', '#64748b', 'adminExp')}
                    {expandedGroups.has('adminExp') && dreStructure.buckets.adminExp.map(root => renderNode(root))}

                    {renderSummaryRow('(=) EBITDA', 'vEbitda', true, '#fef3c7', '#b45309')}

                    {renderSummaryRow('DESPESAS FINANCEIRAS', 'vFin', true, '#f1f5f9', '#64748b', 'fin')}
                    {expandedGroups.has('fin') && dreStructure.buckets.fin.map(root => renderNode(root))}

                    {renderSummaryRow('(=) LUCRO LÍQUIDO', 'vNetProfit', true, '#0f172a', '#fbbf24')}
                </tbody>
            </table>
            {selectedCell && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', width: '90vw', maxWidth: '1000px', height: '90vh', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{selectedCell.categoryName} - {MONTHS[selectedCell.month]}</h3>
                            <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>
                        {loadingTransactions ? <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Carregando lançamentos...</div> : transactions.length === 0 ? <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Nenhum lançamento encontrado.</div> : (
                            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Data</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Descrição</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Cliente/Forn.</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Valor</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.7rem', color: 'red' }}>Debug Values</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map((tx: any) => (
                                        <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.5rem' }}>{new Date(tx.date).toLocaleDateString('pt-BR')}</td>
                                            <td style={{ padding: '0.5rem' }}>{tx.description}</td>
                                            <td style={{ padding: '0.5rem' }}>{tx.customer || '-'}</td>
                                            <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{parseFloat(tx.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                            <td style={{ padding: '0.5rem', fontSize: '0.7rem', color: '#666' }}>{tx.debug_info}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
