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

    // DRE Logic and Calculations
    const calculateTotals = (list: any[], values: Record<string, number>) => {
        const getVal = (catId: string, month: number) => values[`${catId}-${month}`] || 0;

        const sumBySection = (section: string) => {
            const totals = new Array(12).fill(0);
            list.filter(c => c.entradaDre === section).forEach(c => {
                for (let i = 0; i < 12; i++) totals[i] += getVal(c.id, i);
            });
            return totals;
        };

        const rBruta = sumBySection('RECEITAS');
        const tributos = sumBySection('DEDUCOES');
        const rLiquida = rBruta.map((v, i) => v - Math.abs(tributos[i]));
        const custos = sumBySection('CUSTOS');
        const mBruta = rLiquida.map((v, i) => v - Math.abs(custos[i]));
        const dComerciais = sumBySection('DESPESAS_COMERCIAIS');
        const mContrib = mBruta.map((v, i) => v - Math.abs(dComerciais[i]));
        const dAdmins = sumBySection('DESPESAS_ADMINISTRATIVAS');
        const ebitda = mContrib.map((v, i) => v - Math.abs(dAdmins[i]));
        const dFinanc = sumBySection('DESPESSAS_FINANCEIRAS');
        const oReceitas = sumBySection('OUTRAS_RECEITAS_NAO_OPERACIONAIS');
        const oDespesas = sumBySection('OUTRAS_DESPESAS_NAO_OPERACIONAIS');
        const lLiquido = ebitda.map((v, i) => v - Math.abs(dFinanc[i]) + oReceitas[i] - Math.abs(oDespesas[i]));

        return { rBruta, tributos, rLiquida, custos, mBruta, dComerciais, mContrib, dAdmins, ebitda, dFinanc, oReceitas, oDespesas, lLiquido };
    };

    const budgetDRE = calculateTotals(categories, budgetValues);
    const realizedDRE = calculateTotals(categories, realizedValues);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

    const renderDRELine = (label: string, budgetLine: number[], realizedLine: number[], isMain = false) => (
        <tr style={{ background: isMain ? '#e2e8f0' : '#f1f5f9', fontWeight: 'bold', borderTop: '1px solid #94a3b8' }}>
            <td style={{ padding: '0.75rem', position: 'sticky', left: 0, background: isMain ? '#e2e8f0' : '#f1f5f9', zIndex: 10 }}>{label}</td>
            {MONTHS.map((_, i) => (
                <React.Fragment key={i}>
                    <td style={{ textAlign: 'right', padding: '0.75rem' }}>{formatCurrency(budgetLine[i])}</td>
                    <td style={{ textAlign: 'right', padding: '0.75rem', color: isMain ? 'blue' : 'inherit' }}>{formatCurrency(realizedLine[i])}</td>
                </React.Fragment>
            ))}
        </tr>
    );

    const renderCategoryRows = (parentId: string | null = null, level = 1): React.ReactNode[] => {
        const children = categories.filter(c => c.parentId === parentId);
        return children.flatMap(cat => {
            const hasChildren = categories.some(c => c.parentId === cat.id);
            const isVisible = !cat.parentId || (expandedRows.has(cat.parentId) && (level <= 2 || expandedRows.has(cat.parentId)));
            // Simplified visibility: root and 1st level children usually visible or based on expanded

            if (!isVisible) return [];

            const row = (
                <tr key={cat.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{
                        padding: '0.5rem',
                        paddingLeft: `${level * 1}rem`,
                        position: 'sticky',
                        left: 0,
                        background: 'white',
                        zIndex: 5,
                        fontWeight: hasChildren ? 600 : 400
                    }}>
                        {hasChildren && (
                            <button
                                onClick={() => toggleRow(cat.id)}
                                style={{ marginRight: '0.4rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.7rem' }}
                            >
                                {expandedRows.has(cat.id) ? '▼' : '▶'}
                            </button>
                        )}
                        {cat.name}
                    </td>
                    {MONTHS.map((_, i) => (
                        <React.Fragment key={i}>
                            <td style={{ borderLeft: '1px solid #f0f0f0', padding: '0' }}>
                                <input
                                    type="text"
                                    placeholder="0,00"
                                    onBlur={(e) => handleBudgetChange(cat.id, i, e.target.value)}
                                    defaultValue={budgetValues[`${cat.id}-${i}`] ? budgetValues[`${cat.id}-${i}`].toFixed(2) : ''}
                                    style={{ width: '100%', padding: '0.5rem', border: 'none', textAlign: 'right', background: 'transparent' }}
                                />
                            </td>
                            <td style={{ textAlign: 'right', padding: '0.5rem', color: '#666' }}>
                                {formatCurrency(realizedValues[`${cat.id}-${i}`])}
                            </td>
                        </React.Fragment>
                    ))}
                </tr>
            );

            return [row, ...(expandedRows.has(cat.id) ? renderCategoryRows(cat.id, level + 1) : [])];
        });
    };

    const renderCategoriesForSection = (section: string, parentId: string | null = null, level = 1): React.ReactNode[] => {
        return categories
            .filter(c => c.entradaDre === section && c.parentId === parentId)
            .flatMap(cat => {
                const hasChildren = categories.some(c => c.parentId === cat.id);
                const row = (
                    <tr key={cat.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{
                            padding: '0.5rem',
                            paddingLeft: `${level * 1}rem`,
                            position: 'sticky',
                            left: 0,
                            background: 'white',
                            zIndex: 5,
                            fontWeight: hasChildren ? 600 : 400
                        }}>
                            {hasChildren && (
                                <button
                                    onClick={() => toggleRow(cat.id)}
                                    style={{ marginRight: '0.4rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.7rem' }}
                                >
                                    {expandedRows.has(cat.id) ? '▼' : '▶'}
                                </button>
                            )}
                            {cat.name}
                        </td>
                        {MONTHS.map((_, i) => (
                            <React.Fragment key={i}>
                                <td style={{ borderLeft: '1px solid #f0f0f0', padding: '0' }}>
                                    <input
                                        type="text"
                                        placeholder="0,00"
                                        onBlur={(e) => handleBudgetChange(cat.id, i, e.target.value)}
                                        defaultValue={budgetValues[`${cat.id}-${i}`] ? budgetValues[`${cat.id}-${i}`].toFixed(2) : ''}
                                        style={{ width: '100%', padding: '0.5rem', border: 'none', textAlign: 'right', background: 'transparent' }}
                                    />
                                </td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', color: '#666' }}>
                                    {formatCurrency(realizedValues[`${cat.id}-${i}`])}
                                </td>
                            </React.Fragment>
                        ))}
                    </tr>
                );
                return [row, ...(expandedRows.has(cat.id) ? renderCategoriesForSection(section, cat.id, level + 1) : [])];
            });
    };


    return (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: 'white' }}>
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label style={{ fontWeight: 600 }}>Centro de Custo:</label>
                    <select
                        value={selectedCostCenter}
                        onChange={(e) => setSelectedCostCenter(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    >
                        {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </select>
                </div>
                {categories.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                        ● {categories.length} Categorias Importadas
                    </div>
                )}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '1rem', textAlign: 'left', minWidth: '300px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 20 }}>Categorias Financeiras</th>
                        {MONTHS.map((m) => (
                            <th key={m} colSpan={2} style={{ textAlign: 'center', padding: '0.5rem', borderLeft: '1px solid #cbd5e1' }}>{m}</th>
                        ))}
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
                    {/* Dynamic DRE Structure */}
                    {renderDRELine('01T Receita Bruta', budgetDRE.rBruta, realizedDRE.rBruta)}
                    {renderCategoriesForSection('RECEITAS')}

                    {renderDRELine('02 2 - Tributo Sobre Faturamento', budgetDRE.tributos, realizedDRE.tributos)}
                    {renderCategoriesForSection('DEDUCOES')}

                    {renderDRELine('02T 3 - Receita Líquida', budgetDRE.rLiquida, realizedDRE.rLiquida, true)}

                    {renderDRELine('03 4 - Custos Operacionais', budgetDRE.custos, realizedDRE.custos)}
                    {renderCategoriesForSection('CUSTOS')}

                    {renderDRELine('03T 5 - Margem Bruta', budgetDRE.mBruta, realizedDRE.mBruta, true)}

                    {renderDRELine('04 6 - Despesa Comercial', budgetDRE.dComerciais, realizedDRE.dComerciais)}
                    {renderCategoriesForSection('DESPESAS_COMERCIAIS')}

                    {renderDRELine('04T 7 - Margem de Contribuição', budgetDRE.mContrib, realizedDRE.mContrib, true)}

                    {renderDRELine('05 8 - Despesa Administrativa', budgetDRE.dAdmins, realizedDRE.dAdmins)}
                    {renderCategoriesForSection('DESPESAS_ADMINISTRATIVAS')}

                    {renderDRELine('05T 9 - EBITDA', budgetDRE.ebitda, realizedDRE.ebitda, true)}

                    {renderDRELine('06 10 - Despesa Financeira', budgetDRE.dFinanc, realizedDRE.dFinanc)}
                    {renderCategoriesForSection('DESPESSAS_FINANCEIRAS')}

                    {renderDRELine('07 - Outras Receitas Não Operacionais', budgetDRE.oReceitas, realizedDRE.oReceitas)}
                    {renderCategoriesForSection('OUTRAS_RECEITAS_NAO_OPERACIONAIS')}

                    {renderDRELine('08 - Outras Despesas Não Operacionais', budgetDRE.oDespesas, realizedDRE.oDespesas)}
                    {renderCategoriesForSection('OUTRAS_DESPESAS_NAO_OPERACIONAIS')}

                    {renderDRELine('06T 11 - Lucro Líquido', budgetDRE.lLiquido, realizedDRE.lLiquido, true)}
                </tbody>
            </table>

            {loading && <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Sincronizando dados com Conta Azul...</div>}
            {error && <div style={{ padding: '1rem', color: '#dc2626', background: '#fef2f2', marginTop: '1rem', borderRadius: '4px' }}>{error}</div>}
        </div>
    );
}
