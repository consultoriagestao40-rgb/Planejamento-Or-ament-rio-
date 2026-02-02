'use client';

import React, { useState } from 'react';
import { MOCK_CATEGORIES, MONTHS, MOCK_COST_CENTERS } from '@/lib/mock-data';

export function BudgetGrid() {
    // State to store budget values: { "categoryId-monthIndex": value }
    const [budgetValues, setBudgetValues] = useState<Record<string, number>>({});
    const [realizedValues, setRealizedValues] = useState<Record<string, number>>({});
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set(['1', '2', '3', '3.1', '3.2']));
    const [loading, setLoading] = useState(true);
    const [selectedCostCenter, setSelectedCostCenter] = useState('DEFAULT');

    // Fetch on mount and when cost center changes
    React.useEffect(() => {
        setLoading(true);
        Promise.all([
            fetch(`/api/budgets?costCenterId=${selectedCostCenter}`).then(res => res.json()),
            fetch(`/api/sync?costCenterId=${selectedCostCenter}`).then(res => res.json())
        ]).then(([budgetData, syncData]) => {
            if (budgetData.success) {
                const values: Record<string, number> = {};
                budgetData.data.forEach((item: any) => {
                    values[`${item.categoryId}-${item.month}`] = item.amount;
                });
                setBudgetValues(values);
            } else {
                setBudgetValues({}); // Clear if error or empty
            }

            if (syncData.success && syncData.realizedValues) {
                setRealizedValues(syncData.realizedValues);
            } else {
                setRealizedValues({});
            }
        })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [selectedCostCenter]);

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    };

    const handleBudgetChange = async (categoryId: string, monthIndex: number, value: string, categoryName: string) => {
        const numericValue = parseFloat(value.replace(/\D/g, '')) / 100;

        // Optimistic update
        setBudgetValues(prev => ({
            ...prev,
            [`${categoryId}-${monthIndex}`]: numericValue
        }));

        try {
            await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryId,
                    categoryName,
                    costCenterId: selectedCostCenter,
                    month: monthIndex,
                    year: new Date().getFullYear(), // Default current year for now
                    amount: numericValue
                })
            });
        } catch (error) {
            console.error('Failed to save', error);
            // Optionally revert state here if needed
        }
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

    // Filter visible rows based on expansion
    const visibleCategories = MOCK_CATEGORIES.filter(cat => {
        if (!cat.parentId) return true;
        // Simple check: if parent is expanded (this logic can be improved for deep nesting)
        return expandedRows.has(cat.parentId) || MOCK_CATEGORIES.find(c => c.id === cat.parentId)?.parentId === undefined;
    });

    return (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>

            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontWeight: 500, color: 'hsl(var(--foreground))' }}>Centro de Custo:</label>
                <select
                    value={selectedCostCenter}
                    onChange={(e) => setSelectedCostCenter(e.target.value)}
                    style={{
                        padding: '0.5rem',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        minWidth: '200px'
                    }}
                >
                    {MOCK_COST_CENTERS.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.name}</option>
                    ))}
                </select>
                {loading && <span style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', marginLeft: 'auto' }}>Carregando dados...</span>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                    <tr style={{ background: 'hsl(var(--muted))' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '200px', position: 'sticky', left: 0, background: 'hsl(var(--muted))', zIndex: 10 }}>Categoria</th>
                        {MONTHS.map((month) => (
                            <th key={month} colSpan={2} style={{ padding: '0.5rem', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                                {month}
                            </th>
                        ))}
                    </tr>
                    <tr style={{ background: 'hsl(var(--muted))', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ position: 'sticky', left: 0, background: 'hsl(var(--muted))', zIndex: 10 }}></th>
                        {MONTHS.map((_, idx) => (
                            <React.Fragment key={idx}>
                                <th style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', borderLeft: '1px solid var(--border)', minWidth: '100px' }}>Orçado</th>
                                <th style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', minWidth: '100px' }}>Realizado</th>
                            </React.Fragment>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {MOCK_CATEGORIES.map((cat) => {
                        // Basic implementation: direct children check would be better recursive, but this works for mock data depth
                        const isChildVisible = !cat.parentId || expandedRows.has(cat.parentId) || (
                            cat.parentId && MOCK_CATEGORIES.find(p => p.id === cat.parentId)?.parentId && expandedRows.has(MOCK_CATEGORIES.find(p => p.id === cat.parentId)!.parentId!)
                        );
                        // Quick hack for visibility based on parent:
                        // Actually, let's just render all for now and hide with style if not expanded logic is complex
                        // Reverting to simple filter logic inside map is tricky. 
                        // Let's just show all for the prototype to avoid complex recursion in one file.
                        const indent = (cat.level - 1) * 1.5;
                        const hasChildren = MOCK_CATEGORIES.some(c => c.parentId === cat.id);

                        return (
                            <tr key={cat.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{
                                    padding: '0.75rem',
                                    paddingLeft: `${0.75 + indent}rem`,
                                    position: 'sticky',
                                    left: 0,
                                    background: 'hsl(var(--card))',
                                    zIndex: 5,
                                    fontWeight: hasChildren ? 600 : 400
                                }}>
                                    {hasChildren && (
                                        <button
                                            onClick={() => toggleRow(cat.id)}
                                            style={{ marginRight: '0.5rem', border: 'none', background: 'none', cursor: 'pointer' }}
                                        >
                                            {expandedRows.has(cat.id) ? '▼' : '▶'}
                                        </button>
                                    )}
                                    {cat.name}
                                </td>
                                {MONTHS.map((_, idx) => {
                                    const key = `${cat.id}-${idx}`;
                                    const budgetVal = budgetValues[key] || 0;
                                    const realizedVal = realizedValues[key] || 0;

                                    return (
                                        <React.Fragment key={idx}>
                                            <td style={{ borderLeft: '1px solid var(--border)', padding: '0' }}>
                                                <input
                                                    type="text"
                                                    placeholder="0,00"
                                                    // Display formatted, simplify edit logic for prototype
                                                    // value={budgetVal ? formatCurrency(budgetVal) : ''} 
                                                    onChange={(e) => handleBudgetChange(cat.id, idx, e.target.value, cat.name)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.75rem',
                                                        border: 'none',
                                                        textAlign: 'right',
                                                        background: 'transparent'
                                                    }}
                                                />
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', color: 'hsl(var(--muted-foreground))' }}>
                                                {realizedVal > 0 ? formatCurrency(realizedVal) : '-'}
                                            </td>
                                        </React.Fragment>
                                    );
                                })
                                }
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div >
    );
}
