'use client';
// V46.1 - Force redeploy with TS fixes applied

import React, { useState } from 'react';
import { MONTHS, MOCK_CATEGORIES, MOCK_COST_CENTERS } from '@/lib/mock-data';

interface BudgetGridProps {
    refreshKey?: number;
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

    // V47.11: Split Effects to prevent Filter Reset (UI Flicker)

    // 1. Setup Effect (Run once or on manual refresh)
    React.useEffect(() => {
        const loadSetup = async () => {
            try {
                const setupRes = await fetch('/api/setup', { cache: 'no-store' });
                const setupData = await setupRes.json();

                if (setupData.success) {
                    // Enrich Categories
                    const enrichedCategories = setupData.categories.map((cat: any) => {
                        let ed = cat.entradaDre;
                        if (!ed) {
                            const n = (cat.name || '').toUpperCase();
                            if (n.includes('RECEITA') || n.includes('VENDA') || n.includes('FATURAMENTO')) ed = 'RECEITAS';
                            else if (n.includes('TRIBUTO') || n.includes('IMPOSTO') || n.includes('DEDUCAO') || n.includes('SIMPLES')) ed = 'DEDUCOES';
                            else if (n.includes('CUSTO') || n.includes('PRODUCAO') || n.includes('MATERIA PRIMA')) ed = 'CUSTOS';
                            else if (n.includes('COMERCIAL') || n.includes('MARKETING') || n.includes('COMISSOES') || n.includes('PROPAGANDA')) ed = 'DESPESAS_COMERCIAIS';
                            else if (n.includes('ADMINISTRA') || n.includes('OPERACIONAL') || n.includes('ALUGUEL') || n.includes('SALARIO') || n.includes('PESSOAL')) ed = 'DESPESAS_ADMINISTRATIVAS';
                            else if (n.includes('FINANCEIRA') || n.includes('JUROS') || n.includes('TARIFA') || n.includes('IOF') || n.includes('BANCARIA')) ed = 'DESPESSAS_FINANCEIRAS';
                            else if (n.includes('OUTRAS RECEITAS')) ed = 'OUTRAS_RECEITAS_NAO_OPERACIONAIS';
                            else if (n.includes('OUTRAS DESPESAS')) ed = 'OUTRAS_DESPESAS_NAO_OPERACIONAIS';
                        }
                        return { ...cat, entradaDre: ed };
                    });

                    setCategories(enrichedCategories);
                    if (setupData.costCenters.length > 0) {
                        setCostCenters([...MOCK_COST_CENTERS.filter(m => m.id === 'DEFAULT'), ...setupData.costCenters]);
                    }

                    // Drill-down: Start collapsed (Visual Cleanliness)
                    // if (expandedRows.size === 0) { ... }
                }
            } catch (err) {
                console.error("Setup Error:", err);
            }
        };
        loadSetup();
    }, [refreshKey]); // Only on mount or Refresh Button

