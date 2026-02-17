'use client';
// V47.41 - Strict Code-Based Hierarchy (01.1.1 -> 01.1 -> 01) + Totals on Top

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
    code?: string; // extracted prefix like "01.1", "02"
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

    // --- STRICT CODE-BASED TREE BUILDER ---
    // User Requirement: "01.1.1" must be child of "01.1", which is child of "01".
    // We strictly use the Account Code (Prefix) to build the hierarchy.
    const treeRoots = useMemo(() => {
        const map = new Map<string, CategoryNode>();
        const roots: CategoryNode[] = [];

        // 1. Initialize Nodes & Extract Codes
        // Sort by Code length (shortest first) so we process parents before children usually
        // But better: Sort alphabetically to ensure 01 comes before 01.1
        const sortedCats = [...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        sortedCats.forEach(cat => {
            // "01.1.1 - Desc" -> Code "01.1.1"
            const codeMatch = cat.name.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : '';

            map.set(cat.id, {
                ...cat,
                code, // Store extracted code
                children: [],
                level: 0
            });
        });

        // 2. Build Hierarchy using CODES
        // We look for the "Best Match Parent" based on code prefix.
        // ex: "01.1.1" looks for "01.1". "01.1" looks for "01".
        sortedCats.forEach(cat => {
            const node = map.get(cat.id)!;

            // If no code, we can't place it in this strict hierarchy easily. 
            // Put it in roots or try legacy parentId? Let's treat as Root for now.
            if (!node.code) {
                roots.push(node);
                return;
            }

            // Find Strict Code Parent
            let parentFound = false;
            let currentPrefix = node.code;

            // "01.1.1" -> try "01.1" -> try "01"
            while (currentPrefix.includes('.')) {
                currentPrefix = currentPrefix.substring(0, currentPrefix.lastIndexOf('.'));

                // Find node with this exact code
                const parentNode = Array.from(map.values()).find(n => n.code === currentPrefix);
                if (parentNode) {
                    node.level = parentNode.level + 1;
                    parentNode.children.push(node);
                    parentFound = true;
                    break;
                }
            }

            // If no "dot parent", maybe it's "01" and we need to see if there's a "0" parent? 
            // Or maybe "01.1" didn't find "01" because "01" has no dots but is a prefix?
            if (!parentFound) {
                // Try finding a parent that is a strict prefix (e.g. Code "01" for "011..."? Unlikely with dots)
                // User uses standard accounting: 1, 1.1, 1.1.1
                // If we are here, it means we found no ancestor. It is a Root of this tree.
                roots.push(node);
            }
        });

        // 3. Final Sort of the Roots
        return roots.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

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

    // --- STRUCTURED DRE BUILDER (User's Exact Mapping) ---
    // Rule: Calculated Totals ALWAYS at the TOP of the group.
    const dreStructure = useMemo(() => {
        const sumRoots = (roots: CategoryNode[], monthIdx: number, type: 'budget' | 'realized') => {
            return roots.reduce((acc, root) => {
                const total = nodeTotals.get(root.id);
                return acc + (total ? total[type][monthIdx] : 0);
            }, 0);
        };

        const buckets = {
            rev: [] as CategoryNode[],        // 01, 02
            taxes: [] as CategoryNode[],      // 03
            costs: [] as CategoryNode[],      // 04
            opExp: [] as CategoryNode[],      // 05, 06
            adminExp: [] as CategoryNode[],   // 07, 08
            fin: [] as CategoryNode[],        // 09, 10
            other: [] as CategoryNode[]
        };

        const getPrefix = (name: string) => {
            const parts = name.split(/[ -.]+/);
            return parts[0];
        };

        treeRoots.forEach(root => {
            const p = getPrefix(root.name);
            const code = root.code || p;

            // Revenue: 01 (Services) & 02 (Sales)
            // Note: Since we built the tree by code, "01.1" is inside "01". 
            // So we only see the ROOT "01" here. That is correct.
            // If "01.1" had no parent "01", it would appear here as a root.
            if (code.startsWith('01') || code.startsWith('1.') || code === '1') buckets.rev.push(root);
            else if (code.startsWith('02') || code.startsWith('2.') || code === '2') buckets.rev.push(root); // User wants 01 & 02 in Revenue

            // Taxes: 03 ? (Implicit from user order) - "2 - Tributos"
            else if (code.startsWith('03') || code.startsWith('3.') || code === '3') buckets.taxes.push(root);

            // Costs: 04
            else if (code.startsWith('04') || code.startsWith('4.') || code === '4') buckets.costs.push(root);

            // OpExp: 05, 06
            else if (code.startsWith('05') || code.startsWith('5.') || code === '5') buckets.opExp.push(root);
            else if (code.startsWith('06') || code.startsWith('6.') || code === '6') buckets.opExp.push(root);

            // AdminExp: 07, 08
            else if (code.startsWith('07') || code.startsWith('7.') || code === '7') buckets.adminExp.push(root);
            else if (code.startsWith('08') || code.startsWith('8.') || code === '8') buckets.adminExp.push(root);

            // FinExp: 09, 10
            else if (code.startsWith('09') || code.startsWith('9.') || code === '9') buckets.fin.push(root);
            else if (code.startsWith('10')) buckets.fin.push(root);

            else buckets.other.push(root);
        });

        // Computed Rows Logic
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
