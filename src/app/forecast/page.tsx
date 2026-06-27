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
    const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

    // Modal/Form States for Simulated Contract
    const [isContractModalOpen, setIsContractModalOpen] = useState(false);
    const [editingContractId, setEditingContractId] = useState<string | null>(null);
    const [contractName, setContractName] = useState('');
    const [contractValue, setContractValue] = useState(0);
    const [contractStartMonth, setContractStartMonth] = useState(6);
    const [contractProbability, setContractProbability] = useState(100);
    const [contractStatus, setContractStatus] = useState('PIPELINE');

    // Coefficient Edit State
    const [editingCoefId, setEditingCoefId] = useState<string | null>(null);
    const [editingCoefValue, setEditingCoefValue] = useState(0);

    const fetchSetup = useCallback(async () => {
        try {
            const res = await fetch('/api/companies');
            const json = await res.json();
            if (json.success && json.companies) {
                setCompanies(json.companies);
                const cached = localStorage.getItem('selectedTenantId') || json.companies[0]?.id || '';
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
        try {
            const res = await fetch('/api/kpi/forecast/contracts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingContractId || undefined,
                    tenantId: selectedTenant,
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

    // Helper to format currency
    const fmt = (v: number) => {
        const absolute = Math.abs(v);
        const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(absolute);
        return v < 0 ? `- ${formatted}` : formatted;
    };

    const monthsName = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    // Group forecast grid categories logically
    const displayGrid = useMemo(() => {
        if (forecastData.length === 0) return [];
        // Map DRE rows
        return forecastData.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    }, [forecastData]);

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
                    <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.5rem' }}>
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
                                            <th key={i} style={{ padding: '0.5rem', textAlign: 'right', background: i + 1 <= activeMonth ? 'rgba(99, 102, 241, 0.05)' : 'transparent' }}>
                                                {name} <span style={{ fontSize: '0.6rem', display: 'block', opacity: 0.7 }}>{i + 1 <= activeMonth ? 'Real' : 'Proj'}</span>
                                            </th>
                                        ))}
                                        <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 800 }}>Total Forecast</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', opacity: 0.8 }}>Budget Original</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Variação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayGrid.map(row => {
                                        const sumForecast = row.forecast.reduce((a: number, b: number) => a + b, 0);
                                        const sumBudget = row.budget.reduce((a: number, b: number) => a + b, 0);
                                        const variance = sumForecast - sumBudget;
                                        const isParent = row.categoryId.includes('synth-') || row.categoryId.length <= 6;

                                        return (
                                            <tr key={row.categoryId} style={{ borderBottom: '1px solid var(--border-subtle)', background: isParent ? 'var(--bg-elevated)' : 'transparent', fontWeight: isParent ? 700 : 500 }}>
                                                <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', paddingLeft: isParent ? '0.5rem' : '1.5rem' }}>
                                                    {row.categoryName}
                                                </td>
                                                {row.forecast.map((val: number, i: number) => (
                                                    <td key={i} style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                                                        {fmt(val)}
                                                    </td>
                                                ))}
                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--accent-indigo)' }}>
                                                    {fmt(sumForecast)}
                                                </td>
                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', opacity: 0.8 }}>
                                                    {fmt(sumBudget)}
                                                </td>
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
                                                {editingCoefId === coef.categoryId ? (
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
                                                        <button
                                                            onClick={() => {
                                                                setEditingCoefId(coef.categoryId);
                                                                setEditingCoefValue(coef.percentage);
                                                            }}
                                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                                                        >
                                                            ✏️
                                                        </button>
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
                                            <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{contract.name}</span>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => {
                                                        setEditingContractId(contract.id);
                                                        setContractName(contract.name);
                                                        setContractValue(contract.value);
                                                        setContractStartMonth(contract.startMonth);
                                                        setContractProbability(contract.probability);
                                                        setContractStatus(contract.status);
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
