'use client';
// V47.90 - Robust Hierarchy (Gap Jumping) + 02->01.2 Remap + Omni Directional Drilldown

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
}

export default function BudgetGrid({ refreshKey = 0 }: BudgetGridProps) {
    const [budgetValues, setBudgetValues] = useState<Record<string, number>>({});
    const [realizedValues, setRealizedValues] = useState<Record<string, number>>({});
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [selectedCostCenter, setSelectedCostCenter] = useState('DEFAULT');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // --- Transaction Drill-down State ---
    const [selectedCell, setSelectedCell] = useState<{ categoryId: string, month: number, categoryName: string } | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);

    const handleCellClick = async (categoryId: string, month: number, categoryName: string) => {
        setSelectedCell({ categoryId, month, categoryName });
        setLoadingTransactions(true);
        setTransactions([]);
        try {
            // NOTE: Ideally the API should handle "get transactions for category X OR its children".
            // If the node is a Folder/Grouper, this request might return empty if the API is strict.
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
                    fetch(`/api/sync?costCenterId=${selectedCostCenter}&year=${selectedYear}&t=${Date.now()}`, { cache: 'no-store' })
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
    }, [selectedCostCenter, selectedYear, refreshKey]);

    // --- ROBUST HIERARCHY BUILDER ---
    // User Requirement: 01 -> 01.1 -> 01.1.1
    // User Requirement: 02 -> 01.2
    // User Requirement: Drill down everywhere.
    const treeRoots = useMemo(() => {
        const map = new Map<string, CategoryNode>();
        const roots: CategoryNode[] = [];

        // 1. Initialize Nodes & Force Remap "02" -> "01.2"
        const sortedCats = [...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        sortedCats.forEach(cat => {
            const codeMatch = cat.name.match(/^([\d.]+)/);
            const rawCode = codeMatch ? codeMatch[1] : '';

            let effectiveName = cat.name;
            let effectiveCode = rawCode;

            // REMAP: 02... -> 01.2...
            if (rawCode.startsWith('02') || rawCode === '2') {
                // Only remap if it looks like the user's "Vendas" structure and not "Tributos" (which might start with 2)
                // User said "02. Receitas de Vendas".
                // BUT "2. Tributos" also starts with 2.
                // Heuristic: Check for Dot "02." OR exact "02" OR "Receita".
                if (rawCode.startsWith('02') || cat.name.toLowerCase().includes('receita') || cat.name.toLowerCase().includes('venda')) {
                    // CAUTION: "Receita de Serviços" starts with 01. 
                    // Only touch "02" starts.
                    if (rawCode.startsWith('02')) {
                        const suffix = rawCode.substring(2); // "02.1" -> ".1"
                        effectiveCode = '01.2' + suffix;
                        // Update name for visual clarity? "02. Receitas" -> "01.2 - Receitas"
                        effectiveName = cat.name.replace(/^[\d.]+/, effectiveCode);
                    }
                }
            }

            map.set(cat.id, {
                ...cat,
                name: effectiveName,
                code: effectiveCode,
                children: [],
                level: 0
            });
        });

        // 2. Build Hierarchy with Gap Jumping
        sortedCats.forEach(cat => {
            const node = map.get(cat.id)!;
            const code = node.code || '';

            // Try to find a parent strictly by Code
            if (code.includes('.')) {
                let currentPrefix = code.substring(0, code.lastIndexOf('.'));
                let parentFound = false;

                // GAP JUMPING Loop: 
                // 01.1.1 -> Try 01.1 -> Not found? -> Try 01.
                while (currentPrefix.length > 0) {
                    // Find node with this code
                    const potentialParent = Array.from(map.values()).find(n => n.code === currentPrefix);
                    if (potentialParent) {
                        // Found an ancestor!
                        node.level = potentialParent.level + 1;
                        potentialParent.children.push(node);
                        parentFound = true;
                        break;
                    }

                    // Not found, try stripping another segment
                    if (!currentPrefix.includes('.')) break;
                    currentPrefix = currentPrefix.substring(0, currentPrefix.lastIndexOf('.'));
                }

                if (parentFound) return;
            }

            // If Code link failed, try API Parent?
            // (Only if not remapped, because remapping breaks API ID links usually)
            // But if "02.1" remapped to "01.2.1", its parent "02" is now "01.2". 
            // The Code logic above handles remapped parents too! 
            // So we mostly rely on Code Gap Jumping.

            // Fallback: If "01.2" (Ex-02) didn't find "01", it lands here.
            // If "01" is missing from map, "01.2" becomes root.
            roots.push(node);
        });

        // 3. Sort
        const sortNodes = (nodes: CategoryNode[]) => {
            nodes.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));
            nodes.forEach(n => sortNodes(n.children));
        };
        sortNodes(roots);
        return roots;

    }, [categories]);

    // --- RECURSIVE TOTALS ---
    const nodeTotals = useMemo(() => {
        const totalsMap = new Map<string, { budget: number[], realized: number[] }>();

        const calculateNode = (node: CategoryNode) => {
            const childrenTotals = node.children.map(calculateNode);

            const myBudget = new Array(12).fill(0);
            const myRealized = new Array(12).fill(0);

            childrenTotals.forEach(childTotal => {
                for (let i = 0; i < 12; i++) {
                    myBudget[i] += childTotal.budget[i];
                    myRealized[i] += childTotal.realized[i];
                }
            });

            for (let i = 0; i < 12; i++) {
                myBudget[i] += budgetValues[`${node.id}-${i}`] || 0;
                myRealized[i] += realizedValues[`${node.id}-${i}`] || 0;
            }

            totalsMap.set(node.id, { budget: myBudget, realized: myRealized });
            return { budget: myBudget, realized: myRealized };
        };

        treeRoots.forEach(root => calculateNode(root));
        return totalsMap;
    }, [treeRoots, budgetValues, realizedValues]);

    // --- STRUCTURED DRE BUILDER ---
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

            // Note: Since we remapped 02 -> 01.2 and nested it under 01, 
            // "01" should be the ONLY root for Revenue if "01" exists.
            // If "01" does NOT exist, we might see "01.1", "01.2" as roots.
            if (code.startsWith('01') || code === '1') buckets.rev.push(root);

            else if (code.startsWith('2') || code === '2') buckets.taxes.push(root);

            else if (code.startsWith('3') || code.startsWith('03') || code.startsWith('04') || code.startsWith('4')) buckets.costs.push(root);

            else if (code.startsWith('5') || code.startsWith('05') || code.startsWith('6') || code.startsWith('06')) buckets.opExp.push(root);

            else if (code.startsWith('7') || code.startsWith('07') || code.startsWith('8') || code.startsWith('08')) buckets.adminExp.push(root);

            else if (code.startsWith('9') || code.startsWith('09') || code.startsWith('10')) buckets.fin.push(root);

            else buckets.other.push(root);
        });

        // Computed Rows
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

    // --- Rendering Helpers ---
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

    const handleBudgetChange = async (categoryId: string, monthIndex: number, value: string) => {
        const numericValue = parseFloat(value.replace(/\D/g, '')) / 100 || 0;
        setBudgetValues(prev => ({ ...prev, [`${categoryId}-${monthIndex}`]: numericValue }));

        try {
            await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: 'demo-tenant',
                    categoryId,
                    costCenterId: selectedCostCenter,
                    year: selectedYear,
                    month: monthIndex,
                    amount: numericValue
                })
            });
        } catch (e) { console.error("Save failed", e); }
    };

    // Recursive Row Renderer
    const renderNode = (node: CategoryNode) => {
        const totals = nodeTotals.get(node.id) || { budget: new Array(12).fill(0), realized: new Array(12).fill(0) };
        const isExpanded = expandedRows.has(node.id);
        const hasChildren = node.children.length > 0;

        return (
            <React.Fragment key={node.id}>
                <tr
                    onClick={() => hasChildren && toggleRow(node.id)}
                    style={{
                        background: hasChildren ? '#fdfdfd' : 'white',
                        cursor: hasChildren ? 'pointer' : 'default',
                        borderBottom: '1px solid #f1f5f9'
                    }}
                >
                    <td style={{
                        padding: '0.5rem',
                        paddingLeft: `${0.5 + (node.level * 1.5)}rem`,
                        position: 'sticky',
                        left: 0,
                        background: hasChildren ? '#fdfdfd' : 'white',
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        color: hasChildren ? '#1e293b' : '#334155',
                        fontWeight: hasChildren ? 600 : 400,
                        fontSize: '0.8rem'
                    }}>
                        {hasChildren && (
                            <span style={{ marginRight: '0.5rem', fontSize: '0.7rem', width: '1rem', color: '#94a3b8' }}>
                                {isExpanded ? '▼' : '▶'}
                            </span>
                        )}
                        {!hasChildren && <span style={{ width: '1.5rem' }}></span>}
                        {node.name}
                    </td>

                    {MONTHS.map((_, i) => (
                        <React.Fragment key={i}>
                            <td style={{ borderLeft: '1px solid #f1f5f9', padding: hasChildren ? '0.5rem' : '0' }}>
                                {hasChildren ? (
                                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#64748b' }}>{formatCurrency(totals.budget[i])}</div>
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="0,00"
                                        onBlur={(e) => handleBudgetChange(node.id, i, e.target.value)}
                                        defaultValue={totals.budget[i] ? totals.budget[i].toFixed(2) : ''}
                                        style={{
                                            width: '100%', padding: '0.5rem', border: '1px solid transparent',
                                            textAlign: 'right', background: 'transparent', fontSize: '0.75rem',
                                            color: '#334155'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                    />
                                )}
                            </td>

                            {/* DRILL DOWN EVERYWHERE: If hasChildren, we still allow click. */}
                            <td
                                onClick={() => handleCellClick(node.id, i, node.name)}
                                style={{
                                    textAlign: 'right',
                                    padding: '0.5rem',
                                    color: '#3b82f6',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                }}
                            >
                                {formatCurrency(totals.realized[i])}
                            </td>
                        </React.Fragment>
                    ))}
                </tr>

                {isExpanded && node.children.map(child => renderNode(child))}
            </React.Fragment>
        );
    };

    // Summary Row Renderer
    const renderSummaryRow = (label: string, validx: keyof ReturnType<typeof dreStructure.calculateTotals>, isBold = false, bgColor = '#f8fafc', textColor = '#0f172a', onClick?: () => void) => (
        <tr onClick={onClick} style={{ background: bgColor, borderBottom: '1px solid #e2e8f0', fontWeight: isBold ? 700 : 600, cursor: onClick ? 'pointer' : 'default' }}>
            <td style={{ padding: '0.75rem', position: 'sticky', left: 0, background: bgColor, zIndex: 10, color: textColor, fontSize: '0.85rem' }}>
                {label}
            </td>
            {MONTHS.map((_, i) => {
                const totals = dreStructure.calculateTotals(i);
                const val = totals[validx];
                return (
                    <React.Fragment key={i}>
                        <td style={{ textAlign: 'right', padding: '0.75rem', borderLeft: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem' }}>
                            {formatCurrency(val.b)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.75rem', color: textColor, fontSize: '0.8rem' }}>
                            {formatCurrency(val.r)}
                        </td>
                    </React.Fragment>
                );
            })}
        </tr>
    );

    return (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: 'white' }}>
            {/* Header ... */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Centro de Custo</label>
                        <select value={selectedCostCenter} onChange={(e) => setSelectedCostCenter(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', minWidth: '200px' }}>
                            {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '1rem', textAlign: 'left', minWidth: '300px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 20, color: '#475569' }}>DRE Gerencial</th>
                        {MONTHS.map((m) => <th key={m} colSpan={2} style={{ textAlign: 'center', padding: '0.5rem', borderLeft: '1px solid #cbd5e1', color: '#475569' }}>{m}</th>)}
                    </tr>
                    <tr style={{ background: '#fff' }}>
                        <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 20 }}></th>
                        {MONTHS.map((m) => (
                            <React.Fragment key={m}>
                                <th style={{ fontSize: '0.7rem', color: '#94a3b8', borderLeft: '1px solid #f1f5f9', fontWeight: 500, paddingBottom: '0.5rem' }}>Orçado</th>
                                <th style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500, paddingBottom: '0.5rem' }}>Realizado</th>
                            </React.Fragment>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {/* 1 - RECEITA BRUTA (Total Top) */}
                    {renderSummaryRow('1 - RECEITA BRUTA', 'vRev', true, '#eff6ff', '#1e3a8a')}
                    {dreStructure.buckets.rev.map(root => renderNode(root))}

                    {/* 2 - TRIBUTOS (Total Top) */}
                    {renderSummaryRow('2 - TRIBUTOS', 'vTaxes', true, '#f1f5f9', '#64748b')}
                    {dreStructure.buckets.taxes.map(root => renderNode(root))}

                    {/* 3 - RECEITA LÍQUIDA (Result Only) */}
                    {renderSummaryRow('3 - (=) RECEITA LÍQUIDA', 'vRecLiq', true, '#e0f2fe', '#0369a1')}

                    {/* 4 - CUSTO OPERACIONAL (Total Top) */}
                    {renderSummaryRow('4 - CUSTO OPERACIONAL', 'vCosts', true, '#f1f5f9', '#64748b')}
                    {dreStructure.buckets.costs.map(root => renderNode(root))}

                    {/* 5 - MARGEM BRUTA */}
                    {renderSummaryRow('5 - (=) MARGEM BRUTA', 'vGrossMarg', true, '#dcfce7', '#15803d')}

                    {/* 6 - DESPESA OPERACIONAL (Total Top) */}
                    {renderSummaryRow('6 - DESPESA OPERACIONAL', 'vOpExp', true, '#f1f5f9', '#64748b')}
                    {dreStructure.buckets.opExp.map(root => renderNode(root))}

                    {/* 7 - MARGEM DE CONTRIBUIÇÃO */}
                    {renderSummaryRow('7 - (=) MARGEM DE CONTRIBUIÇÃO', 'vContribMarg', true, '#fff7ed', '#c2410c')}

                    {/* 8 - DESPESAS ADMINISTRATIVAS (Total Top) */}
                    {renderSummaryRow('8 - DESPESAS ADMINISTRATIVAS', 'vAdminExp', true, '#f1f5f9', '#64748b')}
                    {dreStructure.buckets.adminExp.map(root => renderNode(root))}

                    {/* 9 - EBITDA */}
                    {renderSummaryRow('9 - (=) EBITDA', 'vEbitda', true, '#fef3c7', '#b45309')}

                    {/* 10 - DESPESAS FINANCEIRAS (Total Top) */}
                    {renderSummaryRow('10 - DESPESAS FINANCEIRAS', 'vFin', true, '#f1f5f9', '#64748b')}
                    {dreStructure.buckets.fin.map(root => renderNode(root))}

                    {/* 11 - LUCRO LIQUIDO */}
                    {renderSummaryRow('11 - (=) LUCRO LÍQUIDO', 'vNetProfit', true, '#0f172a', '#fbbf24')}
                </tbody>
            </table>

            {/* Modal */}
            {selectedCell && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', width: '90vw', maxWidth: '1000px', height: '90vh', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{selectedCell.categoryName} - {MONTHS[selectedCell.month]}</h3>
                            <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>

                        {loadingTransactions ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Carregando lançamentos...</div>
                        ) : transactions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Nenhum lançamento encontrado.</div>
                        ) : (
                            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Data</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Descrição</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Cliente/Forn.</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map((tx: any) => (
                                        <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.5rem' }}>{new Date(tx.date).toLocaleDateString('pt-BR')}</td>
                                            <td style={{ padding: '0.5rem' }}>{tx.description}</td>
                                            <td style={{ padding: '0.5rem' }}>{tx.customer || '-'}</td>
                                            <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>
                                                {parseFloat(tx.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </td>
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
