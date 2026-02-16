'use client';

import React, { useState } from 'react';
import { MONTHS, MOCK_CATEGORIES, MOCK_COST_CENTERS } from '@/lib/mock-data';

export function BudgetGrid() {
    const [budgetValues, setBudgetValues] = useState<Record<string, number>>({});
    const [realizedValues, setRealizedValues] = useState<Record<string, number>>({});
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [selectedCostCenter, setSelectedCostCenter] = useState('DEFAULT');

    const [categories, setCategories] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>(MOCK_COST_CENTERS);
    const [error, setError] = useState<string | null>(null);

    React.useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const [setupRes, budgetRes, syncRes] = await Promise.all([
                    fetch('/api/setup', { cache: 'no-store' }),
                    fetch(`/api/budgets?costCenterId=${selectedCostCenter}`, { cache: 'no-store' }),
                    fetch(`/api/sync?costCenterId=${selectedCostCenter}`, { cache: 'no-store' })
                ]);

                const setupData = await setupRes.json();
                const budgetData = await budgetRes.json();
                const syncData = await syncRes.json();

                if (setupData.success) {
                    setCategories(setupData.categories);
                    if (setupData.costCenters.length > 0) {
                        setCostCenters([...MOCK_COST_CENTERS.filter(m => m.id === 'DEFAULT'), ...setupData.costCenters]);
                    }
                    // Auto-expand all roots by default
                    setExpandedRows(new Set(setupData.categories.filter((c: any) => !c.parentId).map((c: any) => c.id)));
                } else {
                    console.warn('Setup failed:', setupData.error);
                }

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

        loadData();
    }, [selectedCostCenter]);

    // DRE Sections Mapping
    const DRE_MAP: Record<string, string> = {
        'RECEITAS': '01 1 - Receitas',
        'DEDUCOES': '02 2 - Tributo Sobre Faturamento',
        'CUSTOS': '03 4 - Custos Operacionais',
        'DESPESAS_COMERCIAIS': '04 6 - Despesa Comercial',
        'DESPESAS_ADMINISTRATIVAS': '05 8 - Despesa Administrativa',
        'DESPESSAS_FINANCEIRAS': '06 10 - Despesa Financeira',
        'OUTRAS_RECEITAS_NAO_OPERACIONAIS': '07 - Outras Receitas',
        'OUTRAS_DESPESAS_NAO_OPERACIONAIS': '08 - Outras Despesas'
    };

    // Hierarchy Builder
    const buildCategoryTree = (list: any[], parentId: string | null = null, level = 1): any[] => {
        // If it's the root level and we have DRE metadata, we might want to group by DRE_MAP
        if (level === 1 && list.some(c => c.entradaDre)) {
            const sections = Array.from(new Set(list.map(c => c.entradaDre).filter(Boolean)));
            return sections.flatMap(section => {
                const sectionName = DRE_MAP[section as string] || section;
                const children = list.filter(c => c.entradaDre === section && !c.parentId);
                return [
                    { id: `section-${section}`, name: sectionName as string, level: 1, isSection: true },
                    ...children.flatMap(c => [
                        { ...c, level: 2, parentId: `section-${section}` },
                        ...buildCategoryTree(list, c.id, 3)
                    ])
                ];
            });
        }

        return list
            .filter(c => c.parentId === parentId)
            .flatMap(c => [
                { ...c, level },
                ...buildCategoryTree(list, c.id, level + 1)
            ]);
    };

    const displayCategories = categories.length > 0 ? buildCategoryTree(categories) : MOCK_CATEGORIES;

    const isRowVisible = (cat: any): boolean => {
        if (!cat.parentId) return true;
        const parent = displayCategories.find(c => c.id === cat.parentId);
        if (!parent) return true;
        return expandedRows.has(parent.id) && isRowVisible(parent);
    };

    const visibleCategories = displayCategories.filter(isRowVisible);

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedRows(newExpanded);
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

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

    return (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontWeight: 500 }}>Centro de Custo:</label>
                    <select
                        value={selectedCostCenter}
                        onChange={(e) => setSelectedCostCenter(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', minWidth: '200px' }}
                    >
                        {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </select>
                </div>
                {categories.length > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'green', fontWeight: 'bold' }}>
                        ✅ {categories.length} Categorias Carregadas
                    </span>
                )}
            </div>

            {error && <div style={{ color: 'red', marginBottom: '1rem' }}>Erro ao carregar: {error}</div>}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                    <tr style={{ background: 'hsl(var(--muted))' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '250px', position: 'sticky', left: 0, background: 'hsl(var(--muted))', zIndex: 10 }}>Categoria</th>
                        {MONTHS.map((month) => (
                            <th key={month} colSpan={2} style={{ padding: '0.5rem', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>{month}</th>
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
                    {visibleCategories.map((cat) => {
                        const indent = (cat.level - 1) * 1.5;
                        const hasChildren = displayCategories.some(c => c.parentId === cat.id);
                        const key = cat.id;

                        return (
                            <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
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
                                        <button onClick={() => toggleRow(cat.id)} style={{ marginRight: '0.5rem', border: 'none', background: 'none', cursor: 'pointer' }}>
                                            {expandedRows.has(cat.id) ? '▼' : '▶'}
                                        </button>
                                    )}
                                    {cat.name}
                                </td>
                                {MONTHS.map((_, idx) => {
                                    const cellKey = `${cat.id}-${idx}`;
                                    const budgetVal = budgetValues[cellKey] || 0;
                                    const realizedVal = realizedValues[cellKey] || 0;
                                    return (
                                        <React.Fragment key={idx}>
                                            <td style={{ borderLeft: '1px solid var(--border)', padding: '0' }}>
                                                <input
                                                    type="text"
                                                    placeholder="0,00"
                                                    onChange={(e) => handleBudgetChange(cat.id, idx, e.target.value)}
                                                    style={{ width: '100%', padding: '0.75rem', border: 'none', textAlign: 'right', background: 'transparent' }}
                                                />
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', color: 'hsl(var(--muted-foreground))' }}>
                                                {realizedVal > 0 ? formatCurrency(realizedVal) : '-'}
                                            </td>
                                        </React.Fragment>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {loading && <div style={{ textAlign: 'center', padding: '1rem' }}>Sincronizando...</div>}
        </div>
    );
}