    // 2. Data Effect (Run on Filter Change)
    React.useEffect(() => {
        const loadValues = async () => {
            setLoading(true);
            setError(null);
            try {
                // V47.10: Pass selectedYear to APIs
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

    // DRE Sections Mapping (Visual Headers)
    // DYNAMIC IMPORT STRATEGY (v47.9)
    // We try to find the Root Name in the imported data.
    // If not found, we fallback to generous numeric names.

    // Helper to find the dynamic label from the tree
    const getDynamicLabel = (prefix: string, fallback: string) => {
        if (categories.length === 0) return fallback;
        // Find a root that starts with the prefix (e.g. "6" or "6.")
        const root = categories.find(c => {
            const n = c.name.toUpperCase();
            // Match start of string, followed by dot, space, or dash
            return n.startsWith(prefix + '.') || n.startsWith(prefix + ' ') || n.startsWith(prefix + ' -') || n === prefix;
        });
        return root ? root.name : fallback;
    };

    // Helper: Format Currency
    const formatCurrency = (val: number | undefined) => {
        if (typeof val !== 'number') return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

    const DRE_LAYOUT = [
        {
            id: 'RECEITAS',
            prefix: '1',
            default: '01 1 - Receitas',
            patterns: ['^1(\\.|\\s|$)', 'RECEITA'],
            excludes: ['1.1.1'] // IMPORTANT: Receitas Financeiras must go to Financial Section
        },
        { id: 'DEDUCOES', prefix: '2', default: '02 2 - Tributos sobre Faturamento', patterns: ['^2(\\.|\\s|$)', 'TRIBUTO', 'IMPOSTO', 'DEDUCAO', 'SIMPLES'] },

        { id: 'CUSTOS', prefix: '4', default: '03 4 - Custos Operacionais', patterns: ['^3(\\.|\\s|$)', '^4(\\.|\\s|$)', 'CUSTO', 'PRODUCAO'] },

        // Updated default based on user feedback "Despesas Comerciais não existe" -> "Despesas Operacionais"
        { id: 'DESPESAS_OPERACIONAIS', prefix: '6', default: '04 6 - Despesas Operacionais', patterns: ['^6(\\.|\\s|$)', 'DESPESA', 'OPERACIONAL', 'COMERCIAL'] },

        { id: 'DESPESAS_ADMINISTRATIVAS', prefix: '8', default: '05 8 - Despesas Administrativas', patterns: ['^8(\\.|\\s|$)', 'ADMINISTRA'] },

        // 1.1.1 is strictly mapped here
        { id: 'DESPESSAS_FINANCEIRAS', prefix: '10', default: '06 10 - Despesas Financeiras', patterns: ['^9(\\.|\\s|$)', '^10(\\.|\\s|$)', 'FINANCEIRA', '1.1.1'] },

        { id: 'OUTRAS_RECEITAS', prefix: '7', default: '07 - Outras Receitas', patterns: ['^7(\\.|\\s|$)', 'OUTRAS RECEITAS'] },
        { id: 'OUTRAS_DESPESAS', prefix: '11', default: '08 - Outras Despesas', patterns: ['^11(\\.|\\s|$)', '^12(\\.|\\s|$)', 'OUTRAS DESPESAS'] }
    ];



    // Helper to check if a Root Node belongs to a Section
    const belongsToSection = (node: any, patterns: string[], excludes?: string[]) => {
        const n = node.name.toUpperCase();

        // 1. Check exclusions first
        if (excludes && excludes.length > 0) {
            const matchesExclude = excludes.some(e => n.includes(e.toUpperCase()));
            if (matchesExclude) return false;
        }

        // 2. Check inclusions
        return patterns.some(p => {
            // Handle Regex Pattern Strings
            if (p.startsWith('^')) {
                const regex = new RegExp(p);
                return regex.test(n);
            }
            return n.includes(p);
        });
    };



    // V47.12: Section-Based Drill-Down (Robust to Flat Data)
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    // Toggle Section logic
    const toggleSection = (sectionId: string) => {
        const newSet = new Set(expandedSections);
        if (newSet.has(sectionId)) newSet.delete(sectionId);
        else newSet.add(sectionId);
        setExpandedSections(newSet);
    };

    // Helper: Get categories for a section (Flat List, Sorted)
    const getCategoriesForSection = (patterns: string[], excludes?: string[]) => {
        return categories
            .filter(c => belongsToSection(c, patterns, excludes))
            .sort((a, b) => a.name.localeCompare(b.name));
    };

    // Render a "Folder" Row (The Section Total)
    const renderSectionHeader = (sectionId: string, label: string, budgetVal: number, realizedVal: number, isMain = false) => {
        const isExpanded = expandedSections.has(sectionId);
        return (
            <tr
                key={sectionId}
                onClick={() => toggleSection(sectionId)}
                style={{
                    background: isMain ? '#e2e8f0' : '#f1f5f9',
                    fontWeight: 'bold',
                    borderTop: '1px solid #94a3b8',
                    cursor: 'pointer'
                }}
            >
                <td style={{ padding: '0.75rem', position: 'sticky', left: 0, background: isMain ? '#e2e8f0' : '#f1f5f9', zIndex: 10, display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: '0.5rem', fontSize: '0.8rem', width: '1rem' }}>
                        {isExpanded ? '▼' : '▶'}
                    </span>
                    {label}
                </td>
                {MONTHS.map((_, i) => (
                    <React.Fragment key={i}>
                        <td style={{ textAlign: 'right', padding: '0.75rem' }}>{formatCurrency(budgetVal[i])}</td>
                        <td style={{ textAlign: 'right', padding: '0.75rem', color: isMain ? 'blue' : 'inherit' }}>{formatCurrency(realizedVal[i])}</td>
                    </React.Fragment>
                ))}
            </tr>
        );
    };

    const renderCategoryRows = (sectionCats: any[]) => {
        return sectionCats.map(cat => (
            <tr key={cat.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{
                    padding: '0.5rem',
                    paddingLeft: '2.5rem', // Indent to show it's inside the section
                    position: 'sticky',
                    left: 0,
                    background: 'white',
                    zIndex: 5,
                    color: '#334155',
                    fontSize: '0.8rem'
                }}>
                    {cat.name}
                </td>
                {MONTHS.map((_, i) => (
                    <React.Fragment key={i}>
                        <td style={{ borderLeft: '1px solid #f8fafc', padding: '0' }}>
                            <input
                                type="text"
                                placeholder="0,00"
                                onBlur={(e) => handleBudgetChange(cat.id, i, e.target.value)}
                                defaultValue={budgetValues[`${cat.id}-${i}`] ? budgetValues[`${cat.id}-${i}`].toFixed(2) : ''}
                                style={{ width: '100%', padding: '0.5rem', border: 'none', textAlign: 'right', background: 'transparent', fontSize: '0.75rem' }}
                            />
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 500 }}>
                            {formatCurrency(realizedDRE.getRecursiveVal(cat.id, i))}
                        </td>
                    </React.Fragment>
                ))}
            </tr>
        ));
    };

    return (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: 'white' }}>
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
                {categories.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                        ● {categories.length} Categorias (Agrupadas por Seção)
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
                    {/* 01 RECEITAS */}
                    {renderSectionHeader(DRE_LAYOUT[0].id, DRE_LAYOUT[0].default, budgetDRE.rBruta, realizedDRE.rBruta)}
                    {expandedSections.has(DRE_LAYOUT[0].id) && renderCategoryRows(getCategoriesForSection(DRE_LAYOUT[0].patterns, DRE_LAYOUT[0].excludes))}

                    {/* 02 DEDUCOES */}
                    {renderSectionHeader(DRE_LAYOUT[1].id, DRE_LAYOUT[1].default, budgetDRE.tributos, realizedDRE.tributos)}
                    {expandedSections.has(DRE_LAYOUT[1].id) && renderCategoryRows(getCategoriesForSection(DRE_LAYOUT[1].patterns, DRE_LAYOUT[1].excludes))}

                    {/* Result Line 1 */}
                    {renderSectionHeader('RESULT_RL', '02T 3 - Receita Líquida', budgetDRE.rLiquida, realizedDRE.rLiquida, true)}

                    {/* 03 CUSTOS */}
                    {renderSectionHeader(DRE_LAYOUT[2].id, DRE_LAYOUT[2].default, budgetDRE.custos, realizedDRE.custos)}
                    {expandedSections.has(DRE_LAYOUT[2].id) && renderCategoryRows(getCategoriesForSection(DRE_LAYOUT[2].patterns, DRE_LAYOUT[2].excludes))}

                    {/* Result Line 2 */}
                    {renderSectionHeader('RESULT_MB', '03T 5 - Margem Bruta', budgetDRE.mBruta, realizedDRE.mBruta, true)}

                    {/* 04 DESPESAS OPERACIONAIS */}
                    {renderSectionHeader(DRE_LAYOUT[3].id, DRE_LAYOUT[3].default, budgetDRE.dOperacionais, realizedDRE.dOperacionais)}
                    {expandedSections.has(DRE_LAYOUT[3].id) && renderCategoryRows(getCategoriesForSection(DRE_LAYOUT[3].patterns, DRE_LAYOUT[3].excludes))}

                    {/* Result Line 3 */}
                    {renderSectionHeader('RESULT_MC', '04T 7 - Margem de Contribuição', budgetDRE.mContrib, realizedDRE.mContrib, true)}

                    {/* 05 DESPESAS ADM */}
                    {renderSectionHeader(DRE_LAYOUT[4].id, DRE_LAYOUT[4].default, budgetDRE.dAdmins, realizedDRE.dAdmins)}
                    {expandedSections.has(DRE_LAYOUT[4].id) && renderCategoryRows(getCategoriesForSection(DRE_LAYOUT[4].patterns, DRE_LAYOUT[4].excludes))}

                    {/* Result Line 4 */}
                    {renderSectionHeader('RESULT_EBITDA', '05T 9 - EBITDA', budgetDRE.ebitda, realizedDRE.ebitda, true)}

                    {/* 06 FINANCEIRO */}
                    {renderSectionHeader(DRE_LAYOUT[5].id, DRE_LAYOUT[5].default, budgetDRE.dFinanc, realizedDRE.dFinanc)}
                    {expandedSections.has(DRE_LAYOUT[5].id) && renderCategoryRows(getCategoriesForSection(DRE_LAYOUT[5].patterns, DRE_LAYOUT[5].excludes))}

                    {/* OUTROS */}
                    {renderSectionHeader(DRE_LAYOUT[6].id, DRE_LAYOUT[6].default, budgetDRE.oReceitas, realizedDRE.oReceitas)}
                    {expandedSections.has(DRE_LAYOUT[6].id) && renderCategoryRows(getCategoriesForSection(DRE_LAYOUT[6].patterns, DRE_LAYOUT[6].excludes))}

                    {renderSectionHeader(DRE_LAYOUT[7].id, DRE_LAYOUT[7].default, budgetDRE.oDespesas, realizedDRE.oDespesas)}
                    {expandedSections.has(DRE_LAYOUT[7].id) && renderCategoryRows(getCategoriesForSection(DRE_LAYOUT[7].patterns, DRE_LAYOUT[7].excludes))}

                    {/* Unclassified */}
                    <tr style={{ background: '#fff7ed', fontWeight: 'bold' }}>
                        <td colSpan={100} style={{ padding: '0.5rem', color: '#c2410c' }}>Outras Categorias (Não Mapeadas)</td>
                    </tr>
                    {renderCategoryRows(categories.filter(node =>
                        !DRE_LAYOUT.some(section => belongsToSection(node, section.patterns, section.excludes))
                    ))}

                    <tr style={{ background: '#f8fafc' }}><td colSpan={100} style={{ padding: '0.5rem' }}></td></tr>
                    {renderSectionHeader('RESULT_LL', '06T 11 - Lucro Líquido', budgetDRE.lLiquido, realizedDRE.lLiquido, true)}
                </tbody>
            </table>

            {loading && <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Sincronizando dados...</div>}
        </div>
    );
}
