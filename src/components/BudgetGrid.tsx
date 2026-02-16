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
                    // V47.2: Nuclear Mapping Pass (Frontend Sanity)
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
                    // Auto-expand all
                    setExpandedRows(new Set(enrichedCategories.map((c: any) => c.id)));
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

    // DRE Sections Mapping (Visual Headers)
    // STRICT MAPPING BASED ON USER FEEDBACK:
    // 1 -> Receitas (Careful with 10)
    // 2 -> Deducoes
    // 3, 4 -> Custos (User showed 4 as Custos Operacionais)
    // 6 -> Despesas Comerciais
    // 8 -> Despesas Administrativas
    // 9, 10 -> Despesas Financeiras
    const DRE_LAYOUT = [
        // Regex: Starts with 1, followed by dot or space or end, NOT followed by 0 immediately (to exclude 10)
        { id: 'RECEITAS', label: '01 1 - Receitas', patterns: ['^1(\\.|\\s|$)', 'RECEITA', 'VENDA', 'FATURAMENTO'] },
        { id: 'DEDUCOES', label: '02 2 - Tributos sobre Faturamento', patterns: ['^2(\\.|\\s|$)', 'TRIBUTO', 'IMPOSTO', 'DEDUCAO', 'SIMPLES'] },

        // Calculated: Receita Liquida
        // Costs often start with 3 or 4 in some charts. User showed "03 4 - Custos Operacionais".
        { id: 'CUSTOS', label: '03 4 - Custos Operacionais', patterns: ['^3(\\.|\\s|$)', '^4(\\.|\\s|$)', 'CUSTO', 'PRODUCAO', 'MATERIA', 'ESTOQUE'] },

        // Calculated: Margem Bruta
        // User showed "04 6 - Despesa Comercial".
        { id: 'DESPESAS_COMERCIAIS', label: '04 6 - Despesa Comercial', patterns: ['^6(\\.|\\s|$)', 'COMERCIAL', 'MARKETING', 'COMISSOES', 'PROPAGANDA', 'VENDAS'] },

        // Calculated: Margem Contribuicao
        // User showed "05 8 - Despesa Administrativa".
        { id: 'DESPESAS_ADMINISTRATIVAS', label: '05 8 - Despesa Administrativa', patterns: ['^8(\\.|\\s|$)', 'ADMINISTRA', 'OPERACIONAL', 'ALUGUEL', 'SALARIO', 'PESSOAL'] },

        // Calculated: EBITDA
        // User showed "06 10 - Despesa Financeira".
        // Also catching 9 just in case.
        { id: 'DESPESSAS_FINANCEIRAS', label: '06 10 - Despesa Financeira', patterns: ['^10(\\.|\\s|$)', '^9(\\.|\\s|$)', 'FINANCEIRA', 'JUROS', 'TARIFA', 'IOF', 'BANCARIA'] },

        { id: 'OUTRAS_RECEITAS_NAO_OPERACIONAIS', label: '07 - Outras Receitas', patterns: ['^7(\\.|\\s|$)', 'OUTRAS RECEITAS'] },
        // 11 or others?
        { id: 'OUTRAS_DESPESAS_NAO_OPERACIONAIS', label: '08 - Outras Despesas', patterns: ['^11(\\.|\\s|$)', 'OUTRAS DESPESAS'] }
    ];

    // Build the Full Directory Tree first, independent of sections
    const buildFullTree = (list: any[]) => {
        const roots: any[] = [];
        const byParent: Record<string, any[]> = {};

        list.forEach(c => {
            if (!c.parentId) {
                roots.push(c);
            } else {
                if (!byParent[c.parentId]) byParent[c.parentId] = [];
                byParent[c.parentId].push(c);
            }
        });

        // Also handle Orphans (items with parentId that doesn't exist in list)
        const allIds = new Set(list.map(c => c.id));
        list.forEach(c => {
            if (c.parentId && !allIds.has(c.parentId)) {
                // Treat orphan as root
                roots.push(c);
            }
        });

        // Sort roots by name (usually implies code order 1, 1.1, etc.)
        roots.sort((a, b) => {
            // Smart sort: Try to sort by the leading number if present
            const numA = (a.name.match(/^\d+(\.\d+)*/)?.[0]) || '';
            const numB = (b.name.match(/^\d+(\.\d+)*/)?.[0]) || '';
            if (numA && numB) {
                // Compare as segment arrays
                const partsA = numA.split('.').map(Number);
                const partsB = numB.split('.').map(Number);
                for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                    const valA = partsA[i] || 0;
                    const valB = partsB[i] || 0;
                    if (valA !== valB) return valA - valB;
                }
                return 0;
            }
            return a.name.localeCompare(b.name);
        });

        const enhanceNode = (node: any, level: number): any => {
            const children = (byParent[node.id] || []).sort((a, b) => {
                const numA = (a.name.match(/^\d+(\.\d+)*/)?.[0]) || '';
                const numB = (b.name.match(/^\d+(\.\d+)*/)?.[0]) || '';
                if (numA && numB) {
                    const partsA = numA.split('.').map(Number);
                    const partsB = numB.split('.').map(Number);
                    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                        const valA = partsA[i] || 0;
                        const valB = partsB[i] || 0;
                        if (valA !== valB) return valA - valB;
                    }
                    return 0;
                }
                return a.name.localeCompare(b.name);
            });

            return {
                ...node,
                level,
                children: children.map(c => enhanceNode(c, level + 1))
            };
        };

        return roots.map(r => enhanceNode(r, 1));
    };

    const fullTree = React.useMemo(() => categories.length > 0 ? buildFullTree(categories) : [], [categories]);

    // Helper to check if a Root Node belongs to a Section
    const belongsToSection = (node: any, patterns: string[]) => {
        const n = node.name.toUpperCase();
        return patterns.some(p => {
            // Handle Regex Pattern Strings
            if (p.startsWith('^')) {
                const regex = new RegExp(p);
                return regex.test(n);
            }
            return n.includes(p);
        });
    };

    // Flatten logic for rendering
    const flattenTree = (nodes: any[], expanded: Set<string>): any[] => {
        return nodes.flatMap(node => {
            if (!expanded.has(node.id) && !node.parentId) {
                // Root not expanded? Just show root.
                // Actually we want full control called by renderSection
                return [node];
            }
            // If we are calling this, we probably want the flat list
            // But implementing `renderRow` recursively is easier.
            return [];
        });
    };

    const renderRowRecursively = (node: any): React.ReactNode[] => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedRows.has(node.id);

        const row = (
            <tr key={node.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{
                    padding: '0.5rem',
                    paddingLeft: `${node.level * 1.2}rem`,
                    position: 'sticky',
                    left: 0,
                    background: 'white',
                    zIndex: 5,
                    fontWeight: hasChildren ? 600 : 400,
                    color: hasChildren ? '#334155' : '#64748b'
                }}>
                    {hasChildren && (
                        <button
                            onClick={() => toggleRow(node.id)}
                            style={{ marginRight: '0.4rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.7rem' }}
                        >
                            {isExpanded ? '▼' : '▶'}
                        </button>
                    )}
                    {node.name}
                </td>
                {MONTHS.map((_, i) => (
                    <React.Fragment key={i}>
                        <td style={{ borderLeft: '1px solid #f8fafc', padding: '0' }}>
                            <input
                                type="text"
                                placeholder="0,00"
                                onBlur={(e) => handleBudgetChange(node.id, i, e.target.value)}
                                defaultValue={budgetValues[`${node.id}-${i}`] ? budgetValues[`${node.id}-${i}`].toFixed(2) : ''}
                                style={{ width: '100%', padding: '0.5rem', border: 'none', textAlign: 'right', background: 'transparent', fontSize: '0.75rem' }}
                            />
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 500 }}>
                            {formatCurrency(realizedDRE.getRecursiveVal(node.id, i))}
                        </td>
                    </React.Fragment>
                ))}
            </tr>
        );

        const childRows = isExpanded ? node.children.flatMap((c: any) => renderRowRecursively(c)) : [];
        return [row, ...childRows];
    };

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

    // DRE Logic and Calculations (V47.8 - Root-Based Summing & Strict 1/10 split)
    const calculateTotals = (tree: any[], values: Record<string, number>) => {
        // Recursive helper to get total for a category AND its children
        // We use the flat map of values + the hierarchy

        const getRecursiveVal = (catId: string, month: number): number => {
            // 1. Direct value
            let total = values[`${catId}-${month}`] || 0;
            // 2. Children values?
            // If we rely on the DB structure, we need to find children in the `categories` flat list
            const children = categories.filter(c => c.parentId === catId);
            children.forEach(child => {
                total += getRecursiveVal(child.id, month);
            });
            return total;
        };

        const sumByRoots = (patterns: string[]) => {
            const totals = new Array(12).fill(0);

            // Find all roots matching the pattern
            // Note: We use `fullTree` which contains the Top Level Nodes
            const relevantRoots = fullTree.filter(r => belongsToSection(r, patterns));

            relevantRoots.forEach(root => {
                for (let i = 0; i < 12; i++) {
                    totals[i] += getRecursiveVal(root.id, i);
                }
            });
            return totals;
        };

        const rBruta = sumByRoots(DRE_LAYOUT.find(s => s.id === 'RECEITAS')?.patterns || []);
        const tributos = sumByRoots(DRE_LAYOUT.find(s => s.id === 'DEDUCOES')?.patterns || []);
        const rLiquida = rBruta.map((v, i) => v - Math.abs(tributos[i]));
        const custos = sumByRoots(DRE_LAYOUT.find(s => s.id === 'CUSTOS')?.patterns || []);
        const mBruta = rLiquida.map((v, i) => v - Math.abs(custos[i]));
        const dComerciais = sumByRoots(DRE_LAYOUT.find(s => s.id === 'DESPESAS_COMERCIAIS')?.patterns || []);
        const mContrib = mBruta.map((v, i) => v - Math.abs(dComerciais[i]));
        const dAdmins = sumByRoots(DRE_LAYOUT.find(s => s.id === 'DESPESAS_ADMINISTRATIVAS')?.patterns || []);
        const ebitda = mContrib.map((v, i) => v - Math.abs(dAdmins[i]));
        const dFinanc = sumByRoots(DRE_LAYOUT.find(s => s.id === 'DESPESSAS_FINANCEIRAS')?.patterns || []);
        const oReceitas = sumByRoots(DRE_LAYOUT.find(s => s.id === 'OUTRAS_RECEITAS_NAO_OPERACIONAIS')?.patterns || []);
        const oDespesas = sumByRoots(DRE_LAYOUT.find(s => s.id === 'OUTRAS_DESPESAS_NAO_OPERACIONAIS')?.patterns || []);
        const lLiquido = ebitda.map((v, i) => v - Math.abs(dFinanc[i]) + oReceitas[i] - Math.abs(oDespesas[i]));

        return { rBruta, tributos, rLiquida, custos, mBruta, dComerciais, mContrib, dAdmins, ebitda, dFinanc, oReceitas, oDespesas, lLiquido, getRecursiveVal };
    };

    const budgetDRE = calculateTotals(fullTree, budgetValues);
    const realizedDRE = calculateTotals(fullTree, realizedValues);

    React.useEffect(() => {
        if (categories.length > 0 && expandedRows.size === 0) {
            setExpandedRows(new Set(categories.map(c => c.id)));
        }
    }, [categories]);

    const formatCurrency = (val: number | undefined) => {
        if (typeof val !== 'number') return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

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
                        ● {categories.length} Categorias Importadas (Hierarquia Nativa)
                    </div>
                )}
            </div>

            <p style={{ color: 'red', fontWeight: 'bold', fontSize: '1.2em' }}>
                Build Version: v47.8 - STRICT NUMERIC MAPPING 🦁🔢
            </p>
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
                    {/* DYNAMIC RENDERING BASED ON ROOTS */}

                    {/* 01 RECEITAS */}
                    {renderDRELine(DRE_LAYOUT[0].label, budgetDRE.rBruta, realizedDRE.rBruta)}
                    {fullTree.filter(node => belongsToSection(node, DRE_LAYOUT[0].patterns)).flatMap(node => renderRowRecursively(node))}

                    {/* 02 DEDUCOES */}
                    {renderDRELine(DRE_LAYOUT[1].label, budgetDRE.tributos, realizedDRE.tributos)}
                    {fullTree.filter(node => belongsToSection(node, DRE_LAYOUT[1].patterns)).flatMap(node => renderRowRecursively(node))}

                    {renderDRELine('02T 3 - Receita Líquida', budgetDRE.rLiquida, realizedDRE.rLiquida, true)}

                    {/* 03 CUSTOS */}
                    {renderDRELine(DRE_LAYOUT[2].label, budgetDRE.custos, realizedDRE.custos)}
                    {fullTree.filter(node => belongsToSection(node, DRE_LAYOUT[2].patterns)).flatMap(node => renderRowRecursively(node))}

                    {renderDRELine('03T 5 - Margem Bruta', budgetDRE.mBruta, realizedDRE.mBruta, true)}

                    {/* 04 DESPESAS COMERCIAIS */}
                    {renderDRELine(DRE_LAYOUT[3].label, budgetDRE.dComerciais, realizedDRE.dComerciais)}
                    {fullTree.filter(node => belongsToSection(node, DRE_LAYOUT[3].patterns)).flatMap(node => renderRowRecursively(node))}

                    {renderDRELine('04T 7 - Margem de Contribuição', budgetDRE.mContrib, realizedDRE.mContrib, true)}

                    {/* 05 DESPESAS ADM */}
                    {renderDRELine(DRE_LAYOUT[4].label, budgetDRE.dAdmins, realizedDRE.dAdmins)}
                    {fullTree.filter(node => belongsToSection(node, DRE_LAYOUT[4].patterns)).flatMap(node => renderRowRecursively(node))}

                    {renderDRELine('05T 9 - EBITDA', budgetDRE.ebitda, realizedDRE.ebitda, true)}

                    {/* 06 FINANCEIRO */}
                    {renderDRELine(DRE_LAYOUT[5].label, budgetDRE.dFinanc, realizedDRE.dFinanc)}
                    {fullTree.filter(node => belongsToSection(node, DRE_LAYOUT[5].patterns)).flatMap(node => renderRowRecursively(node))}

                    {/* OUTROS */}
                    {renderDRELine(DRE_LAYOUT[6].label, budgetDRE.oReceitas, realizedDRE.oReceitas)}
                    {fullTree.filter(node => belongsToSection(node, DRE_LAYOUT[6].patterns)).flatMap(node => renderRowRecursively(node))}

                    {renderDRELine(DRE_LAYOUT[7].label, budgetDRE.oDespesas, realizedDRE.oDespesas)}
                    {fullTree.filter(node => belongsToSection(node, DRE_LAYOUT[7].patterns)).flatMap(node => renderRowRecursively(node))}

                    {/* Unclassified/Others - Safety Net */}
                    <tr style={{ background: '#fff7ed', fontWeight: 'bold' }}>
                        <td colSpan={100} style={{ padding: '0.5rem', color: '#c2410c' }}>Outras Categorias (Não Mapeadas)</td>
                    </tr>
                    {fullTree.filter(node =>
                        !DRE_LAYOUT.some(section => belongsToSection(node, section.patterns))
                    ).flatMap(node => renderRowRecursively(node))}

                    <tr style={{ background: '#f8fafc' }}><td colSpan={100} style={{ padding: '0.5rem' }}></td></tr>
                    {renderDRELine('06T 11 - Lucro Líquido', budgetDRE.lLiquido, realizedDRE.lLiquido, true)}
                </tbody>
            </table>

            {loading && <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Sincronizando dados com Conta Azul...</div>}
            <div style={{ padding: '0.5rem', fontSize: '0.7rem', color: '#ccc', textAlign: 'right' }}>Build v47.8 - STRICT NUMERIC MAPPING 🦁🔢</div>
        </div>
    );
}
