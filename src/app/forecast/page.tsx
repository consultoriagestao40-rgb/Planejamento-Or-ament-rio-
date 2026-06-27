'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';

export default function ForecastPage() {
    const [companies, setCompanies] = useState<any[]>([]);
    const [selectedTenant, setSelectedTenant] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [activeMonth, setActiveMonth] = useState(new Date().getMonth() + 1); // 1-12
    const [contracts, setContracts] = useState<any[]>([]);
    const [coefficients, setCoefficients] = useState<any[]>([]);
    const [forecastData, setForecastData] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [activeTab, setActiveTab] = useState<'grid' | 'coefficients'>('grid');
    const [showAV, setShowAV] = useState(false);
    const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set([
        'G-01', 'G-02', 'G-03', 'G-04', 'G-05', 'G-06', 'G-07',
        'G-01.1', 'G-01.2', 'G-02.1', 'G-03.1', 'G-03.2', 'G-03.3', 'G-03.4', 'G-03.5', 'G-03.7', 'G-03.8', 'G-03.9'
    ]));

    // Modal/Form States for Simulated Contract
    const [isContractModalOpen, setIsContractModalOpen] = useState(false);
    const [editingContractId, setEditingContractId] = useState<string | null>(null);
    const [contractName, setContractName] = useState('');
    const [contractValue, setContractValue] = useState(0);
    const [contractStartMonth, setContractStartMonth] = useState(6);
    const [contractProbability, setContractProbability] = useState(100);
    const [contractStatus, setContractStatus] = useState('PIPELINE');
    const [contractTenantId, setContractTenantId] = useState('');

    // Coefficient Edit State
    const [editingCoefId, setEditingCoefId] = useState<string | null>(null);
    const [editingCoefValue, setEditingCoefValue] = useState(0);

    const toggleRow = (id: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleExpandAll = () => {
        const allIds = new Set<string>();
        const collectIds = (nodes: any[]) => {
            nodes.forEach(n => {
                if (n.children && n.children.length > 0) {
                    allIds.add(n.categoryId);
                    collectIds(n.children);
                }
            });
        };
        collectIds(displayGrid);
        setExpandedRows(allIds);
    };

    const handleCollapseAll = () => {
        setExpandedRows(new Set());
    };

    const fetchSetup = useCallback(async () => {
        try {
            const res = await fetch('/api/companies');
            const json = await res.json();
            if (json.success && json.companies) {
                setCompanies(json.companies);
                const cached = localStorage.getItem('selectedTenantId') || 'ALL';
                setSelectedTenant(cached);
            }
        } catch (e) {
            console.error('Error in setup fetch:', e);
        }
    }, []);

    useEffect(() => {
        fetchSetup();
    }, [fetchSetup]);

    const fetchData = useCallback(async () => {
        if (!selectedTenant) return;
        setLoadingData(true);
        try {
            // Fetch contracts
            const resC = await fetch(`/api/kpi/forecast/contracts?tenantId=${selectedTenant}&year=${selectedYear}`);
            const jsonC = await resC.json();
            if (jsonC.success) setContracts(jsonC.data || []);

            // Fetch coefficients
            const resCoef = await fetch(`/api/kpi/forecast/coefficients?tenantId=${selectedTenant}&year=${selectedYear}`);
            const jsonCoef = await resCoef.json();
            if (jsonCoef.success) setCoefficients(jsonCoef.data || []);

            // Fetch DRE forecast data
            const resD = await fetch(`/api/kpi/forecast/data?tenantId=${selectedTenant}&year=${selectedYear}&activeMonth=${activeMonth}`);
            const jsonD = await resD.json();
            if (jsonD.success) setForecastData(jsonD.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingData(false);
        }
    }, [selectedTenant, selectedYear, activeMonth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveContract = async () => {
        if (!contractName.trim() || contractValue <= 0) {
            alert('Por favor, informe o nome e um valor válido.');
            return;
        }

        const targetTenant = selectedTenant === 'ALL' ? contractTenantId : selectedTenant;
        if (!targetTenant) {
            alert('Por favor, selecione uma empresa de destino.');
            return;
        }

        try {
            const res = await fetch('/api/kpi/forecast/contracts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingContractId || undefined,
                    tenantId: targetTenant,
                    name: contractName,
                    value: contractValue,
                    startMonth: contractStartMonth,
                    startYear: selectedYear,
                    probability: contractProbability,
                    status: contractStatus
                })
            });
            const json = await res.json();
            if (json.success) {
                setIsContractModalOpen(false);
                setEditingContractId(null);
                setContractName('');
                setContractValue(0);
                setContractStartMonth(6);
                setContractProbability(100);
                setContractStatus('PIPELINE');
                setContractTenantId('');
                fetchData();
            } else {
                alert(`Erro ao salvar: ${json.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteContract = async (id: string) => {
        if (!confirm('Deseja excluir este contrato da simulação?')) return;
        try {
            const res = await fetch(`/api/kpi/forecast/contracts?id=${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
                fetchData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveCoefficientOverride = async (categoryId: string, val: number) => {
        try {
            const res = await fetch('/api/kpi/forecast/coefficients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: selectedTenant,
                    year: selectedYear,
                    categoryId,
                    percentage: val
                })
            });
            const json = await res.json();
            if (json.success) {
                setEditingCoefId(null);
                fetchData();
            } else {
                alert(`Erro ao salvar: ${json.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fmt = (v: number) => {
        const absolute = Math.abs(v);
        const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(absolute);
        return v < 0 ? `- ${formatted}` : formatted;
    };

    const monthsName = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const displayGrid = useMemo(() => {
        if (forecastData.length === 0) return [];

        const buildDreTree = (flatData: any[]) => {
            const createNode = (id: string, name: string, level: number, isFormula = false) => ({
                categoryId: id,
                categoryName: name,
                level,
                isFormula,
                realized: Array(12).fill(0),
                budget: Array(12).fill(0),
                forecast: Array(12).fill(0),
                children: [] as any[]
            });

            // Main parent groups
            const recBruta = createNode('G-01', '01. RECEITA BRUTA', 0);
            const recServicos = createNode('G-01.1', '01.1 - Receita de Serviços', 1);
            const recVendas = createNode('G-01.2', '01.2 - Receitas de Vendas', 1);
            recBruta.children = [recServicos, recVendas];

            const tributos = createNode('G-02', '02. Tributo sobre Faturamento', 0);
            const tribSub = createNode('G-02.1', '02.1 - Tributos', 1);
            tributos.children = [tribSub];

            const recLiquida = createNode('F-RL', '(=) RECEITA LÍQUIDA', 0, true);

            const custosOp = createNode('G-03', '03. Custo Operacional', 0);
            const custosSubs: Record<string, any> = {
                '03.1': createNode('G-03.1', '03.1 Salarios e Remuneração', 1),
                '03.2': createNode('G-03.2', '03.2 Encargos Sociais', 1),
                '03.3': createNode('G-03.3', '03.3 Beneficios', 1),
                '03.4': createNode('G-03.4', '03.4 Diárias', 1),
                '03.5': createNode('G-03.5', '03.5 SSMA', 1),
                '03.6': createNode('G-03.6', '03.6 Materiais', 1),
                '03.7': createNode('G-03.7', '03.7 Equipamentos', 1),
                '03.8': createNode('G-03.8', '03.8 Comunicação/Sistema/Licenças', 1),
                '03.9': createNode('G-03.9', '03.9 Custo com Veiculo', 1),
                '03.10': createNode('G-03.10', '03.10 Custos Transferidos', 1),
            };
            custosOp.children = Object.values(custosSubs);

            const margemBruta = createNode('F-MB', '(=) MARGEM BRUTA', 0, true);

            const despVendas = createNode('G-04', '04. Despesa Operacional', 0);
            const despVendasSubs: Record<string, any> = {
                '04.1': createNode('G-04.1', '04.1 Salarios e Remuneração', 1),
                '04.2': createNode('G-04.2', '04.2 Encargos Sociais', 1),
                '04.3': createNode('G-04.3', '04.3 Beneficios', 1),
                '04.4': createNode('G-04.4', '04.4 SSMA', 1),
                '04.5': createNode('G-04.5', '04.5 Viagens', 1),
                '04.6': createNode('G-04.6', '04.6 Custo com Veículos', 1),
                '04.7': createNode('G-04.7', '04.7 Cartão Corporativo', 1),
                '04.8': createNode('G-04.8', '04.8 Serviços Terceirizados', 1),
            };
            despVendas.children = Object.values(despVendasSubs);

            const margemContrib = createNode('F-MC', '(=) MARGEM DE CONTRIBUIÇÃO', 0, true);

            const despAdmin = createNode('G-05', '05. Despesas Administrativas', 0);
            const despAdminSubs: Record<string, any> = {
                '05.1': createNode('G-05.1', '05.1 Salario e Remuneração', 1),
                '05.2': createNode('G-05.2', '05.2 Encargos Sociais', 1),
                '05.3': createNode('G-05.3', '05.3 Beneficios', 1),
                '05.4': createNode('G-05.4', '05.4 SSMA', 1),
                '05.5': createNode('G-05.5', '05.5 Viagens', 1),
                '05.6': createNode('G-05.6', '05.6 Despesa com Socios', 1),
                '05.7': createNode('G-05.7', '05.7 Serviços Contratados', 1),
                '05.8': createNode('G-05.8', '05.8 Despesa Comercial/Marketing', 1),
                '05.9': createNode('G-05.9', '05.9 Despesa com Estrutura', 1),
                '05.10': createNode('G-05.10', '05.10 Despesa Copa e Cozinha', 1),
                '05.11': createNode('G-05.11', '05.11 Despesa com Veículos', 1),
                '05.12': createNode('G-05.12', '05.12 Despesa de Informatica', 1),
                '05.13': createNode('G-05.13', '05.13 Taxas e Despesas Legais', 1),
            };
            despAdmin.children = Object.values(despAdminSubs);

            const ebitda = createNode('F-EBITDA', '(=) EBITDA', 0, true);

            const despFin = createNode('G-06', '06. Despesas Financeiras', 0);
            const despFinSubs: Record<string, any> = {
                '06.1': createNode('G-06.1', '06.1 Entradas Financeiras', 1),
                '06.2': createNode('G-06.2', '06.2 Saidas Financeiras', 1),
                '06.3': createNode('G-06.3', '06.3 Financiamento', 1),
                '06.4': createNode('G-06.4', '06.4 Juros/Multas', 1),
                '06.5': createNode('G-06.5', '06.5 Passivo Trabalhista', 1),
                '06.6': createNode('G-06.6', '06.6 Depreciação', 1),
                '06.7': createNode('G-06.7', '06.7 Cartão de Credito', 1),
                '06.8': createNode('G-06.8', '06.8 PDD', 1),
            };
            despFin.children = Object.values(despFinSubs);

            const lucroLiquido = createNode('F-LL', '(=) LUCRO LÍQUIDO', 0, true);

            const invest = createNode('G-07', '07. Investimentos', 0);

            // Classify flat leaf categories
            flatData.forEach(cat => {
                const name = cat.categoryName;
                const codeMatch = name.match(/^([\d.]+)/);
                const code = codeMatch ? codeMatch[1] : '';

                let parentNode = null;
                if (code.startsWith('01.1.') || code.startsWith('1.1.')) {
                    parentNode = recServicos;
                } else if (code.startsWith('01.2.') || code.startsWith('1.2.')) {
                    parentNode = recVendas;
                } else if (code.startsWith('02.1.') || code.startsWith('2.1.') || code.startsWith('02.') || code.startsWith('2.')) {
                    parentNode = tribSub;
                } else if (code.startsWith('03.')) {
                    const subPrefix = code.substring(0, 4);
                    parentNode = custosSubs[subPrefix];
                } else if (code.startsWith('04.')) {
                    const subPrefix = code.substring(0, 4);
                    parentNode = despVendasSubs[subPrefix];
                } else if (code.startsWith('05.')) {
                    const subPrefix = code.substring(0, 4);
                    parentNode = despAdminSubs[subPrefix];
                } else if (code.startsWith('06.')) {
                    const subPrefix = code.substring(0, 4);
                    parentNode = despFinSubs[subPrefix];
                } else if (code.startsWith('07.') || code.startsWith('7.')) {
                    parentNode = invest;
                }

                if (parentNode) {
                    parentNode.children.push({
                        ...cat,
                        level: parentNode.level + 1,
                        isFormula: false,
                        children: []
                    });
                }
            });

            // Compute parent sums
            const computeSums = (node: any): any => {
                if (!node.children || node.children.length === 0) {
                    return { realized: node.realized, budget: node.budget, forecast: node.forecast };
                }

                node.children.forEach((child: any) => {
                    const childData = computeSums(child);
                    const isFinancialRevenue = child.categoryId.includes('06.1') || child.categoryName.includes('06.1');
                    const sign = isFinancialRevenue ? -1 : 1;
                    for (let i = 0; i < 12; i++) {
                        node.realized[i] += sign * childData.realized[i];
                        node.budget[i] += sign * childData.budget[i];
                        node.forecast[i] += sign * childData.forecast[i];
                    }
                });

                return { realized: node.realized, budget: node.budget, forecast: node.forecast };
            };

            computeSums(recBruta);
            computeSums(tributos);
            computeSums(custosOp);
            computeSums(despVendas);
            computeSums(despAdmin);
            computeSums(despFin);
            computeSums(invest);

            // Compute formulas
            for (let i = 0; i < 12; i++) {
                recLiquida.realized[i] = recBruta.realized[i] - tributos.realized[i];
                recLiquida.budget[i] = recBruta.budget[i] - tributos.budget[i];
                recLiquida.forecast[i] = recBruta.forecast[i] - tributos.forecast[i];

                margemBruta.realized[i] = recLiquida.realized[i] - custosOp.realized[i];
                margemBruta.budget[i] = recLiquida.budget[i] - custosOp.budget[i];
                margemBruta.forecast[i] = recLiquida.forecast[i] - custosOp.forecast[i];

                margemContrib.realized[i] = margemBruta.realized[i] - despVendas.realized[i];
                margemContrib.budget[i] = margemBruta.budget[i] - despVendas.budget[i];
                margemContrib.forecast[i] = margemBruta.forecast[i] - despVendas.forecast[i];

                ebitda.realized[i] = margemContrib.realized[i] - despAdmin.realized[i];
                ebitda.budget[i] = margemContrib.budget[i] - despAdmin.budget[i];
                ebitda.forecast[i] = margemContrib.forecast[i] - despAdmin.forecast[i];

                lucroLiquido.realized[i] = ebitda.realized[i] - despFin.realized[i];
                lucroLiquido.budget[i] = ebitda.budget[i] - despFin.budget[i];
                lucroLiquido.forecast[i] = ebitda.forecast[i] - despFin.forecast[i];
            }

            return [
                recBruta, tributos, recLiquida, custosOp, margemBruta,
                despVendas, margemContrib, despAdmin, ebitda, despFin, lucroLiquido, invest
            ];
        };

        const treeRoots = buildDreTree(forecastData);

        const resultList: any[] = [];
        const checkVisible = (node: any, parentVisible = true) => {
            if (parentVisible) {
                resultList.push(node);
            }
            if (node.children && node.children.length > 0) {
                const isOpen = expandedRows.has(node.categoryId);
                node.children.sort((a: any, b: any) => a.categoryName.localeCompare(b.categoryName));
                node.children.forEach((c: any) => checkVisible(c, parentVisible && isOpen));
            }
        };

        treeRoots.forEach(r => checkVisible(r, true));
        return resultList;
    }, [forecastData, expandedRows]);

    return (
        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', boxSizing: 'border-box', background: 'var(--bg-default)', color: 'var(--text-primary)' }}>
            
            {/* Header / Selectors */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>🔮 Projeção Forecast</h2>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Acompanhe o realizado consolidado e simule novos contratos para os meses restantes.</span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Company selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Empresa</span>
                        <select
                            value={selectedTenant}
                            onChange={(e) => {
                                setSelectedTenant(e.target.value);
                                localStorage.setItem('selectedTenantId', e.target.value);
                            }}
                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                        >
                            <option value="ALL">Todas Empresas (Consolidado)</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    {/* Year Selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ano</span>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                        >
                            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    {/* Active Month (Corte Realizado) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Corte de Realizado (Mês)</span>
                        <select
                            value={activeMonth}
                            onChange={(e) => setActiveMonth(parseInt(e.target.value))}
                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                        >
                            {monthsName.map((name, i) => <option key={i} value={i + 1}>{name} (Realizado até {name})</option>)}
                        </select>
                    </div>

                    {/* Simulator Modal Trigger Button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'transparent', textTransform: 'uppercase', userSelect: 'none' }}>Simulador</span>
                        <button
                            onClick={() => setIsSimulatorOpen(true)}
                            style={{
                                height: '36px',
                                padding: '0 1rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'var(--gradient-brand)',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                            }}
                        >
                            🚀 Simulador ({contracts.length})
                        </button>
                    </div>
                </div>
            </div>

            {/* Layout Main Grid */}
            <div style={{ display: 'flex', width: '100%' }}>
                
                {/* Data Grid and Tabs (Full Width) */}
                <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* Tabs */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setActiveTab('grid')}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: activeTab === 'grid' ? 'var(--accent-indigo)' : 'transparent', color: activeTab === 'grid' ? '#ffffff' : 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
                            >
                                📊 Planilha Forecast (DRE)
                            </button>
                            <button
                                onClick={() => setActiveTab('coefficients')}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: activeTab === 'coefficients' ? 'var(--accent-indigo)' : 'transparent', color: activeTab === 'coefficients' ? '#ffffff' : 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
                            >
                                ⚙️ Coeficientes de Custos (Análise Vertical)
                            </button>
                        </div>
                        {activeTab === 'grid' && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <button
                                    onClick={handleExpandAll}
                                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                    ↕️ Expandir Tudo
                                </button>
                                <button
                                    onClick={handleCollapseAll}
                                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                    ↔️ Retrair Tudo
                                </button>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)', padding: '0.35rem 0.65rem', background: 'var(--bg-elevated)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={showAV} 
                                        onChange={(e) => setShowAV(e.target.checked)} 
                                        style={{ cursor: 'pointer' }}
                                    />
                                    🔍 Exibir Análise Vertical (AV)
                                </label>
                            </div>
                        )}
                    </div>

                    {loadingData ? (
                        <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ border: '3px solid var(--border-default)', borderTopColor: 'var(--accent-indigo)', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite' }} />
                        </div>
                    ) : activeTab === 'grid' ? (
                        /* Forecast DRE Grid */
                        <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                        <th style={{ padding: '0.5rem', minWidth: '180px' }}>Conta / Categoria</th>
                                        {monthsName.map((name, i) => (
                                            <React.Fragment key={i}>
                                                <th style={{ padding: '0.5rem', textAlign: 'right', background: i + 1 <= activeMonth ? 'rgba(99, 102, 241, 0.05)' : 'transparent' }}>
                                                    {name} <span style={{ fontSize: '0.6rem', display: 'block', opacity: 0.7 }}>{i + 1 <= activeMonth ? 'Real' : 'Proj'}</span>
                                                </th>
                                                {showAV && (
                                                    <th style={{ padding: '0.5rem', textAlign: 'center', width: '55px', minWidth: '55px', background: i + 1 <= activeMonth ? 'rgba(99, 102, 241, 0.03)' : 'transparent', color: 'var(--text-secondary)', fontSize: '0.65rem' }}>
                                                        AV
                                                    </th>
                                                )}
                                            </React.Fragment>
                                        ))}
                                        <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 800 }}>Total Forecast</th>
                                        {showAV && <th style={{ padding: '0.5rem', textAlign: 'center', width: '55px', minWidth: '55px', color: 'var(--text-secondary)', fontSize: '0.65rem' }}>AV</th>}
                                        <th style={{ padding: '0.5rem', textAlign: 'right', opacity: 0.8 }}>Budget Original</th>
                                        {showAV && <th style={{ padding: '0.5rem', textAlign: 'center', width: '55px', minWidth: '55px', color: 'var(--text-secondary)', opacity: 0.8, fontSize: '0.65rem' }}>AV</th>}
                                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Variação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayGrid.map(row => {
                                        const sumForecast = row.forecast.reduce((a: number, b: number) => a + b, 0);
                                        const sumBudget = row.budget.reduce((a: number, b: number) => a + b, 0);
                                        const variance = sumForecast - sumBudget;
                                        
                                        // Análise Vertical (AV) Totais
                                        const groupBruta = displayGrid.find(r => r.categoryId === 'G-01');
                                        const sumForecastBruta = groupBruta?.forecast.reduce((a: number, b: number) => a + b, 0) || 0;
                                        const sumBudgetBruta = groupBruta?.budget.reduce((a: number, b: number) => a + b, 0) || 0;
                                        const avTotalPercent = Math.abs(sumForecastBruta) > 0.01 ? (sumForecast / sumForecastBruta) * 100 : 0;
                                        const avBudgetPercent = Math.abs(sumBudgetBruta) > 0.01 ? (sumBudget / sumBudgetBruta) * 100 : 0;
                                        
                                        const isGroup = row.categoryId.startsWith('G-');
                                        const isFormula = row.categoryId.startsWith('F-');
                                        const hasChildren = row.children && row.children.length > 0;

                                        let background = 'transparent';
                                        let fontWeight = 500;
                                        let borderBottom = '1px solid var(--border-subtle)';

                                        if (isFormula) {
                                            background = 'rgba(99, 102, 241, 0.08)';
                                            fontWeight = 800;
                                            borderBottom = '2px double var(--border-default)';
                                        } else if (isGroup) {
                                            background = 'var(--bg-elevated)';
                                            fontWeight = 700;
                                        }

                                        return (
                                            <tr key={row.categoryId} style={{ borderBottom, background, fontWeight }}>
                                                <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', paddingLeft: `${row.level * 16 + 8}px` }}>
                                                    {hasChildren && (
                                                        <span 
                                                            onClick={() => toggleRow(row.categoryId)}
                                                            style={{ cursor: 'pointer', userSelect: 'none', marginRight: '0.5rem', display: 'inline-block', width: '12px', color: 'var(--text-secondary)' }}
                                                        >
                                                             {expandedRows.has(row.categoryId) ? '▼' : '▶'}
                                                        </span>
                                                    )}
                                                    {!hasChildren && !isFormula && <span style={{ display: 'inline-block', width: '17px' }} />}
                                                    <span 
                                                        onClick={() => hasChildren && toggleRow(row.categoryId)}
                                                        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                                                    >
                                                        {row.categoryName}
                                                    </span>
                                                </td>
                                                {row.forecast.map((val: number, i: number) => {
                                                    const totalBruta = displayGrid.find(r => r.categoryId === 'G-01')?.forecast[i] || 0;
                                                    const avPercent = Math.abs(totalBruta) > 0.01 ? (val / totalBruta) * 100 : 0;
                                                    return (
                                                        <React.Fragment key={i}>
                                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                                                                {fmt(val)}
                                                            </td>
                                                            {showAV && (
                                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600 }}>
                                                                    {avPercent.toFixed(1)}%
                                                                </td>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--accent-indigo)' }}>
                                                    {fmt(sumForecast)}
                                                </td>
                                                {showAV && (
                                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 700 }}>
                                                        {avTotalPercent.toFixed(1)}%
                                                    </td>
                                                )}
                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', opacity: 0.8 }}>
                                                    {fmt(sumBudget)}
                                                </td>
                                                {showAV && (
                                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 700, opacity: 0.8 }}>
                                                        {avBudgetPercent.toFixed(1)}%
                                                    </td>
                                                )}
                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: variance > 0 ? 'var(--accent-green)' : variance < 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                                                    {variance > 0 ? '+' : ''}{fmt(variance)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* Coefficients Override Tab */
                        <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Configuração de Percentuais (Análise Vertical)</h4>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    Defina a porcentagem de cada subcategoria operacional em relação à Receita Bruta. Esses pesos serão multiplicados pelas vendas projetadas no simulador de contratos.
                                </p>
                                {selectedTenant === 'ALL' && (
                                    <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-orange)', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                                        ⚠️ Você está na visualização Consolidada. Para customizar coeficientes específicos, selecione uma empresa no filtro acima.
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
                                {coefficients
                                    .filter(c => c.categoryId.startsWith('synth-3.') || c.categoryId.startsWith('03.') || c.categoryId.startsWith('3.') || c.categoryId.startsWith('02.') || c.categoryId.startsWith('2.'))
                                    .sort((a, b) => a.categoryName.localeCompare(b.categoryName))
                                    .map(coef => (
                                        <div key={coef.categoryId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', maxWidth: '65%' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{coef.categoryName}</span>
                                                <span style={{ fontSize: '0.65rem', color: coef.isOverride ? 'var(--accent-orange)' : 'var(--text-secondary)' }}>
                                                    {coef.isOverride ? '⚠️ Valor Personalizado' : '📊 Histórico Calculado'}
                                                </span>
                                            </div>
                                            <div>
                                                {editingCoefId === coef.categoryId && selectedTenant !== 'ALL' ? (
                                                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={editingCoefValue}
                                                            onChange={(e) => setEditingCoefValue(parseFloat(e.target.value) || 0)}
                                                            style={{ width: '60px', height: '28px', padding: '0 0.35rem', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700 }}
                                                        />
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>%</span>
                                                        <button
                                                            onClick={() => handleSaveCoefficientOverride(coef.categoryId, editingCoefValue)}
                                                            style={{ background: 'var(--accent-green)', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                                                        >
                                                            💾
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingCoefId(null)}
                                                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', cursor: 'pointer', color: 'var(--text-primary)' }}
                                                        >
                                                            ❌
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-indigo)' }}>{coef.percentage.toFixed(2)}%</span>
                                                        {selectedTenant !== 'ALL' && (
                                                            <button
                                                                onClick={() => {
                                                                    setEditingCoefId(coef.categoryId);
                                                                    setEditingCoefValue(coef.percentage);
                                                                }}
                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                                                            >
                                                                ✏️
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Simulator Overlay Modal */}
            {isSimulatorOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 19000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="glass-card" style={{ width: '450px', maxHeight: '80vh', padding: '1.5rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                🚀 Simulador de Contratos ({contracts.length})
                            </h4>
                            <button
                                onClick={() => setIsSimulatorOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 }}
                            >
                                ❌
                            </button>
                        </div>

                        {/* List of Simulated Contracts */}
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem' }}>
                            {contracts.length === 0 ? (
                                <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    Nenhum contrato simulado no momento. Adicione um novo contrato para ver as projeções de faturamento e custos.
                                </div>
                            ) : (
                                contracts.map(contract => (
                                    <div key={contract.id} style={{ padding: '0.85rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{contract.name}</span>
                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                                    🏢 {contract.tenant?.name || 'Empresa desconhecida'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => {
                                                        setEditingContractId(contract.id);
                                                        setContractName(contract.name);
                                                        setContractValue(contract.value);
                                                        setContractStartMonth(contract.startMonth);
                                                        setContractProbability(contract.probability);
                                                        setContractStatus(contract.status);
                                                        setContractTenantId(contract.tenantId);
                                                        setIsContractModalOpen(true);
                                                    }}
                                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }}
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteContract(contract.id)}
                                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-indigo)' }}>{fmt(contract.value)}/mês</span>
                                            <span style={{
                                                fontSize: '0.65rem',
                                                fontWeight: 800,
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: contract.status === 'VENDIDO' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                                                color: contract.status === 'VENDIDO' ? 'var(--accent-green)' : 'var(--accent-indigo)'
                                            }}>
                                                {contract.status === 'VENDIDO' ? 'VENDIDO' : `${contract.probability}% Prob.`}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                            Início em: {monthsName[contract.startMonth - 1]} / {contract.startYear}
                                        </div>

                                        {/* Progress Bar */}
                                        <div style={{ width: '100%', height: '4px', background: 'var(--border-subtle)', borderRadius: '2px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${contract.status === 'VENDIDO' ? 100 : contract.probability}%`,
                                                height: '100%',
                                                background: contract.status === 'VENDIDO' ? 'var(--accent-green)' : 'var(--accent-indigo)'
                                            }} />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Bottom Action */}
                        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => {
                                    setEditingContractId(null);
                                    setContractName('');
                                    setContractValue(0);
                                    setContractStartMonth(activeMonth + 1 > 12 ? 12 : activeMonth + 1);
                                    setContractProbability(100);
                                    setContractStatus('PIPELINE');
                                    setContractTenantId(companies[0]?.id || '');
                                    setIsContractModalOpen(true);
                                }}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: 'var(--gradient-brand)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    width: '100%'
                                }}
                            >
                                ➕ Adicionar Novo Contrato
                            </button>
                        </div>

                    </div>
                </div>
            )}

            {/* Contract Modal */}
            {isContractModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="glass-card" style={{ width: '380px', padding: '1.5rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{editingContractId ? '✏️ Editar Contrato' : '➕ Novo Contrato de Simulação'}</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            {selectedTenant === 'ALL' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Empresa Destino</label>
                                    <select
                                        value={contractTenantId}
                                        onChange={(e) => setContractTenantId(e.target.value)}
                                        style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                    >
                                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Nome do Cliente / Oportunidade</label>
                                <input
                                    type="text"
                                    value={contractName}
                                    onChange={(e) => setContractName(e.target.value)}
                                    placeholder="Ex: Novo Cliente Alfa"
                                    style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Valor Mensal (R$)</label>
                                <input
                                    type="number"
                                    value={contractValue}
                                    onChange={(e) => setContractValue(parseFloat(e.target.value) || 0)}
                                    style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Mês de Início</label>
                                    <select
                                        value={contractStartMonth}
                                        onChange={(e) => setContractStartMonth(parseInt(e.target.value))}
                                        style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                    >
                                        {monthsName.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                                    </select>
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Status</label>
                                    <select
                                        value={contractStatus}
                                        onChange={(e) => {
                                            setContractStatus(e.target.value);
                                            if (e.target.value === 'VENDIDO') setContractProbability(100);
                                        }}
                                        style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="PIPELINE">Pipeline / Em Negoc.</option>
                                        <option value="VENDIDO">VENDIDO (Ganho)</option>
                                    </select>
                                </div>
                            </div>

                            {contractStatus === 'PIPELINE' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Probabilidade de Fechamento: {contractProbability}%</label>
                                    <input
                                        type="range"
                                        min="10"
                                        max="100"
                                        step="10"
                                        value={contractProbability}
                                        onChange={(e) => setContractProbability(parseInt(e.target.value))}
                                        style={{ accentColor: 'var(--accent-indigo)' }}
                                    />
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                            <button
                                onClick={() => setIsContractModalOpen(false)}
                                style={{ padding: '0.45rem 1rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveContract}
                                style={{ padding: '0.45rem 1rem', borderRadius: '6px', border: 'none', background: 'var(--accent-indigo)', color: '#ffffff', cursor: 'pointer', fontWeight: 700 }}
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
