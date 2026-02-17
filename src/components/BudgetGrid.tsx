'use client';
// V47.16 - Dynamic DRE Tree Structure (SaaS-Ready)

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
}

export default function BudgetGrid({ refreshKey = 0 }: BudgetGridProps) {
    const [budgetValues, setBudgetValues] = useState<Record<string, number>>({});
    const [realizedValues, setRealizedValues] = useState<Record<string, number>>({});
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [selectedCostCenter, setSelectedCostCenter] = useState('DEFAULT');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const [categories, setCategories] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>(MOCK_COST_CENTERS);
    const [error, setError] = useState<string | null>(null);

    // 1. Setup Effect
    useEffect(() => {
        const loadSetup = async () => {
            try {
                const setupRes = await fetch('/api/setup', { cache: 'no-store' });
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
                    fetch(`/api/budgets?costCenterId=${selectedCostCenter}&year=${selectedYear}`, { cache: 'no-store' }),
                    fetch(`/api/sync?costCenterId=${selectedCostCenter}&year=${selectedYear}`, { cache: 'no-store' })
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

    // --- Dynamic Tree Builder ---
    const treeRoots = useMemo(() => {
        const map = new Map<string, CategoryNode>();
        const roots: CategoryNode[] = [];

        // 1. Initialize Nodes
        categories.forEach(cat => {
            map.set(cat.id, { ...cat, children: [], level: 0 });
        });

        // 2. Build Hierarchy
        categories.forEach(cat => {
            const node = map.get(cat.id)!;
            if (cat.parentId && map.has(cat.parentId)) {
                const parent = map.get(cat.parentId)!;
                node.level = parent.level + 1;
                parent.children.push(node);
            } else {
                roots.push(node);
            }
        });

        // 3. Sort by Name (Preserves 1, 1.1, 1.2 ordering naturally)
        const sortRecursive = (nodes: CategoryNode[]) => {
            nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            nodes.forEach(n => sortRecursive(n.children));
        };
        sortRecursive(roots);

        return roots;
    }, [categories]);

    // --- Recursive Totals Calculation ---
    // Returns a Map where Key = CategoryID, Value = Array[12] of monthly totals (including children)
    const nodeTotals = useMemo(() => {
        const totalsMap = new Map<string, { budget: number[], realized: number[] }>();

        const calculateNode = (node: CategoryNode) => {
            const myBudget = new Array(12).fill(0);
            const myRealized = new Array(12).fill(0);

            // 1. Add own values (Leaf level or direct assignment)
            for (let i = 0; i < 12; i++) {
                myBudget[i] = budgetValues[`${node.id}-${i}`] || 0;
                myRealized[i] = realizedValues[`${node.id}-${i}`] || 0;
            }

            // 2. Add children values recursively
            node.children.forEach(child => {
                const childTotals = calculateNode(child);
                for (let i = 0; i < 12; i++) {
                    myBudget[i] += childTotals.budget[i];
                    myRealized[i] += childTotals.realized[i];
                }
            });

            totalsMap.set(node.id, { budget: myBudget, realized: myRealized });
            return { budget: myBudget, realized: myRealized };
        };

        treeRoots.forEach(root => calculateNode(root));
        return totalsMap;

    }, [treeRoots, budgetValues, realizedValues]);

    // --- DRE Bucketing Strategy ---
    // Instead of hardcoded IDs, we group ROOT nodes by their numeric prefix.
    // This allows "1.5 New Group" to automatically fall into Revenue.
    const dreBuckets = useMemo(() => {
        const buckets = {
            revenue: [] as CategoryNode[],
            deductions: [] as CategoryNode[],
            costs: [] as CategoryNode[],
            opExpenses: [] as CategoryNode[],
            adminExpenses: [] as CategoryNode[],
            financial: [] as CategoryNode[],
            otherRev: [] as CategoryNode[],
            otherExp: [] as CategoryNode[],
            unclassified: [] as CategoryNode[]
        };

        const getPrefix = (name: string) => name.split(' ')[0].split('-')[0].trim(); // "1.1" from "1.1 - Name"

        treeRoots.forEach(root => {
            const p = getPrefix(root.name);
            if (p.startsWith('1') && !p.startsWith('10') && !p.startsWith('11') && !p.startsWith('12')) buckets.revenue.push(root); // 1...
            else if (p.startsWith('2')) buckets.deductions.push(root);
            else if (p.startsWith('3') || p.startsWith('4')) buckets.costs.push(root);
            else if (p.startsWith('6')) buckets.opExpenses.push(root);
            else if (p.startsWith('8')) buckets.adminExpenses.push(root);
            else if (p.startsWith('9') || p.startsWith('10')) buckets.financial.push(root); // 9 or 10
            else if (p.startsWith('7')) buckets.otherRev.push(root);
            else if (p.startsWith('11') || p.startsWith('12')) buckets.otherExp.push(root);
            else buckets.unclassified.push(root);
        });

        return buckets;
    }, [treeRoots]);

    // --- Totals Helpers ---
    const sumBucket = (nodes: CategoryNode[]) => {
        const b = new Array(12).fill(0);
        const r = new Array(12).fill(0);
        nodes.forEach(node => {
            const t = nodeTotals.get(node.id);
            if (t) {
                for (let i = 0; i < 12; i++) {
                    b[i] += t.budget[i];
                    r[i] += t.realized[i];
                }
            }
        });
        return { budget: b, realized: r };
    };

    // --- Accounting Result Calculations ---
    const T_Revenue = sumBucket(dreBuckets.revenue);
    const T_Deductions = sumBucket(dreBuckets.deductions);
    const T_Costs = sumBucket(dreBuckets.costs);
    const T_OpExp = sumBucket(dreBuckets.opExpenses);
    const T_AdminExp = sumBucket(dreBuckets.adminExpenses);
    const T_Fin = sumBucket(dreBuckets.financial);
    const T_OtherRev = sumBucket(dreBuckets.otherRev);
    const T_OtherExp = sumBucket(dreBuckets.otherExp);

    // Results (Arrays)
    const R_NetRevenue = {
        budget: T_Revenue.budget.map((v, i) => v - Math.abs(T_Deductions.budget[i])),
        realized: T_Revenue.realized.map((v, i) => v - Math.abs(T_Deductions.realized[i]))
    };

    const R_GrossMargin = {
        budget: R_NetRevenue.budget.map((v, i) => v - Math.abs(T_Costs.budget[i])),
        realized: R_NetRevenue.realized.map((v, i) => v - Math.abs(T_Costs.realized[i]))
    };

    const R_ContribMargin = {
        budget: R_GrossMargin.budget.map((v, i) => v - Math.abs(T_OpExp.budget[i])),
        realized: R_GrossMargin.realized.map((v, i) => v - Math.abs(T_OpExp.realized[i]))
    };

    // EBITDA = Contrib Margin - Admin Expenses
    const R_EBITDA = {
        budget: R_ContribMargin.budget.map((v, i) => v - Math.abs(T_AdminExp.budget[i])),
        realized: R_ContribMargin.realized.map((v, i) => v - Math.abs(T_AdminExp.realized[i]))
    };

    const R_NetProfit = {
        budget: R_EBITDA.budget.map((v, i) => v + T_OtherRev.budget[i] - Math.abs(T_OtherExp.budget[i]) - Math.abs(T_Fin.budget[i])),
        realized: R_EBITDA.realized.map((v, i) => v + T_OtherRev.realized[i] - Math.abs(T_OtherExp.realized[i]) - Math.abs(T_Fin.realized[i]))
    };

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
                    categoryId,
                    costCenterId: selectedCostCenter,
                    month: monthIndex,
                    year: new Date().getFullYear(),
                    amount: numericValue
                })
            });
        } catch (error) {
            console.error('Save failed', error);
        }
    };

    // Recursive Row Renderer
    const renderNode = (node: CategoryNode) => {
        const totals = nodeTotals.get(node.id) || { budget: new Array(12).fill(0), realized: new Array(12).fill(0) };
        const isExpanded = expandedRows.has(node.id);
        const hasChildren = node.children.length > 0;
        const isRoot = node.level === 0;

        return (
            <React.Fragment key={node.id}>
                {/* Check if this is a "Folder" (Has Children) or "File" (Leaf) */}
                <tr
                    onClick={() => hasChildren && toggleRow(node.id)}
                    style={{
                        background: hasChildren ? (isRoot ? '#f1f5f9' : '#f8fafc') : 'white',
                        fontWeight: hasChildren ? 600 : 400,
                        cursor: hasChildren ? 'pointer' : 'default',
                        borderBottom: '1px solid #e2e8f0'
                    }}
                >
                    <td style={{
                        padding: '0.5rem',
                        paddingLeft: `${0.5 + (node.level * 1.5)}rem`, // Recursive Indent
                        position: 'sticky',
                        left: 0,
                        background: hasChildren ? (isRoot ? '#f1f5f9' : '#f8fafc') : 'white',
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        color: hasChildren ? '#0f172a' : '#334155',
                        fontSize: '0.8rem'
                    }}>
                        {hasChildren && (
                            <span style={{ marginRight: '0.5rem', fontSize: '0.7rem', width: '1rem' }}>
                                {isExpanded ? '▼' : '▶'}
                            </span>
                        )}
                        {!hasChildren && <span style={{ width: '1.5rem' }}></span>}
                        {node.name}
                    </td>

                    {MONTHS.map((_, i) => (
                        <React.Fragment key={i}>
                            {/* Budget Column */}
                            <td style={{ borderLeft: '1px solid #e2e8f0', padding: hasChildren ? '0.5rem' : '0' }}>
                                {hasChildren ? (
                                    <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>{formatCurrency(totals.budget[i])}</div>
                                ) : (
                                    <input
                                        key={`${node.id}-${i}-${selectedCostCenter}-${selectedYear}`}
                                        type="text"
                                        placeholder="0,00"
                                        onBlur={(e) => handleBudgetChange(node.id, i, e.target.value)}
                                        defaultValue={totals.budget[i] ? totals.budget[i].toFixed(2) : ''}
                                        style={{ width: '100%', padding: '0.5rem', border: 'none', textAlign: 'right', background: 'transparent', fontSize: '0.75rem' }}
                                    />
                                )}
                            </td>

                            {/* Realized Column */}
                            <td style={{ textAlign: 'right', padding: '0.5rem', color: hasChildren ? 'blue' : '#3b82f6', fontSize: '0.8rem', fontWeight: hasChildren ? 600 : 500 }}>
                                {formatCurrency(totals.realized[i])}
                            </td>
                        </React.Fragment>
                    ))}
                </tr>

                {/* Render Children if Expanded */}
                {isExpanded && node.children.map(child => renderNode(child))}
            </React.Fragment>
        );
    };

    const renderResultRow = (label: string, budget: number[], realized: number[], isMain = true) => (
        <tr key={label} style={{ background: isMain ? '#cbd5e1' : '#e2e8f0', fontWeight: 'bold', borderTop: '2px solid #94a3b8', borderBottom: '2px solid #94a3b8' }}>
            <td style={{ padding: '0.75rem', position: 'sticky', left: 0, background: isMain ? '#cbd5e1' : '#e2e8f0', zIndex: 10 }}>{label}</td>
            {MONTHS.map((_, i) => (
                <React.Fragment key={i}>
                    <td style={{ textAlign: 'right', padding: '0.75rem' }}>{formatCurrency(budget[i])}</td>
                    <td style={{ textAlign: 'right', padding: '0.75rem', color: isMain ? 'blue' : 'inherit' }}>{formatCurrency(realized[i])}</td>
                </React.Fragment>
            ))}
        </tr>
    );

    return (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: 'white' }}>
            {/* Header Controls */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Centro de Custo</label>
                        <select
                            value={selectedCostCenter}
                            onChange={(e) => setSelectedCostCenter(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', minWidth: '200px' }}
                        >
                            {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Ano</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        >
                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
                {categories.length > 0 && <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>● {categories.length} Categorias (Dinâmico)</div>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '1rem', textAlign: 'left', minWidth: '300px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 20 }}>Categorias Financeiras</th>
                        {MONTHS.map((m) => <th key={m} colSpan={2} style={{ textAlign: 'center', padding: '0.5rem', borderLeft: '1px solid #cbd5e1' }}>{m}</th>)}
                    </tr>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 20 }}></th>
                        {MONTHS.map((_, i) => (
                            <React.Fragment key={i}>
                                <th style={{ padding: '0.3rem', fontSize: '0.7rem', color: '#64748b', borderLeft: '1px solid #e2e8f0' }}>Orçado</th>
                                <th style={{ padding: '0.3rem', fontSize: '0.7rem', color: '#64748b' }}>Realizado</th>
                            </React.Fragment>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {/* Dynamic Rendering Loop based on Accounting Buckets */}

                    {/* 1. Revenue */}
                    {dreBuckets.revenue.map(renderNode)}

                    {/* 2. Deductions */}
                    {dreBuckets.deductions.map(renderNode)}

                    {/* Result: Net Revenue */}
                    {renderResultRow('02T 3 - Receita Líquida', R_NetRevenue.budget, R_NetRevenue.realized)}

                    {/* 3. Costs */}
                    {dreBuckets.costs.map(renderNode)}

                    {/* Result: Gross Margin */}
                    {renderResultRow('03T 5 - Margem Bruta', R_GrossMargin.budget, R_GrossMargin.realized)}

                    {/* 4. Operating Expenses */}
                    {dreBuckets.opExpenses.map(renderNode)}

                    {/* Result: Contribution Margin */}
                    {renderResultRow('04T 7 - Margem de Contribuição', R_ContribMargin.budget, R_ContribMargin.realized)}

                    {/* 5. Admin Expenses */}
                    {dreBuckets.adminExpenses.map(renderNode)}

                    {/* Result: EBITDA */}
                    {renderResultRow('05T 9 - EBITDA', R_EBITDA.budget, R_EBITDA.realized)}

                    {/* 6. Financial */}
                    {dreBuckets.financial.map(renderNode)}

                    {/* 7. Others */}
                    {dreBuckets.otherRev.map(renderNode)}
                    {dreBuckets.otherExp.map(renderNode)}

                    {/* Unclassified */}
                    {dreBuckets.unclassified.length > 0 && (
                        <>
                            <tr style={{ background: '#fff7ed', fontWeight: 'bold' }}>
                                <td colSpan={100} style={{ padding: '0.5rem', color: '#c2410c' }}>Outras Categorias (Não Mapeadas)</td>
                            </tr>
                            {dreBuckets.unclassified.map(renderNode)}
                        </>
                    )}

                    <tr style={{ background: '#f8fafc' }}><td colSpan={100} style={{ padding: '0.5rem' }}></td></tr>

                    {/* Final Result: Net Profit */}
                    {renderResultRow('06T 11 - Lucro Líquido', R_NetProfit.budget, R_NetProfit.realized)}
                </tbody>
            </table>

            {loading && <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Sincronizando dados...</div>}
        </div>
    );
}
