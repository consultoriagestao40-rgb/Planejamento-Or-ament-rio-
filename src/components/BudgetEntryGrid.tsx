'use client';
// BudgetEntryGrid - Tela exclusiva de lançamento de orçamento por CC
// Versão limpa: apenas coluna ORÇADO, sem Radar, sem Realizado, sem filtros AH/AV

import React, { useState, useMemo, useEffect } from 'react';
import { MONTHS } from '@/lib/mock-data';

// Constante de módulo — fora do componente para evitar redeclaração
const CODE_NAMES: Record<string, string> = {
    '03.1': '03.1 Salarios e Remuneração', '03.2': '03.2 Encargos Sociais', '03.3': '03.3 Beneficios',
    '03.4': '03.4 Diárias', '03.5': '03.5 SSMA', '03.6': '03.6 Materiais',
    '03.7': '03.7 Equipamentos', '03.8': '03.8 Comunicação/Sistema/Licenças', '03.9': '03.9 Custo com Veiculo',
    '04.1': '04.1 Salarios e Remuneração', '04.2': '04.2 Encargos Sociais', '04.3': '04.3 Beneficios',
    '04.4': '04.4 SSMA', '04.5': '04.5 Viagens', '04.6': '04.6 Custo com Veículos',
    '04.7': '04.7 Cartão Corporativo', '04.8': '04.8 Serviços Terceirizados',
    '05.1': '05.1 Salario e Remuneração', '05.2': '05.2 Encargos Sociais', '05.3': '05.3 Beneficios',
    '05.4': '05.4 SSMA', '05.5': '05.5 Viagens', '05.6': '05.6 Despesa com Socios',
    '05.7': '05.7 Serviços Contratados', '05.8': '05.8 Despesa Comercial/Marketing',
    '05.9': '05.9 Despesa com Estrutura', '05.10': '05.10 Despesa Copa e Cozinha',
    '05.11': '05.11 Despesa com Veículos', '05.12': '05.12 Despesa de Informatica',
    '05.13': '05.13 Taxas e Despesas Legais',
    '06.1': '06.1 Entradas Financeiras', '06.2': '06.2 Saidas Financeiras',
    '06.3': '06.3 Financiamento', '06.4': '06.4 Juros/Multas', '06.5': '06.5 Passivo Trabalhista',
    '06.6': '06.6 Depreciação', '06.7': '06.7 Cartão de Credito', '06.8': '06.8 PDD',
};

interface BudgetEntryGridProps {
    costCenterId: string;
    year: number;
}

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

