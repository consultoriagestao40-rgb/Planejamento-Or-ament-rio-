'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface DeviationActionsTabProps {
    companies: any[];
    selectedYear: number;
    MONTHS: string[];
}

export default function DeviationActionsTab({ companies, selectedYear, MONTHS }: DeviationActionsTabProps) {
    const [deviations, setDeviations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Filter States
    const [filterCompany, setFilterCompany] = useState<string>('ALL');
    const [filterMonth, setFilterMonth] = useState<string>('ALL');
    const [filterStatus, setFilterStatus] = useState<string>('PENDING'); // default to pending to focus on action items
    const [filterType, setFilterType] = useState<string>('ALL');
    const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

    // Restore viewMode from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('deviationViewMode');
            if (saved === 'cards' || saved === 'list') {
                setViewMode(saved);
            }
        }
    }, []);

    const handleSetViewMode = (mode: 'cards' | 'list') => {
        setViewMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('deviationViewMode', mode);
        }
    };

    const formatDateSafe = (dateVal: any) => {
        if (!dateVal) return '-';
        try {
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return '-';
            const year = d.getUTCFullYear();
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${day}/${month}/${year}`;
        } catch (e) {
            return '-';
        }
    };

    // Fetch deviations
    const loadAllDeviations = useCallback(async () => {
        setLoading(true);
        try {
            // Determine which tenants to fetch
            const tenantsToFetch = filterCompany === 'ALL' 
                ? (companies || []).map(c => c.id) 
                : [filterCompany];

            if (tenantsToFetch.length === 0) {
                setDeviations([]);
                setLoading(false);
                return;
            }

            // Fetch in parallel for each tenant
            const promises = tenantsToFetch.map(async (tenantId) => {
                const urlMonth = filterMonth !== 'ALL' ? `&month=${filterMonth}` : '';
                const url = `/api/deviations?tenantId=${tenantId}&year=${selectedYear}${urlMonth}&t=${Date.now()}`;
                const res = await fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    return json.success ? json.data || [] : [];
                }
                return [];
            });

            const results = await Promise.all(promises);
            // Flatten results
            const allDevs = results.flat();
            
            // Sort by month ascending, then by createdAt desc
            allDevs.sort((a, b) => {
                if (a.month !== b.month) return a.month - b.month;
                const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
            });

            setDeviations(allDevs);
        } catch (e) {
            console.error("Error loading deviations:", e);
        } finally {
            setLoading(false);
        }
    }, [companies, selectedYear, filterCompany, filterMonth]);

    useEffect(() => {
        loadAllDeviations();
    }, [loadAllDeviations]);

    // Handle resolve toggle
    const handleToggleResolve = async (id: string, currentlyResolved: boolean) => {
        try {
            const res = await fetch('/api/deviations/resolve', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    isResolved: !currentlyResolved,
                    resolvedBy: 'Cristiano Silva'
                })
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    setDeviations(prev => 
                        prev.map(d => d.id === id ? { 
                            ...d, 
                            isResolved: !currentlyResolved,
                            resolvedAt: !currentlyResolved ? new Date() : null,
                            resolvedBy: !currentlyResolved ? 'Cristiano Silva' : null
                        } : d)
                    );
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Handle delete
    const handleDelete = async (id: string) => {
        if (!confirm('Deseja realmente excluir esta ação corretiva?')) return;
        try {
            const res = await fetch(`/api/deviations?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    setDeviations(prev => prev.filter(d => d.id !== id));
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Apply Client-Side Filters (Status and Type)
    const filteredDeviations = deviations.filter(d => {
        // Status Filter
        if (filterStatus === 'PENDING' && d.isResolved) return false;
        if (filterStatus === 'RESOLVED' && !d.isResolved) return false;

        // Type Filter
        if (filterType !== 'ALL' && d.deviationType !== filterType) return false;

        return true;
    });

    // Helper to get company name
    const getCompanyName = (tenantId: string) => {
        const found = (companies || []).find(c => c.id === tenantId);
        return found ? found.name : 'Outra Empresa';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Filters Bar */}
            <div style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '1.5rem 2rem',
                borderRadius: '16px',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.5rem',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', flexContent: 'column', gap: '0.4rem', flex: '1', minWidth: '180px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Empresa</label>
                    <select
                        value={filterCompany}
                        onChange={(e) => setFilterCompany(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', fontWeight: 650 }}
                    >
                        <option value="ALL">🏢 Todas as Empresas</option>
                        {(companies || []).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', flexContent: 'column', gap: '0.4rem', flex: '1', minWidth: '180px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mês</label>
                    <select
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', fontWeight: 650 }}
                    >
                        <option value="ALL">📅 Todos os Meses</option>
                        {MONTHS.map((m, idx) => (
                            <option key={idx} value={idx + 1}>{m}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', flexContent: 'column', gap: '0.4rem', flex: '1', minWidth: '180px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status das Ações</label>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', fontWeight: 650 }}
                    >
                        <option value="ALL">📋 Todos (Resolvido & Pendente)</option>
                        <option value="PENDING">⚠️ Pendentes de Correção</option>
                        <option value="RESOLVED">✅ Resolvidos / Corrigidos</option>
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: '1.2', minWidth: '220px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo de Desvio</label>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: 'none', fontWeight: 650 }}
                    >
                        <option value="ALL">🔍 Todos os Tipos</option>
                        <option value="Reclassificar na fonte (Conta Azul)">Reclassificar na fonte (Conta Azul)</option>
                        <option value="Desvios de orçamento">Desvios de orçamento</option>
                        <option value="Reclassificação gerencial">Reclassificação gerencial</option>
                        <option value="Ajuste de lançamentos">Ajuste de lançamentos</option>
                        <option value="Outro">Outro (Anotações gerais)</option>
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: '0.8', minWidth: '160px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visualização</label>
                    <div style={{ display: 'flex', gap: '0.2rem', backgroundColor: 'var(--bg-elevated)', padding: '0.2rem', borderRadius: '10px', border: '1px solid var(--border-default)', height: '2.3rem', boxSizing: 'border-box', alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={() => handleSetViewMode('cards')}
                            style={{
                                flex: 1,
                                height: '100%',
                                border: 'none',
                                borderRadius: '7px',
                                background: viewMode === 'cards' ? 'var(--bg-surface)' : 'transparent',
                                color: viewMode === 'cards' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontSize: '0.75rem',
                                fontWeight: viewMode === 'cards' ? 800 : 550,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.3rem',
                                boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                                transition: 'all 0.15s'
                            }}
                        >
                            🗂️ Cards
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSetViewMode('list')}
                            style={{
                                flex: 1,
                                height: '100%',
                                border: 'none',
                                borderRadius: '7px',
                                background: viewMode === 'list' ? 'var(--bg-surface)' : 'transparent',
                                color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontSize: '0.75rem',
                                fontWeight: viewMode === 'list' ? 800 : 550,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.3rem',
                                boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                                transition: 'all 0.15s'
                            }}
                        >
                            📑 Lista
                        </button>
                    </div>
                </div>
            </div>


            {/* Content List */}
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 0', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', border: '4px solid rgba(59, 130, 246, 0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Carregando plano de ações...</span>
                </div>
            ) : filteredDeviations.length === 0 ? (
                <div style={{
                    backgroundColor: 'var(--bg-surface)',
                    padding: '4rem 2rem',
                    borderRadius: '16px',
                    border: '1px dashed var(--border-default)',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    boxShadow: 'var(--shadow-card)'
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>Nenhuma ação corretiva pendente!</h3>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Selecione outros filtros ou registre novos desvios diretamente na tabela do DRE clicando no ícone 📋 ao lado das contas.
                    </p>
                </div>
            ) : viewMode === 'list' ? (
                <div style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderRadius: '16px',
                    border: '1px solid var(--border-default)',
                    boxShadow: 'var(--shadow-card)',
                    overflowX: 'auto'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1400px' }}>
                        <thead style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
                            <tr>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '10%' }}>Empresa</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '12%' }}>Conta</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '8%' }}>Período</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '10%' }}>Tipo</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '18%' }}>Desvio / Observação</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '18%' }}>Ação de Correção</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '10%' }}>Responsável</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '8%' }}>Prazo</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '8%' }}>Status</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '8%', textAlign: 'right' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDeviations.map((d) => {
                                const isOverdue = d.dueDate && new Date(d.dueDate) < new Date() && !d.isResolved;
                                return (
                                    <tr 
                                        key={d.id} 
                                        style={{ 
                                            borderBottom: '1px solid var(--border-default)', 
                                            opacity: d.isResolved ? 0.7 : 1,
                                            transition: 'background-color 0.15s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        {/* Empresa */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {getCompanyName(d.tenantId)}
                                            </span>
                                        </td>

                                        {/* Conta */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', textDecoration: d.isResolved ? 'line-through' : 'none' }}>
                                                {d.category?.name || 'Conta não encontrada'}
                                            </span>
                                        </td>

                                        {/* Período */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {MONTHS[d.month - 1]} / {d.year}
                                            </span>
                                        </td>

                                        {/* Tipo */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 750, padding: '0.15rem 0.4rem', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.08)', color: 'var(--accent-blue)', display: 'inline-block' }}>
                                                {d.deviationType}
                                            </span>
                                        </td>

                                        {/* Desvio / Observação */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.3, textDecoration: d.isResolved ? 'line-through' : 'none' }}>
                                                {d.description}
                                            </p>
                                        </td>

                                        {/* Ação de Correção */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'pre-wrap', lineHeight: 1.3, textDecoration: d.isResolved ? 'line-through' : 'none' }}>
                                                {d.correctionAction}
                                            </p>
                                        </td>

                                        {/* Responsável */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                {d.responsible?.avatarUrl ? (
                                                    <img 
                                                        src={d.responsible.avatarUrl} 
                                                        alt={d.responsible.name} 
                                                        style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} 
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: '0.8rem' }}>👤</span>
                                                )}
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                                    {d.responsible?.name || d.responsibleName || 'Não designado'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Prazo */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                            {d.dueDate ? (
                                                <strong style={{ 
                                                    fontSize: '0.8rem',
                                                    color: isOverdue ? 'var(--accent-red)' : 'var(--text-primary)',
                                                    background: isOverdue ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                                    padding: isOverdue ? '0.1rem 0.3rem' : '0',
                                                    borderRadius: isOverdue ? '4px' : '0'
                                                }}>
                                                    {formatDateSafe(d.dueDate)}
                                                </strong>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                                            )}
                                        </td>

                                        {/* Status */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                            <span style={{ 
                                                fontSize: '0.7rem', 
                                                fontWeight: 750, 
                                                padding: '0.15rem 0.4rem', 
                                                borderRadius: '6px', 
                                                background: d.isResolved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', 
                                                color: d.isResolved ? 'var(--accent-green)' : 'var(--accent-red)' 
                                            }}>
                                                {d.isResolved ? 'Resolvido' : 'Pendente'}
                                            </span>
                                        </td>

                                        {/* Ações */}
                                        <td style={{ padding: '1rem', verticalAlign: 'middle', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => handleToggleResolve(d.id, d.isResolved)}
                                                    style={{
                                                        padding: '0.3rem 0.5rem',
                                                        borderRadius: '6px',
                                                        border: d.isResolved ? '1px solid var(--border-default)' : '1px solid rgba(16, 185, 129, 0.3)',
                                                        background: d.isResolved ? 'var(--bg-elevated)' : 'rgba(16, 185, 129, 0.1)',
                                                        color: d.isResolved ? 'var(--text-secondary)' : 'var(--accent-green)',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 800,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {d.isResolved ? 'Reabrir' : '✓ Concluído'}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(d.id)}
                                                    style={{
                                                        padding: '0.3rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-default)',
                                                        background: 'none',
                                                        color: 'var(--accent-red)',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem'
                                                    }}
                                                    title="Excluir ação"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
                    {filteredDeviations.map((d) => {
                        const isOverdue = d.dueDate && new Date(d.dueDate) < new Date() && !d.isResolved;
                        return (
                            <div 
                                key={d.id} 
                                style={{ 
                                    backgroundColor: 'var(--bg-surface)',
                                    borderRadius: '20px',
                                    border: '1px solid var(--border-default)',
                                    boxShadow: 'var(--shadow-card)',
                                    padding: '1.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1.25rem',
                                    position: 'relative',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    opacity: d.isResolved ? 0.75 : 1
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 12px 20px -5px rgba(0, 0, 0, 0.08)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                                }}
                            >
                                {/* Header Info */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {getCompanyName(d.tenantId)}
                                        </span>
                                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', textDecoration: d.isResolved ? 'line-through' : 'none' }}>
                                            {d.category?.name || 'Conta não encontrada'}
                                        </h4>
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                        <button
                                            onClick={() => handleToggleResolve(d.id, d.isResolved)}
                                            style={{
                                                padding: '0.35rem 0.6rem',
                                                borderRadius: '8px',
                                                border: d.isResolved ? '1px solid var(--border-default)' : '1px solid rgba(16, 185, 129, 0.3)',
                                                background: d.isResolved ? 'var(--bg-elevated)' : 'rgba(16, 185, 129, 0.1)',
                                                color: d.isResolved ? 'var(--text-secondary)' : 'var(--accent-green)',
                                                fontSize: '0.75rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {d.isResolved ? 'Reabrir' : '✓ Concluído'}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(d.id)}
                                            style={{
                                                padding: '0.35rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-default)',
                                                background: 'none',
                                                color: 'var(--accent-red)',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                            title="Excluir ação"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>

                                {/* Badges */}
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 750, padding: '0.25rem 0.6rem', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
                                        📅 {MONTHS[d.month - 1]} / {d.year}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 750, padding: '0.25rem 0.6rem', borderRadius: '8px', background: d.isResolved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', color: d.isResolved ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                        {d.isResolved ? 'Resolvido' : 'Pendente'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 750, padding: '0.25rem 0.6rem', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.08)', color: 'var(--accent-blue)' }}>
                                        {d.deviationType}
                                    </span>
                                </div>

                                {/* Description & Plan */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-default)', paddingTop: '1rem' }}>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desvio / Observação</div>
                                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.4, textDecoration: d.isResolved ? 'line-through' : 'none' }}>
                                            {d.description}
                                        </p>
                                    </div>
                                    
                                    <div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ação de Correção</div>
                                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.4, textDecoration: d.isResolved ? 'line-through' : 'none', fontWeight: 550 }}>
                                            {d.correctionAction}
                                        </p>
                                    </div>
                                </div>

                                {/* Meta details: Responsible & Due Date */}
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    marginTop: 'auto',
                                    paddingTop: '0.75rem',
                                    borderTop: '1px solid var(--border-default)',
                                    fontSize: '0.8rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {d.responsible?.avatarUrl ? (
                                            <img 
                                                src={d.responsible.avatarUrl} 
                                                alt={d.responsible.name} 
                                                style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} 
                                            />
                                        ) : (
                                            <span style={{ fontSize: '0.9rem' }}>👤</span>
                                        )}
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            Resp: <strong style={{ color: 'var(--text-primary)' }}>{d.responsible?.name || d.responsibleName || 'Não designado'}</strong>
                                        </span>
                                    </div>

                                    {d.dueDate && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Prazo:</span>
                                            <strong style={{ 
                                                color: isOverdue ? 'var(--accent-red)' : 'var(--text-secondary)',
                                                background: isOverdue ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                                padding: isOverdue ? '0.15rem 0.4rem' : '0',
                                                borderRadius: isOverdue ? '4px' : '0'
                                            }}>
                                                {formatDateSafe(d.dueDate)}
                                            </strong>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
