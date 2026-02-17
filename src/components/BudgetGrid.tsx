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

    // --- Bucketing Strategy: ROOTS AS SECTIONS ---
    // We treat the Roots of the tree as the main DRE sections.
    // If the chart of accounts is well structured, Roots will be "1 - Receitas", "2 - Despesas", etc.
    const sections = useMemo(() => {
        return treeRoots.map(root => ({
            rootNode: root,
            totals: nodeTotals.get(root.id) || { budget: new Array(12).fill(0), realized: new Array(12).fill(0) }
        }));
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
        // ... (save logic)
    };

    // Recursive Row Renderer
    const renderNode = (node: CategoryNode) => {
        const totals = nodeTotals.get(node.id) || { budget: new Array(12).fill(0), realized: new Array(12).fill(0) };
        const isExpanded = expandedRows.has(node.id);
        const hasChildren = node.children.length > 0;
        const isRoot = node.level === 0;

        return (
            <React.Fragment key={node.id}>
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
                        paddingLeft: `${0.5 + (node.level * 1.5)}rem`,
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
                            <td style={{ borderLeft: '1px solid #e2e8f0', padding: hasChildren ? '0.5rem' : '0' }}>
                                {hasChildren ? (
                                    <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>{formatCurrency(totals.budget[i])}</div>
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="0,00"
                                        onBlur={(e) => handleBudgetChange(node.id, i, e.target.value)}
                                        defaultValue={totals.budget[i] ? totals.budget[i].toFixed(2) : ''}
                                        style={{ width: '100%', padding: '0.5rem', border: 'none', textAlign: 'right', background: 'transparent', fontSize: '0.75rem' }}
                                    />
                                )}
                            </td>

                            <td
                                onClick={() => handleCellClick(node.id, i, node.name)}
                                style={{
                                    textAlign: 'right',
                                    padding: '0.5rem',
                                    color: hasChildren ? 'blue' : '#3b82f6',
                                    fontSize: '0.8rem',
                                    fontWeight: hasChildren ? 600 : 500,
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    textUnderlineOffset: '2px'
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
                        <th style={{ padding: '1rem', textAlign: 'left', minWidth: '300px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 20 }}>Categorias (Estrutura Fiel Conta Azul)</th>
                        {MONTHS.map((m) => <th key={m} colSpan={2} style={{ textAlign: 'center', padding: '0.5rem', borderLeft: '1px solid #cbd5e1' }}>{m}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {/* Render Roots directly. No manual buckets. */}
                    {treeRoots.map(root => renderNode(root))}

                    {/* We can calculate a Grand Total (Net Result) by summing everything if needed, 
                        BUT CA structure usually has "Receitas" separate from "Despesas". 
                        The Net Result is (Sum of Roots). Check if expense roots are negative? 
                        In CA, expenses usually come positive. We might need to handle signs. 
                        For now, we list values as is. 
                        
                        To display a Net Result (Lucro/Prejuizo), we need to know which Root is which.
                        If strict, we can't guess. We'll show the Total row at bottom as "Net Cash Flow"
                    */}
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