export default function BudgetEntryGrid({ costCenterId, year }: BudgetEntryGridProps) {
    const [budgetValues, setBudgetValues] = useState<Record<string, { amount: number; radarAmount: number | null; isLocked: boolean; observation?: string | null }>>({});
    const [realizedValues, setRealizedValues] = useState<Record<string, number>>({});
    const [isCCLocked, setIsCCLocked] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);
    const [tenantId, setTenantId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<'MASTER' | 'GESTOR' | null>(null);

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Budget Modal
    const [budgetModal, setBudgetModal] = useState<{ categoryId: string; fullNodeId: string; categoryName: string; startMonth: number } | null>(null);
    const [modalValues, setModalValues] = useState<string[]>(new Array(12).fill(''));
    const [lockedMonths, setLockedMonths] = useState<boolean[]>(new Array(12).fill(false));
    const [activeMonth, setActiveMonth] = useState<number>(0);
    const [isSavingBudget, setIsSavingBudget] = useState(false);
    const [modalObservation, setModalObservation] = useState<string>('');

    // Approval state
    const [approvalStatus, setApprovalStatus] = useState<string>('PENDING');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const evaluateFormula = (formula: string): number => {
        if (!formula.startsWith('=')) {
            const clean = formula.replace(/\.(?=\d{3}(,|$))/g, '').replace(',', '.');
            const val = parseFloat(clean);
            return isNaN(val) ? 0 : val;
        }
        try {
            const expression = formula.substring(1).replace(/,/g, '.').replace(/[^-+*/().0-9]/g, '');
            const result = new Function(`return ${expression}`)();
            return typeof result === 'number' && isFinite(result) ? result : 0;
        } catch {
            return 0;
        }
    };

    // Load data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const [setupRes, budgetRes, syncRes, authRes] = await Promise.all([
                    fetch('/api/setup?t=' + Date.now(), { cache: 'no-store' }),
                    fetch(`/api/budgets?costCenterId=${costCenterId}&tenantId=ALL&year=${year}&t=${Date.now()}`, { cache: 'no-store' }),
                    fetch(`/api/sync?costCenterId=${costCenterId}&tenantId=ALL&year=${year}&t=${Date.now()}`, { cache: 'no-store' }),
                    fetch('/api/auth/me')
                ]);

                const [setupData, budgetData, syncData, authData] = await Promise.all([
                    setupRes.json(), budgetRes.json(), syncRes.json(), authRes.json()
                ]);

                if (setupData.success) {
                    setCategories(setupData.categories || []);
                    const foundCC = (setupData.costCenters || []).find((cc: any) => cc.id === costCenterId);
                    if (foundCC?.tenantId) setTenantId(foundCC.tenantId);
                }

                if (budgetData.success) {
                    setIsCCLocked(budgetData.isCCLocked || false);
                    setApprovalStatus(budgetData.status || 'PENDING');
                    const values: Record<string, any> = {};
                    (budgetData.data || []).forEach((item: any) => {
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

                if (authData.success) {
                    setUserRole(authData.user.role);
                }
            } catch (err) {
                console.error('BudgetEntryGrid load error:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [costCenterId, year]);

    // ─── HIERARCHY BUILDER (Unified from BudgetGrid) ─────────────────
    const treeRoots = useMemo(() => {
        const map = new Map<string, CategoryNode>();
        const potentialRoots: CategoryNode[] = [];
        const codeMap = new Map<string, CategoryNode>();
        const nameMap = new Map<string, CategoryNode>();

        // 1. Initial Mapping
        categories.forEach((cat: any) => {
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

            // Force naming for prefixes (Standardized with BudgetGrid)
            if (rawCode.match(/^03\.[1-9]$/)) {
                if (rawCode === '03.1') effectiveName = '03.1 Salarios e Remuneração';
                else if (rawCode === '03.2') effectiveName = '03.2 Encargos Sociais';
                else if (rawCode === '03.3') effectiveName = '03.3 Beneficios';
                else if (rawCode === '03.4') effectiveName = '03.4 Diárias';
                else if (rawCode === '03.5') effectiveName = '03.5 SSMA';
                else if (rawCode === '03.6') effectiveName = '03.6 Materiais';
                else if (rawCode === '03.7') effectiveName = '03.7 Equipamentos';
                else if (rawCode === '03.8') effectiveName = '03.8 Comunicação/Sistema/Licenças';
                else if (rawCode === '03.9') effectiveName = '03.9 Custo com Veiculo';
            }
            if (rawCode.match(/^04\.[1-8]$/)) {
                if (rawCode === '04.1') effectiveName = '04.1 Salarios e Remuneração';
                else if (rawCode === '04.2') effectiveName = '04.2 Encargos Sociais';
                else if (rawCode === '04.3') effectiveName = '04.3 Beneficios';
                else if (rawCode === '04.4') effectiveName = '04.4 SSMA';
                else if (rawCode === '04.5') effectiveName = '04.5 Viagens';
                else if (rawCode === '04.6') effectiveName = '04.6 Custo com Veículos';
                else if (rawCode === '04.7') effectiveName = '04.7 Cartão Corporativo';
                else if (rawCode === '04.8') effectiveName = '04.8 Serviços Terceirizados';
            }
            if (rawCode.match(/^05\.([1-9]|1[0-3])$/)) {
                if (rawCode === '05.1') effectiveName = '05.1 Salario e Remuneração';
                else if (rawCode === '05.2') effectiveName = '05.2 Encargos Sociais';
                else if (rawCode === '05.3') effectiveName = '05.3 Beneficios';
                else if (rawCode === '05.4') effectiveName = '05.4 SSMA';
                else if (rawCode === '05.5') effectiveName = '05.5 Viagens';
                else if (rawCode === '05.6') effectiveName = '05.6 Despesa com Socios';
                else if (rawCode === '05.7') effectiveName = '05.7 Serviços Contratados';
                else if (rawCode === '05.8') effectiveName = '05.8 Despesa Comercial/Marketing';
                else if (rawCode === '05.9') effectiveName = '05.9 Despesa com Estrutura';
                else if (rawCode === '05.10') effectiveName = '05.10 Despesa Copa e Cozinha';
                else if (rawCode === '05.11') effectiveName = '05.11 Despesa com Veículos';
                else if (rawCode === '05.12') effectiveName = '05.12 Despesa de Informatica';
                else if (rawCode === '05.13') effectiveName = '05.13 Taxas e Despesas Legais';
            }
            if (rawCode.match(/^06\.[1-8]$/)) {
                if (rawCode === '06.1') effectiveName = '06.1 Entradas Financeiras';
                else if (rawCode === '06.2') effectiveName = '06.2 Saidas Financeiras';
                else if (rawCode === '06.3') effectiveName = '06.3 Financiamento';
                else if (rawCode === '06.4') effectiveName = '06.4 Juros/Multas';
                else if (rawCode === '06.5') effectiveName = '06.5 Passivo Trabalhista';
                else if (rawCode === '06.6') effectiveName = '06.6 Depreciação';
                else if (rawCode === '06.7') effectiveName = '06.7 Cartão de Credito';
                else if (rawCode === '06.8') effectiveName = '06.8 PDD';
            }

            const uniqueKey = effectiveCode ? effectiveCode : effectiveName;

            if (nameMap.has(uniqueKey)) {
                const existingNode = nameMap.get(uniqueKey)!;
                if (!existingNode.id.split(',').includes(cat.id)) existingNode.id += ',' + cat.id;
                map.set(cat.id, existingNode);
                return;
            }

            const node: CategoryNode = { ...cat, name: effectiveName, code: effectiveCode, children: [], level: 0, isSynthetic: false };
            map.set(cat.id, node);
            if (uniqueKey) nameMap.set(uniqueKey, node);
            if (effectiveCode) codeMap.set(effectiveCode, node);
        });

        const syntheticParents = [
            { code: '01.1', name: '01.1 - Receita de Serviços' },
            { code: '01.2', name: '01.2 - Receitas de Vendas' },
            { code: '02.1', name: '02.1 - Tributos' },
            ...['03.1', '03.2', '03.3', '03.4', '03.5', '03.6', '03.7', '03.8', '03.9', '04.1', '04.2', '04.3', '04.4', '04.5', '04.6', '04.7', '04.8', '05.1', '05.2', '05.3', '05.4', '05.5', '05.6', '05.7', '05.8', '05.9', '05.10', '05.11', '05.12', '05.13', '06.1', '06.2', '06.3', '06.4', '06.5', '06.6', '06.7', '06.8'].map(c => ({ code: c, name: c }))
        ];

        syntheticParents.forEach(synth => {
            if (!codeMap.has(synth.code)) {
                const node: CategoryNode = { id: `synth-${synth.code}`, name: synth.name, parentId: null, children: [], level: 0, code: synth.code, isSynthetic: true };
                map.set(node.id, node);
                codeMap.set(synth.code, node);
            }
        });

        // 2. Hierarchical Nesting
        map.forEach(node => {
            if (node.isSynthetic) return;
            const code = node.code || '';
            if (code.startsWith('01.1.')) { const p = codeMap.get('01.1'); if (p) { p.children.push(node); return; } }
            if (code.startsWith('01.2.')) { const p = codeMap.get('01.2'); if (p) { p.children.push(node); return; } }
            if (code.startsWith('2.1')) { const p = codeMap.get('02.1'); if (p) { p.children.push(node); return; } }

            let parentFound = false;
            if (code.includes('.')) {
                let currentPrefix = code.substring(0, code.lastIndexOf('.'));
                while (currentPrefix.length > 0) {
                    const potentialParent = Array.from(codeMap.values()).find(n => n.code === currentPrefix);
                    if (potentialParent) {
                        if (!potentialParent.children.includes(node)) potentialParent.children.push(node);
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
                        if (!synthParent.children.find(c => c.id === node.id)) synthParent.children.push(node);
                    }
                }
            }
        });

        const allChildren = new Set<string>();
        map.forEach(node => node.children.forEach(c => allChildren.add(c.id)));
        map.forEach(node => { if (!allChildren.has(node.id)) potentialRoots.push(node); });

        const uniqueRootsMap = new Map<string, CategoryNode>();
        potentialRoots.forEach(root => {
            const rootCode = root.code || root.name;
            if (uniqueRootsMap.has(rootCode)) {
                const existingRoot = uniqueRootsMap.get(rootCode)!;
                root.children.forEach(child => {
                    if (!existingRoot.children.find(c => c.id === child.id)) existingRoot.children.push(child);
                });
            } else { uniqueRootsMap.set(rootCode, root); }
        });

        const finalRoots = Array.from(uniqueRootsMap.values());

        // 3. DEDUPLICATE CHILDREN (Critical for merged nodes)
        map.forEach(node => {
            if (node.children.length > 0) {
                const uniqueChildren = new Map<string, CategoryNode>();
                node.children.forEach(c => uniqueChildren.set(c.id, c));
                node.children = Array.from(uniqueChildren.values());
            }
        });

        const recalculateLevels = (nodes: CategoryNode[], lvl: number) => {
            nodes.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));
            nodes.forEach(n => { n.level = lvl; recalculateLevels(n.children, lvl + 1); });
        };
        recalculateLevels(finalRoots, 0);
        return finalRoots;
    }, [categories]);

    // ─── NODE TOTALS (Unified 3-way) ──────────────────────────────────
    const nodeTotals = useMemo(() => {
        const totalsMap = new Map<string, { budget: number[], realized: number[], radar: number[] }>();

        const calculateNode = (node: CategoryNode): { budget: number[], realized: number[], radar: number[] } => {
            const childrenTotals = node.children.map(c => calculateNode(c));
            
            const myBudget = new Array(12).fill(0);
            const myRealized = new Array(12).fill(0);
            const myRadar = new Array(12).fill(0);

            childrenTotals.forEach(ct => {
                for (let i = 0; i < 12; i++) {
                    myBudget[i] += ct.budget[i];
                    myRealized[i] += ct.realized[i];
                    myRadar[i] += ct.radar[i];
                }
            });

            if (!node.isSynthetic) {
                const ids = node.id.split(',');
                for (let i = 0; i < 12; i++) {
                    ids.forEach(id => {
                        const bVal = budgetValues[`${id}-${i}`];
                        if (bVal) {
                            myBudget[i] += bVal.amount || 0;
                            myRadar[i] += bVal.radarAmount || 0;
                        }
                        myRealized[i] += realizedValues[`${id}-${i}`] || 0;
                    });
                }
            }

            const result = { budget: myBudget, realized: myRealized, radar: myRadar };
            totalsMap.set(node.id, result);
            return result;
        };

        treeRoots.forEach(r => calculateNode(r));
        return totalsMap;
    }, [treeRoots, budgetValues, realizedValues]);

    // ─── DRE STRUCTURE (Unified) ──────────────────────────────────────
    const dreStructure = useMemo(() => {
        const sumRoots = (roots: CategoryNode[], monthIdx: number, type: 'budget' | 'realized' | 'radar') =>
            roots.reduce((acc, r) => acc + (nodeTotals.get(r.id)?.[type][monthIdx] || 0), 0);

        const buckets = { rev: [] as CategoryNode[], taxes: [] as CategoryNode[], costs: [] as CategoryNode[], opExp: [] as CategoryNode[], adminExp: [] as CategoryNode[], fin: [] as CategoryNode[] };
        treeRoots.forEach(root => {
            const code = root.code || '';
            if (code.startsWith('01') || code === '1') buckets.rev.push(root);
            else if (code.startsWith('02') || code === '2') buckets.taxes.push(root);
            else if (code.startsWith('3') || code.startsWith('03')) buckets.costs.push(root);
            else if (code.startsWith('4') || code.startsWith('04')) buckets.opExp.push(root);
            else if (code.startsWith('5') || code.startsWith('05') || code.startsWith('7') || code.startsWith('8')) buckets.adminExp.push(root);
            else if (code.startsWith('6') || code.startsWith('06') || code.startsWith('9') || code.startsWith('10')) buckets.fin.push(root);
            else buckets.adminExp.push(root);
        });

        return {
            buckets,
            calcTotals: (monthIdx: number, type: 'budget' | 'realized' | 'radar' = 'budget') => {
                const rev = sumRoots(buckets.rev, monthIdx, type);
                const taxes = sumRoots(buckets.taxes, monthIdx, type);
                const recLiq = rev - taxes;
                const costs = sumRoots(buckets.costs, monthIdx, type);
                const grossMarg = recLiq - costs;
                const opExp = sumRoots(buckets.opExp, monthIdx, type);
                const contribMarg = grossMarg - opExp;
                const adminExp = sumRoots(buckets.adminExp, monthIdx, type);
                const ebitda = contribMarg - adminExp;
                const fin = sumRoots(buckets.fin, monthIdx, type);
                const netProfit = ebitda - fin;
                return { rev, taxes, recLiq, costs, grossMarg, opExp, contribMarg, adminExp, ebitda, fin, netProfit };
            }
        };
    }, [treeRoots, nodeTotals]);

    // ─── FORMATTERS ───────────────────────────────────────────────────
    const fmt = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const toggleRow = (id: string) => { const s = new Set(expandedRows); s.has(id) ? s.delete(id) : s.add(id); setExpandedRows(s); };
    const toggleGroup = (g: string) => { const s = new Set(expandedGroups); s.has(g) ? s.delete(g) : s.add(g); setExpandedGroups(s); };

    // ─── OPEN BUDGET MODAL ────────────────────────────────────────────
    const openBudgetModal = (nodeId: string, nodeName: string, monthIndex: number) => {
        if (isCCLocked && userRole !== 'MASTER') {
            alert('Este orçamento está travado. Solicite a reabertura ao aprovador.');
            return;
        }
        const initialValues = new Array(12).fill('').map((_, i) => {
            const ids = nodeId.split(',');
            for (const id of ids) {
                const d = budgetValues[`${id}-${i}`];
                if (d?.amount !== undefined && d.amount !== null) return d.amount.toString();
            }
            return '';
        });
        const initialLocks = new Array(12).fill(false).map((_, i) => {
            const ids = nodeId.split(',');
            for (const id of ids) {
                const d = budgetValues[`${id}-${i}`];
                if (d?.isLocked || isCCLocked) return true;
            }
            return false;
        });

        const firstId = nodeId.split(',')[0];
        let foundObs = '';
        for (let i = 0; i < 12; i++) {
            nodeId.split(',').forEach(id => {
                const d = budgetValues[`${id}-${i}`];
                if (d?.observation) foundObs = d.observation;
            });
        }

        setBudgetModal({ categoryId: firstId, fullNodeId: nodeId, categoryName: nodeName, startMonth: monthIndex });
        setModalValues(initialValues);
        setLockedMonths(initialLocks);
        setActiveMonth(monthIndex);
        setModalObservation(foundObs);
    };

    // ─── SAVE BUDGET ──────────────────────────────────────────────────
    const handleSaveBudget = async () => {
        if (!budgetModal) return;
        setIsSavingBudget(true);
        try {
            const entries: any[] = [];
            const norm = (c: string) => c.split('.').map(s => parseInt(s, 10).toString()).filter(s => s !== 'NaN').join('.');
            const catName = budgetModal.categoryName;
            const codeMatch = catName.match(/^([\d.]+)/);
            const normCode = codeMatch ? norm(codeMatch[1]) : '';

            for (let i = 0; i < 12; i++) {
                const currentVal = modalValues[i];
                if (currentVal === '' && budgetValues[`${budgetModal.categoryId}-${i}`] === undefined && !modalObservation.trim()) continue;
                const numericVal = evaluateFormula(currentVal);

                const allIds = budgetModal.fullNodeId.split(',');
                // Find the ID that belongs to this CC's tenant
                let targetId = allIds[0];
                if (tenantId) {
                    const match = categories.find((c: any) => allIds.includes(c.id) && c.tenantId === tenantId);
                    if (match) targetId = match.id;
                }

                const entry: any = {
                    categoryId: targetId,
                    month: i,
                    year,
                    costCenterId,
                    tenantId: tenantId || (categories.find((c: any) => c.id === targetId)?.tenantId || ''),
                    amount: numericVal,
                    radarAmount: budgetValues[`${targetId}-${i}`]?.radarAmount ?? null,
                    observation: modalObservation.trim() || null
                };
                if (userRole === 'MASTER') entry.isLocked = lockedMonths[i];
                entries.push(entry);

                // Clean other IDs in merged nodes
                allIds.forEach((id: string) => {
                    if (id !== targetId) {
                        const catObj = categories.find((c: any) => c.id === id);
                        entries.push({ 
                            categoryId: id, 
                            month: i, 
                            year, 
                            costCenterId, 
                            tenantId: catObj?.tenantId || tenantId, 
                            amount: 0, 
                            radarAmount: budgetValues[`${id}-${i}`]?.radarAmount ?? null,
                            observation: null
                        });
                    }
                });

                // Auto-calculate encargos from salary base (03.1.x)
                if (normCode.startsWith('3.1')) {
                    const chargeConfigs = [
                        { code: '03.2.1', rate: 0.08 },
                        { code: '03.2.2', rate: 0.0833 },
                        { code: '03.2.3', rate: 0.1111 },
                        { code: '03.2.4', rate: 0.032 }
                    ];
                    let salaryBase = 0;
                    categories.forEach((cat: any) => {
                        const cm = cat.name?.match(/^([\d.]+)/);
                        if (!cm) return;
                        const catNorm = norm(cm[1]);
                        if (!catNorm.startsWith('3.1')) return;
                        if (cat.tenantId !== tenantId) return;
                        const cardIds = cat.id.split(',');
                        const isCurrent = cardIds.some((id: string) => budgetModal.fullNodeId.split(',').includes(id));
                        if (isCurrent) { salaryBase += numericVal; } else {
                            cardIds.forEach((id: string) => {
                                const stored = budgetValues[`${id}-${i}`];
                                if (stored) salaryBase += stored.amount || 0;
                            });
                        }
                    });

                    chargeConfigs.forEach(config => {
                        const targetCat = categories.find((c: any) => {
                            const cm = c.name.match(/^([\d.]+)/);
                            return cm && norm(cm[1]) === norm(config.code) && c.tenantId === tenantId;
                        });
                        if (targetCat) {
                            entries.push({ categoryId: targetCat.id, month: i, year, costCenterId, tenantId, amount: salaryBase * config.rate });
                        }
                    });
                }
            }

            const res = await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro ao salvar'); }

            setBudgetModal(null);

            // Refresh
            const refreshRes = await fetch(`/api/budgets?costCenterId=${costCenterId}&tenantId=ALL&year=${year}&t=${Date.now()}`, { cache: 'no-store' });
            const refreshData = await refreshRes.json();
            if (refreshData.success) {
                setIsCCLocked(refreshData.isCCLocked || false);
                const values: Record<string, any> = {};
                refreshData.data.forEach((item: any) => {
                    values[`${item.categoryId}-${item.month - 1}`] = { amount: item.amount || 0, isLocked: item.isLocked || false, observation: item.observation || null };
                });
                setBudgetValues(values);
            }
        } catch (error: any) {
            alert(`Erro ao salvar: ${error.message}`);
        } finally {
            setIsSavingBudget(false);
        }
    };

    // ─── SUBMIT TO APPROVAL ────────────────────────────────────────────
    const handleSubmit = async (action: string) => {
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/cost-centers/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ costCenterId, tenantId, year, action })
            });
            const data = await res.json();
            if (data.success) {
                setApprovalStatus(data.newStatus || approvalStatus);
                alert('Ação realizada com sucesso!');
            } else {
                alert(data.error || 'Erro na aprovação');
            }
        } catch { alert('Erro de conexão.'); } finally { setIsSubmitting(false); }
    };

    // ─── RENDER NODE ──────────────────────────────────────────────────
    const renderNode = (node: CategoryNode): React.ReactNode => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedRows.has(node.id);
        const totals = nodeTotals.get(node.id);
        const isLocked = isCCLocked && userRole !== 'MASTER';

        return (
            <React.Fragment key={node.id}>
                <tr
                    onClick={() => hasChildren && toggleRow(node.id)}
                    style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        cursor: hasChildren ? 'pointer' : 'default',
                        background: node.level === 0 ? 'var(--bg-surface)' : 'var(--bg-base)',
                        transition: 'background 0.1s'
                    }}
                    className="hover-row"
                >
                    {/* Name cell */}
                    <td style={{
                        padding: '0.65rem 0',
                        position: 'sticky', left: 0,
                        background: node.level === 0 ? 'var(--bg-surface)' : 'var(--bg-base)',
                        zIndex: 10,
                        fontSize: '0.8rem',
                        minWidth: '380px', width: '380px',
                        borderRight: '1px solid var(--border-subtle)',
                        fontWeight: node.level === 0 ? 700 : 400,
                        color: node.level === 0 ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: `${3 + node.level * 1.5}rem` }}>
                            {hasChildren && <span style={{ marginRight: '0.6rem', fontSize: '0.8rem', width: '1rem', color: 'var(--accent-blue)', opacity: 0.8 }}>{isExpanded ? '▼' : '▶'}</span>}
                            {!hasChildren && <span style={{ width: '1.6rem' }}></span>}
                            {node.name}
                        </div>
                    </td>

                    {/* Budget cells for each month */}
                    {MONTHS.map((_, i) => {
                        const bg = totals?.budget[i] || 0;
                        const rd = totals?.radar[i] || 0;
                        const rl = totals?.realized[i] || 0;
                        const rawData = node.id.split(',').reduce((acc: any, id) => {
                            const d = budgetValues[`${id}-${i}`];
                            return d ? d : acc;
                        }, null);
                        const locked = rawData?.isLocked || isCCLocked;

                        return (
                            <React.Fragment key={i}>
                                <td
                                    onClick={(e) => { e.stopPropagation(); if (!hasChildren) openBudgetModal(node.id, node.name, i); }}
                                    style={{
                                        padding: '0.45rem 0.6rem', textAlign: 'right', fontSize: '0.78rem',
                                        color: bg === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                                        cursor: hasChildren ? 'default' : (isLocked ? 'not-allowed' : 'pointer'),
                                        borderBottom: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)',
                                        whiteSpace: 'nowrap', transition: 'background 0.1s',
                                        fontWeight: node.level === 0 ? 700 : 400, opacity: hasChildren ? 0.85 : 1,
                                        background: locked && !hasChildren ? 'rgba(239,68,68,0.04)' : 'transparent'
                                    }}
                                    className={!hasChildren && !isLocked ? 'budget-cell' : ''}
                                    title={rawData?.observation ? `Obs: ${rawData.observation}` : hasChildren ? 'Subtotal' : 'Clique para editar'}
                                >
                                    {locked && !hasChildren && <span style={{ marginRight: '0.2rem', fontSize: '0.6rem', opacity: 0.5 }}>🔒</span>}
                                    {bg === 0 ? (hasChildren ? '-' : <span style={{ opacity: 0.3 }}>—</span>) : fmt(bg)}
                                </td>
                                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontSize: '0.78rem', color: rd === 0 ? 'var(--text-muted)' : 'var(--accent-indigo)', opacity: 0.9, borderBottom: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)', whiteSpace: 'nowrap', background: 'rgba(99, 102, 241, 0.02)' }}>
                                    {rd === 0 ? '-' : fmt(rd)}
                                </td>
                                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontSize: '0.78rem', color: rl === 0 ? 'var(--text-muted)' : 'var(--accent-blue)', opacity: 0.9, borderBottom: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>
                                    {rl === 0 ? '-' : fmt(rl)}
                                </td>
                            </React.Fragment>
                        );
                    })}

                    {/* Annual total */}
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', borderLeft: '2px solid var(--border-default)', background: 'var(--bg-surface)' }}>
                        {fmt((totals?.budget || new Array(12).fill(0)).reduce((a: number, b: number) => a + b, 0))}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-indigo)', whiteSpace: 'nowrap', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)' }}>
                        {fmt((totals?.radar || new Array(12).fill(0)).reduce((a: number, b: number) => a + b, 0))}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-blue)', whiteSpace: 'nowrap', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)' }}>
                        {fmt((totals?.realized || new Array(12).fill(0)).reduce((a: number, b: number) => a + b, 0))}
                    </td>
                </tr>
                {isExpanded && node.children.map(child => renderNode(child))}
            </React.Fragment>
        );
    };

    // ─── RENDER SUMMARY ROW ───────────────────────────────────────────
    const renderSummaryRow = (label: string, valuesB: number[], valuesRd: number[], valuesRl: number[], isBold = false, bgColor = 'var(--bg-elevated)', textColor = 'var(--text-primary)', groupId?: string) => {
        const isExpanded = groupId ? expandedGroups.has(groupId) : true;
        const annualB = valuesB.reduce((a, b) => a + b, 0);
        const annualRd = valuesRd.reduce((a, b) => a + b, 0);
        const annualRl = valuesRl.reduce((a, b) => a + b, 0);
        return (
            <tr onClick={() => groupId && toggleGroup(groupId)} style={{ background: bgColor, borderBottom: '1px solid var(--border-default)', fontWeight: isBold ? 800 : 600, cursor: groupId ? 'pointer' : 'default' }}>
                <td style={{ padding: '0.85rem 1rem', position: 'sticky', left: 0, background: bgColor.includes('gradient') ? '#2563eb' : bgColor, zIndex: 10, color: textColor, fontSize: '0.85rem', minWidth: '380px', width: '380px', borderRight: '1px solid var(--border-default)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {groupId && <span style={{ marginRight: '0.75rem', fontSize: '0.9rem', width: '1rem', color: textColor, opacity: 0.6 }}>{isExpanded ? '▼' : '▶'}</span>}
                        {!groupId && <span style={{ width: '1.75rem' }}></span>}
                        {label}
                    </div>
                </td>
                {MONTHS.map((_, i) => (
                    <React.Fragment key={i}>
                        <td style={{ padding: '0.65rem 0.6rem', textAlign: 'right', fontSize: '0.8rem', color: textColor, whiteSpace: 'nowrap', borderRight: '1px solid var(--border-subtle)', fontWeight: isBold ? 800 : 600 }}>
                            {valuesB[i] === 0 ? '-' : fmt(valuesB[i])}
                        </td>
                        <td style={{ padding: '0.65rem 0.6rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--accent-indigo)', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-subtle)', fontWeight: isBold ? 800 : 600, opacity: 0.8, background: 'rgba(99, 102, 241, 0.05)' }}>
                            {valuesRd[i] === 0 ? '-' : fmt(valuesRd[i])}
                        </td>
                        <td style={{ padding: '0.65rem 0.6rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--accent-blue)', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-subtle)', fontWeight: isBold ? 800 : 600, opacity: 0.8 }}>
                            {valuesRl[i] === 0 ? '-' : fmt(valuesRl[i])}
                        </td>
                    </React.Fragment>
                ))}
                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontSize: '0.82rem', fontWeight: 800, color: textColor, whiteSpace: 'nowrap', borderLeft: '2px solid var(--border-default)', background: 'var(--bg-surface)' }}>
                    {annualB === 0 ? '-' : fmt(annualB)}
                </td>
                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontSize: '0.82rem', fontWeight: 800, color: 'var(--accent-indigo)', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                    {annualRd === 0 ? '-' : fmt(annualRd)}
                </td>
                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontSize: '0.82rem', fontWeight: 800, color: 'var(--accent-blue)', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
                    {annualRl === 0 ? '-' : fmt(annualRl)}
                </td>
            </tr>
        );
    };

    // ─── LOADING ──────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div className="spinner"></div>
                    <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Carregando orçamento...</p>
                </div>
            </div>
        );
    }

    // ─── APPROVAL BAR ─────────────────────────────────────────────────
    const statusColors: Record<string, { bg: string; color: string; label: string }> = {
        PENDING: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b', label: '⏳ Em Aberto' },
        AWAITING_N1: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: '📋 Aguardando N1' },
        AWAITING_N2: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1', label: '📋 Aguardando N2' },
        APPROVED: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', label: '✅ Aprovado' },
    };
    const statusInfo = statusColors[approvalStatus] || statusColors.PENDING;

    const dreMonthlyData = MONTHS.map((_, i) => dreStructure.calcTotals(i));

    return (
        <div style={{ padding: '1.5rem 2rem' }}>
            {/* Status & Action Bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '1.5rem', padding: '1rem 1.5rem',
                background: statusInfo.bg, border: `1px solid ${statusInfo.color}30`,
                borderRadius: 'var(--radius)', gap: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {isCCLocked && <span style={{ fontSize: '1.1rem' }}>🔒</span>}
                    <span style={{ fontWeight: 700, color: statusInfo.color, fontSize: '0.9rem' }}>{statusInfo.label}</span>
                    {isCCLocked && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Orçamento travado</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {approvalStatus === 'PENDING' && !isCCLocked && (
                        <button onClick={() => handleSubmit('SUBMIT_N1')} disabled={isSubmitting} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}>
                            {isSubmitting ? '...' : '📤 Enviar para Aprovação'}
                        </button>
                    )}
                    {approvalStatus === 'AWAITING_N1' && (userRole === 'MASTER') && (
                        <button onClick={() => handleSubmit('APPROVE_N1')} disabled={isSubmitting} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem', background: '#3b82f6' }}>
                            {isSubmitting ? '...' : '✅ Aprovar N1'}
                        </button>
                    )}
                    {approvalStatus === 'AWAITING_N2' && (userRole === 'MASTER') && (
                        <button onClick={() => handleSubmit('APPROVE_N2')} disabled={isSubmitting} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem', background: '#6366f1' }}>
                            {isSubmitting ? '...' : '✅ Aprovar N2'}
                        </button>
                    )}
                    {approvalStatus !== 'PENDING' && (
                        <button onClick={() => handleSubmit('REOPEN')} disabled={isSubmitting} className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}>
                            {isSubmitting ? '...' : '🔓 Reabrir'}
                        </button>
                    )}
                    <button
                        onClick={() => { setExpandedGroups(new Set(['rev', 'taxes', 'costs', 'opExp', 'adminExp', 'fin'])); setExpandedRows(new Set()); }}
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                    >
                        ⊞ Expandir
                    </button>
                    <button
                        onClick={() => { setExpandedGroups(new Set()); setExpandedRows(new Set()); }}
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                    >
                        ⊟ Recolher
                    </button>
                </div>
            </div>

            {/* Main Table */}
            <div style={{ overflowX: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border-default)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-surface)' }}>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 20, minWidth: '380px', borderRight: '1px solid var(--border-subtle)', borderBottom: '2px solid var(--border-default)' }}>
                                ▸ Estrutura DRE
                            </th>
                            {MONTHS.map((m, i) => (
                                <th key={i} style={{ padding: '0.3rem 0', textAlign: 'center', fontSize: '0.65rem', fontWeight: 800, borderRight: '1px solid var(--border-subtle)', borderBottom: '2px solid var(--border-default)', minWidth: '240px' }}>
                                    <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>{m}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '0.55rem', gap: '0' }}>
                                        <span style={{ color: 'var(--text-muted)', borderRight: '1px solid rgba(0,0,0,0.05)' }}>ORC</span>
                                        <span style={{ color: 'var(--accent-indigo)', borderRight: '1px solid rgba(0,0,0,0.05)' }}>RAD</span>
                                        <span style={{ color: 'var(--accent-blue)' }}>REA</span>
                                    </div>
                                </th>
                            ))}
                            <th style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontSize: '0.65rem', fontWeight: 800, borderLeft: '2px solid var(--border-default)', borderBottom: '2px solid var(--border-default)', minWidth: '240px', background: 'var(--bg-surface)' }}>
                                <div style={{ color: 'var(--accent-blue)', marginBottom: '0.2rem' }}>TOTAL ANUAL</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '0.55rem', gap: '0' }}>
                                    <span style={{ color: 'var(--text-primary)' }}>ORÇADO</span>
                                    <span style={{ color: 'var(--accent-indigo)' }}>RADAR</span>
                                    <span style={{ color: 'var(--accent-blue)' }}>REALIZADO</span>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* 01. RECEITA BRUTA */}
                        {renderSummaryRow('01. RECEITA BRUTA', dreMonthlyData.map(d => d.rev), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').rev), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').rev), true, 'var(--bg-elevated)', 'var(--accent-blue)', 'rev')}
                        {expandedGroups.has('rev') && (dreStructure.buckets.rev || []).map(r => renderNode(r))}

                        {/* 02. TRIBUTO */}
                        {renderSummaryRow('02. Tributo sobre Faturamento', dreMonthlyData.map(d => d.taxes), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').taxes), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').taxes), true, 'var(--bg-surface)', 'var(--text-secondary)', 'taxes')}
                        {expandedGroups.has('taxes') && (dreStructure.buckets.taxes || []).map(r => renderNode(r))}

                        {renderSummaryRow('(=) RECEITA LÍQUIDA', dreMonthlyData.map(d => d.recLiq), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').recLiq), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').recLiq), true, '#eff6ff', 'var(--accent-blue)')}

                        {/* 03. CUSTO OPERACIONAL */}
                        {renderSummaryRow('03. Custo Operacional', dreMonthlyData.map(d => d.costs), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').costs), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').costs), true, 'var(--bg-surface)', 'var(--text-secondary)', 'costs')}
                        {expandedGroups.has('costs') && (dreStructure.buckets.costs || []).map(r => renderNode(r))}

                        {renderSummaryRow('(=) MARGEM BRUTA', dreMonthlyData.map(d => d.grossMarg), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').grossMarg), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').grossMarg), true, '#f0fdf4', 'var(--accent-green)')}

                        {/* 04. DESPESA OPERACIONAL */}
                        {renderSummaryRow('04. Despesa Operacional', dreMonthlyData.map(d => d.opExp), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').opExp), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').opExp), true, 'var(--bg-surface)', 'var(--text-secondary)', 'opExp')}
                        {expandedGroups.has('opExp') && (dreStructure.buckets.opExp || []).map(r => renderNode(r))}

                        {renderSummaryRow('(=) MARGEM DE CONTRIBUIÇÃO', dreMonthlyData.map(d => d.contribMarg), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').contribMarg), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').contribMarg), true, '#fdfaf2', 'var(--accent-amber)')}

                        {/* 05. DESPESA ADMINISTRATIVA */}
                        {renderSummaryRow('05. Despesas Administrativas', dreMonthlyData.map(d => d.adminExp), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').adminExp), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').adminExp), true, 'var(--bg-surface)', 'var(--text-secondary)', 'adminExp')}
                        {expandedGroups.has('adminExp') && (dreStructure.buckets.adminExp || []).map(r => renderNode(r))}

                        {renderSummaryRow('(=) EBITDA', dreMonthlyData.map(d => d.ebitda), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').ebitda), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').ebitda), true, '#f5f3ff', 'var(--accent-indigo)')}

                        {/* 06. DESPESA FINANCEIRA */}
                        {renderSummaryRow('06. Despesas Financeiras', dreMonthlyData.map(d => d.fin), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').fin), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').fin), true, 'var(--bg-surface)', 'var(--text-secondary)', 'fin')}
                        {expandedGroups.has('fin') && (dreStructure.buckets.fin || []).map(r => renderNode(r))}

                        {renderSummaryRow('(=) LUCRO LÍQUIDO', dreMonthlyData.map(d => d.netProfit), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'radar').netProfit), MONTHS.map((_, i) => dreStructure.calcTotals(i, 'realized').netProfit), true, 'var(--gradient-brand)', 'white')}
                    </tbody>
                </table>
            </div>

            {/* ─── BUDGET MODAL ─────────────────────────────────────────────── */}
            {budgetModal && (
                <div className="modal-overlay" style={{ zIndex: 1200 }}>
                    <div className="modal-content" style={{ maxWidth: '600px', backgroundColor: '#fff' }}>
                        <div style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>
                                        Orçado: {budgetModal.categoryName}
                                    </h3>
                                </div>
                                <button onClick={() => setBudgetModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#94a3b8', padding: '0.5rem' }}>✕</button>
                            </div>

                            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-start', gap: '0.75rem' }}>
                                <button
                                    onClick={() => {
                                        const val = modalValues[activeMonth];
                                        const newVals = [...modalValues];
                                        for (let i = activeMonth; i < 12; i++) newVals[i] = val;
                                        setModalValues(newVals);
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#f1f5f9', color: '#2563eb', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s' }}
                                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
                                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                                >
                                    ⏩ Preencher meses seguintes
                                </button>
                                <button
                                    onClick={() => setModalValues(new Array(12).fill(modalValues[activeMonth]))}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#f1f5f9', color: '#2563eb', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s' }}
                                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
                                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                                >
                                    ⟳ Replicar p/ todos
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                {MONTHS.map((month, idx) => {
                                    const isLocked = lockedMonths[idx];
                                    const canEdit = !isLocked || userRole === 'MASTER';
                                    return (
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', opacity: !canEdit ? 0.6 : 1, border: activeMonth === idx ? '1px solid #2563eb' : '1px solid transparent', padding: '0.5rem', borderRadius: '12px', backgroundColor: activeMonth === idx ? '#eff6ff' : 'transparent', transition: 'all 0.2s' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{month}</label>
                                                {isLocked && <span title="Mês bloqueado" style={{ cursor: 'help' }}>🔒</span>}
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                                <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem' }}>R$</span>
                                                <input
                                                    type="text"
                                                    value={modalValues[idx]}
                                                    disabled={!canEdit}
                                                    onFocus={() => setActiveMonth(idx)}
                                                    onChange={(e) => { const next = [...modalValues]; next[idx] = e.target.value; setModalValues(next); }}
                                                    onKeyDown={e => { if (e.key === 'Enter' && idx < 11) setActiveMonth(idx + 1); if (e.key === 'Tab') { e.preventDefault(); setActiveMonth((idx + 1) % 12); } }}
                                                    placeholder="0,00"
                                                    className="premium-input"
                                                    style={{ width: '100%', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', padding: '0.5rem 0.5rem 0.5rem 2rem', border: !canEdit ? '1px dashed #cbd5e1' : (activeMonth === idx ? '1px solid #2563eb' : '1px solid #e2e8f0'), backgroundColor: !canEdit ? '#f8fafc' : '#ffffff' }}
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
                                    style={{ padding: '0.75rem 2rem', backgroundColor: (lockedMonths.every(l => l) && userRole !== 'MASTER') ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: (isSavingBudget || (lockedMonths.every(l => l) && userRole !== 'MASTER')) ? 'default' : 'pointer', fontSize: '0.95rem', minWidth: '120px', opacity: isSavingBudget ? 0.7 : 1 }}
                                >
                                    {isSavingBudget ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .budget-cell:hover { background: rgba(59,130,246,0.08) !important; }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
