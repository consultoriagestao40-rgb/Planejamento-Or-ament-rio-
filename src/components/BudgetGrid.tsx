'use client';
// V47.18 - Strict ID-Based DRE Tree (No Heuristics)

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
            // Level 4 Drill-Down: Fetch specific transactions for this category/month
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

    // --- STRICT ID-BASED TREE BUILDER ---
    const treeRoots = useMemo(() => {
        const map = new Map<string, CategoryNode>();
        const roots: CategoryNode[] = [];

        // 1. Initialize Nodes
        categories.forEach(cat => {
            map.set(cat.id, { ...cat, children: [], level: 0 });
        });

        // 2. Build Hierarchy using PARENT ID only
        categories.forEach(cat => {
            const node = map.get(cat.id)!;

            if (cat.parentId && map.has(cat.parentId)) {
                // Has Parent -> Is Child
                const parent = map.get(cat.parentId)!;
                node.level = parent.level + 1;
                parent.children.push(node);
            } else {
                // No Parent -> Is Root
                roots.push(node);
            }
        });

        // 3. Sort by Name (for display order)
        const sortRecursive = (nodes: CategoryNode[]) => {
            nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            nodes.forEach(n => sortRecursive(n.children));
        };
        sortRecursive(roots);

        return roots;
    }, [categories]);

    // --- RECURSIVE TOTALS (Bottom-Up Aggregation) ---
    // Rule: Parent Total = Sum of Children + Direct Transactions (if any)
    const nodeTotals = useMemo(() => {
        const totalsMap = new Map<string, { budget: number[], realized: number[] }>();

        const calculateNode = (node: CategoryNode) => {
            // Recurse first to get children totals
            const childrenTotals = node.children.map(calculateNode);

            const myBudget = new Array(12).fill(0);
            const myRealized = new Array(12).fill(0);

            // 1. Sum Children
            childrenTotals.forEach(childTotal => {
                for (let i = 0; i < 12; i++) {
                    myBudget[i] += childTotal.budget[i];
                    myRealized[i] += childTotal.realized[i];
                }
            });

            // 2. Add Own Values (Direct Transactions at this level)
            // Note: In pure DRE, usually only leaves have transactions, but we handle mixed cases safely.
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
    // The user wants a DRE, which is a Calculated Report, not just a list of categories.
    // We must group the Strict Roots into DRE Sections to calculate Margins.
    const dreStructure = useMemo(() => {
        // Helper to sum a list of roots for a given month
        const sumRoots = (roots: CategoryNode[], monthIdx: number, type: 'budget' | 'realized') => {
            return roots.reduce((acc, root) => {
                const total = nodeTotals.get(root.id);
                return acc + (total ? total[type][monthIdx] : 0);
            }, 0);
        };

        // Bucketer: Sorts Roots into DRE blocks based on their Number prefix (1, 2, 3...)
        // This is standard accounting (Plano de Contas Referencial) and much safer than Name guessing.
        const buckets = {
            grossRevenue: [] as CategoryNode[], // 1
            deductions: [] as CategoryNode[],   // 2
            costs: [] as CategoryNode[],        // 3 (or 4 depending on setup)
            opExpenses: [] as CategoryNode[],   // 4, 5, 6
            financial: [] as CategoryNode[],    // 9 (Resultados Financeiros)
            other: [] as CategoryNode[]         // Others
        };

        treeRoots.forEach(root => {
            // "01 1 - Receitas" -> Clean to "1"
            // "2 - Impostos" -> Clean to "2"
            const firstPart = root.name.split(/[ -.]+/)[0];
            const prefix = parseInt(firstPart, 10);

            if (prefix === 1 || root.name.startsWith('1')) buckets.grossRevenue.push(root);
            else if (prefix === 2 || root.name.startsWith('2')) buckets.deductions.push(root);
            else if (prefix === 3 || root.name.startsWith('3')) buckets.costs.push(root);
            else if ((prefix >= 4 && prefix <= 8) || root.name.startsWith('4')) buckets.opExpenses.push(root);
            else if (prefix === 9 || root.name.startsWith('9')) buckets.financial.push(root);
            else buckets.other.push(root);
        });

        // Computed Rows Logic
        return {
            buckets,
            calculateTotals: (monthIdx: number) => {
                const grossRev = {
                    budget: sumRoots(buckets.grossRevenue, monthIdx, 'budget'),
                    realized: sumRoots(buckets.grossRevenue, monthIdx, 'realized')
                };
                const ded = {
                    budget: sumRoots(buckets.deductions, monthIdx, 'budget'), // Usually negative in DRE logic? check sign.
                    realized: sumRoots(buckets.deductions, monthIdx, 'realized')
                };

                // Net Revenue = Gross - Deductions (Assuming Deductions are stored as positive values in DB, we subtract. If stored negative, we add).
                // Usually Expense/Deductions api returns Positive numbers. so we sbtract.
                const netRev = {
                    budget: grossRev.budget - Math.abs(ded.budget),
                    realized: grossRev.realized - Math.abs(ded.realized)
                };

                const costs = {
                    budget: sumRoots(buckets.costs, monthIdx, 'budget'),
                    realized: sumRoots(buckets.costs, monthIdx, 'realized')
                };

                const grossMargin = {
                    budget: netRev.budget - Math.abs(costs.budget),
                    realized: netRev.realized - Math.abs(costs.realized)
                };

                const opExp = {
                    budget: sumRoots(buckets.opExpenses, monthIdx, 'budget'),
                    realized: sumRoots(buckets.opExpenses, monthIdx, 'realized')
                };

                const ebitda = {
                    budget: grossMargin.budget - Math.abs(opExp.budget),
                    realized: grossMargin.realized - Math.abs(opExp.realized)
                };

                const fin = {
                    budget: sumRoots(buckets.financial, monthIdx, 'budget'),
                    realized: sumRoots(buckets.financial, monthIdx, 'realized')
                };

                const netProfit = {
                    budget: ebitda.budget + fin.budget, // Financial result can be positive or negative
                    realized: ebitda.realized + fin.realized
                };

                return { grossRev, ded, netRev, costs, grossMargin, opExp, ebitda, fin, netProfit };
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

        // Debounced Save (simplified for clarity)
        try {
            await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: 'demo-tenant', // placeholder
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
        // const isRoot = node.level === 0; // Not used in new layout

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

    // Summary Row Renderer (Results)
    const renderSummaryRow = (label: string, dataKey: string, isBold = false, bgColor = '#f8fafc', textColor = '#0f172a') => (
        <tr style={{ background: bgColor, borderBottom: '1px solid #e2e8f0', fontWeight: isBold ? 700 : 600 }}>
            <td style={{ padding: '0.75rem', position: 'sticky', left: 0, background: bgColor, zIndex: 10, color: textColor, fontSize: '0.85rem' }}>
                {label}
            </td>
            {MONTHS.map((_, i) => {
                const vals = dreStructure.calculateTotals(i) as any;
                const val = vals[dataKey];
                return (
                    <React.Fragment key={i}>
                        <td style={{ textAlign: 'right', padding: '0.75rem', borderLeft: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem' }}>
                            {formatCurrency(val.budget)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.75rem', color: textColor, fontSize: '0.8rem' }}>
                            {formatCurrency(val.realized)}
                        </td>
                    </React.Fragment>
                );
            })}
        </tr>
    );

    return (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: 'white' }}>
            {/* Header / Month Controls */}
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
                    {/* 1. Receita Operacional Bruta */}
                    {dreStructure.buckets.grossRevenue.map(root => renderNode(root))}
                    {renderSummaryRow('(=) Receita Líquida', 'netRev', true, '#eff6ff', '#1e3a8a')}

                    {/* 2. Deduções (Rendered if any exist, usually implied negative in logic but listed here) */}
                    {dreStructure.buckets.deductions.length > 0 && (
                        <>
                            {/* Section Header if needed */}
                            <tr style={{ background: '#f1f5f9' }}><td colSpan={25} style={{ padding: '0.5rem', fontWeight: 'bold', fontSize: '0.75rem', color: '#64748b' }}>(-) Deduções</td></tr>
                            {dreStructure.buckets.deductions.map(root => renderNode(root))}
                        </>
                    )}

                    {/* 3. Custos */}
                    <tr style={{ background: '#f1f5f9' }}><td colSpan={25} style={{ padding: '0.5rem', fontWeight: 'bold', fontSize: '0.75rem', color: '#64748b' }}>(-) Custos Variáveis</td></tr>
                    {dreStructure.buckets.costs.map(root => renderNode(root))}
                    {renderSummaryRow('(=) Margem Bruta', 'grossMargin', true, '#f0fdf4', '#14532d')}

                    {/* 4. Despesas Operacionais */}
                    <tr style={{ background: '#f1f5f9' }}><td colSpan={25} style={{ padding: '0.5rem', fontWeight: 'bold', fontSize: '0.75rem', color: '#64748b' }}>(-) Despesas Operacionais</td></tr>
                    {dreStructure.buckets.opExpenses.map(root => renderNode(root))}
                    {renderSummaryRow('(=) EBITDA', 'ebitda', true, '#fff7ed', '#7c2d12')}

                    {/* 5. Outros/Financeiro */}
                    {dreStructure.buckets.financial.map(root => renderNode(root))}
                    {dreStructure.buckets.other.map(root => renderNode(root))}

                    {/* Final Result */}
                    {renderSummaryRow('(=) Lucro/Prejuízo Líquido', 'netProfit', true, '#1e293b', '#fbbf24')}
                </tbody>
            </table>

            {/* Modal - Same as before */}
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
