'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { SyncButton } from '@/components/SyncButton';
import { ExcelPasteModal } from '@/components/ExcelPasteModal';
import ManualCostCenterModal from '@/components/ManualCostCenterModal';

interface SummaryItem {
    tenantId: string;
    tenantName: string;
    costCenterId: string;
    costCenterName: string;
    totalRevenueBudget: number;
    totalExpenseBudget: number;
    totalRevenue: number;
    totalExpense: number;
    hasBudgetData: boolean;
    hasRealizedData: boolean;
    isLocked: boolean;
    status: string;
    n1ApprovedBy: string | null;
    n1ApprovedAt: string | null;
    n2ApprovedBy: string | null;
    n2ApprovedAt: string | null;
    currentUserAccessLevel: string;
    taxRate: number;
}

interface TenantGroup {
    tenantId: string;
    tenantName: string;
    totalRevenueBudget: number;
    totalExpenseBudget: number;
    totalRevenue: number;
    totalExpense: number;
    hasBudget: boolean;
    finishedCount: number;
    totalCount: number;
    taxRate: number;
    costCenters: SummaryItem[];
}

export default function BudgetSummaryPage() {
    const [data, setData] = useState<SummaryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [expandedTenants, setExpandedTenants] = useState<Set<string>>(new Set());
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isTogglingLock, setIsTogglingLock] = useState<string | null>(null);
    const [selectedForAudit, setSelectedForAudit] = useState<SummaryItem | null>(null);
    const [auditActionLoading, setAuditActionLoading] = useState(false);
    const [updatingTaxId, setUpdatingTaxId] = useState<string | null>(null);
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
    const [excelTenantId, setExcelTenantId] = useState('DEFAULT');
    const [isManualCCModalOpen, setIsManualCCModalOpen] = useState(false);
    const [manualCCTenant, setManualCCTenant] = useState({ id: '', name: '' });
    const [editingCC, setEditingCC] = useState<{ id: string, name: string } | null>(null);
    const [filterMode, setFilterMode] = useState<'active' | 'all' | 'inactive'>('active');
    const [setupData, setSetupData] = useState<{ categories: any[], costCenters: any[], companies: any[] }>({ categories: [], costCenters: [], companies: [] });
    const [appVersion, setAppVersion] = useState('...');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [summaryRes, authRes, setupRes, versionRes] = await Promise.all([
                fetch(`/api/cost-centers/summary?year=${selectedYear}&filterMode=${filterMode}`),
                fetch('/api/auth/me'),
                fetch(`/api/setup?year=${selectedYear}`),
                fetch('/api/version')
            ]);
            
            const [summaryResult, authResult, setupResult, versionResult] = await Promise.all([
                summaryRes.json(),
                authRes.json(),
                setupRes.json(),
                versionRes.json()
            ]);

            if (summaryResult.success) {
                setData(summaryResult.data.filter((item: SummaryItem) => {
                    // If it's a real item (CC), always show (if not inactive/closed already filtered in SQL)
                    if (item.costCenterId !== 'DEFAULT') return true;
                    // If it's a GENERAL item, show only if it has some budget data
                    return item.hasBudgetData;
                }));
            }
            if (authResult.success) setUserRole(authResult.user.role);
            if (setupResult.success) {
                // Use the complete list of tenants from the setup API
                const companies = setupResult.tenants || [];
                
                setSetupData({ 
                    categories: setupResult.categories, 
                    costCenters: setupResult.costCenters,
                    companies: companies 
                });
            }
            if (versionResult.version) setAppVersion(versionResult.version);
        } catch (e: any) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [selectedYear, filterMode]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const groupedData = useMemo(() => {
        const groups = new Map<string, TenantGroup>();

        data.forEach(item => {
            if (!groups.has(item.tenantId)) {
                groups.set(item.tenantId, {
                    tenantId: item.tenantId,
                    tenantName: item.tenantName,
                    totalRevenueBudget: 0,
                    totalExpenseBudget: 0,
                    totalRevenue: 0,
                    totalExpense: 0,
                    hasBudget: false,
                    finishedCount: 0,
                    totalCount: 0,
                    taxRate: 0,
                    costCenters: []
                });
            }
            const group = groups.get(item.tenantId)!;
            group.totalRevenueBudget += (item.totalRevenueBudget || 0);
            group.totalExpenseBudget += (item.totalExpenseBudget || 0);
            group.totalRevenue += (item.totalRevenue || 0);
            group.totalExpense += (item.totalExpense || 0);
            group.totalCount++;
            if (item.hasBudgetData) group.finishedCount++;
            group.taxRate = item.taxRate;
            group.costCenters.push(item);
        });

        groups.forEach(group => {
            group.hasBudget = group.finishedCount === group.totalCount;
            group.costCenters.sort((a, b) => a.costCenterName.localeCompare(b.costCenterName));
        });

        const sortedGroups = Array.from(groups.values()).sort((a, b) => a.tenantName.localeCompare(b.tenantName));

        if (searchTerm) {
            const lowTerm = searchTerm.toLowerCase();
            return sortedGroups.filter(group => {
                const matchesTenant = group.tenantName.toLowerCase().includes(lowTerm);
                const hasMatchingCC = group.costCenters.some(cc =>
                    cc.costCenterName.toLowerCase().includes(lowTerm)
                );
                return matchesTenant || hasMatchingCC;
            }).map(group => {
                const filteredCCs = group.costCenters.filter(cc =>
                    cc.costCenterName.toLowerCase().includes(lowTerm) ||
                    group.tenantName.toLowerCase().includes(lowTerm)
                );
                return { ...group, costCenters: filteredCCs };
            });
        }

        return sortedGroups;
    }, [data, searchTerm]);

    const toggleTenant = (id: string) => {
        setExpandedTenants(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleApprovalAction = async (action: string) => {
        if (!selectedForAudit) return;
        setAuditActionLoading(true);
        try {
            const res = await fetch('/api/cost-centers/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: selectedForAudit.tenantId,
                    costCenterId: selectedForAudit.costCenterId,
                    year: selectedYear,
                    action
                })
            });
            const result = await res.json();
            if (result.success) {
                await fetchData();
                setSelectedForAudit(null);
            } else {
                alert(result.error || 'Erro na aprovação');
            }
        } catch (e) {
            alert('Erro de conexão.');
        } finally {
            setAuditActionLoading(false);
        }
    };
    
    const handleTaxRateUpdate = async (tenantId: string, newRate: string) => {
        const rate = parseFloat(newRate);
        if (isNaN(rate)) return;
        setUpdatingTaxId(tenantId);
        try {
            const res = await fetch(`/api/companies/${tenantId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taxRate: rate })
            });
            const result = await res.json();
            if (result.success) {
                setData(prev => prev.map(item => item.tenantId === tenantId ? { ...item, taxRate: rate } : item));
            } else {
                alert(result.error || 'Erro ao atualizar taxa');
            }
        } catch (e) {
            alert('Erro de conexão');
        } finally {
            setUpdatingTaxId(null);
        }
    };

    const toggleLockStatus = async (cc: SummaryItem, currentLockState: boolean) => {
        if (userRole !== 'MASTER') {
            alert("Apenas administradores (Master) podem trancar/destrancar unidades manualmente.");
            return;
        }

        if (currentLockState && !confirm(`Deseja reabrir o orçamento de "${cc.costCenterName}"? \nIsso resetará o status para PENDENTE e excluirá o histórico de aprovações. \n\nO cadeado abrirá para edição e o fluxo de aprovação deverá ser refeito.`)) {
            return;
        }
        
        setIsTogglingLock(cc.costCenterId);
        try {
            const res = await fetch('/api/cost-centers/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: cc.tenantId,
                    costCenterId: cc.costCenterId,
                    year: selectedYear,
                    action: currentLockState ? 'REOPEN' : 'SUBMIT_N1'
                })
            });
            const result = await res.json();
            if (result.success) {
                await fetchData();
            } else {
                alert(result.error || 'Erro ao alterar bloqueio');
            }
        } catch (e) {
            console.error(e);
            alert('Erro de conexão ao alterar bloqueio.');
        } finally {
            setIsTogglingLock(null);
        }
    };

    const handleDeleteCC = async (cc: SummaryItem) => {
        if (!confirm(`🚨 ATENÇÃO: Deseja EXCLUIR DEFINITIVAMENTE o centro de custo "${cc.costCenterName}"?\n\nIsso apagará TODO O HISTÓRICO DE ORÇAMENTOS E REALIZADOS atrelados a ele no nosso sistema.\nSe quiser apenas esconder, use a função Invisibilizar.`)) return;
        
        try {
            const res = await fetch('/api/cost-centers', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: cc.costCenterId, tenantId: cc.tenantId })
            });
            const result = await res.json();
            if (result.success) {
                alert('Centro de custo excluído com sucesso.');
                fetchData();
            } else {
                alert(result.error || 'Erro ao excluir');
            }
        } catch (e) {
            alert('Falha de conexão.');
        }
    };

    const handleToggleInactiveCC = async (cc: SummaryItem) => {
        const isInactive = cc.costCenterName.toUpperCase().includes('[INATIVO]');
        if (!confirm(`Deseja ${isInactive ? 'REATIVAR' : 'INATIVAR (Ocultar)'} o centro de custo "${cc.costCenterName}"?`)) return;
        
        try {
            const res = await fetch('/api/cost-centers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: cc.costCenterId, tenantId: cc.tenantId, inativar: true })
            });
            const result = await res.json();
            if (result.success) {
                fetchData();
            } else {
                alert(result.error || 'Erro ao inativar');
            }
        } catch (e) {
            alert('Falha de conexão.');
        }
    };

    const stats = useMemo(() => {
        const totalCCs = data.length;
        const withBudget = data.filter(i => i.hasBudgetData).length;
        const withoutBudget = totalCCs - withBudget;
        const totalRevenueBudget = data.reduce((acc, curr) => acc + curr.totalRevenueBudget, 0);
        const totalExpenseBudget = data.reduce((acc, curr) => acc + curr.totalExpenseBudget, 0);
        const resultValue = totalRevenueBudget - totalExpenseBudget;
        const resultPercent = totalRevenueBudget !== 0 ? (resultValue / totalRevenueBudget) * 100 : 0;

        return {
            totalCCs, withBudget, withoutBudget,
            totalRevenueBudget, totalExpenseBudget,
            resultValue, resultPercent
        };
    }, [data]);

    const formatCurrency = (value: number) => {
        if (value === 0) return '-';
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2
        }).format(value);
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div className="spinner"></div>
                    <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Carregando resumo financeiro...</p>
                </div>
            </div>
        );
    }

    const th: React.CSSProperties = {
        background: 'var(--bg-surface)', padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-subtle)',
        color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap'
    };
    const td: React.CSSProperties = {
        padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.85rem', color: 'var(--text-secondary)'
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'Inter, system-ui, sans-serif', padding: '2.5rem 2rem' }}>
            <div className="container">
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.5rem' }}>
                    <div>
                        <h1 className="brand-text" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Resumo Consolidado</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Visão geral de orçamentos e centros de custo.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {/* RADAR LINK HIDDEN */}
                        {/* {userRole === 'MASTER' && (
                            <Link href="/radar" className="btn btn-primary" style={{ padding: '0.75rem 1.25rem' }}>🎯 Gestão de Radar</Link>
                        )} */}
                        {userRole === 'MASTER' && (
                            <button 
                                onClick={async () => {
                                    if (confirm('Deseja DESTRANCAR TODOS os orçamentos de ' + selectedYear + '? \nIsso permitirá a edição de todas as unidades.')) {
                                        setLoading(true);
                                        try {
                                            const res = await fetch('/api/admin/unlock-all?year=' + selectedYear, { method: 'POST' });
                                            const result = await res.json();
                                            if (result.success) await fetchData();
                                            else alert(result.error);
                                        } catch (e) { alert('Erro ao destrancar'); }
                                        finally { setLoading(false); }
                                    }
                                }} 
                                className="btn" 
                                style={{ padding: '0.75rem 1.25rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }}
                            >
                                🔓 Destrancar Todos
                            </button>
                        )}
                        {userRole === 'MASTER' && (
                            <SyncButton year={selectedYear} onSyncStart={() => setLoading(true)} onSyncComplete={fetchData} />
                        )}
                        <Link href="/" className="btn btn-secondary" style={{ padding: '0.75rem 1.25rem' }}>⬅️ Dashboard</Link>
                    </div>
                </div>

                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div className="stat-card">
                        <p className="stat-label">Total de Unidades</p>
                        <p className="stat-value">{stats.totalCCs}</p>
                    </div>
                    <div className="stat-card">
                        <p className="stat-label" style={{ color: 'var(--accent-green)' }}>Digitados</p>
                        <p className="stat-value" style={{ color: 'var(--accent-green)' }}>{stats.withBudget}</p>
                    </div>
                    <div className="stat-card">
                        <p className="stat-label" style={{ color: 'var(--accent-red)' }}>Pendentes</p>
                        <p className="stat-value" style={{ color: 'var(--accent-red)' }}>{stats.withoutBudget}</p>
                    </div>
                    <div className="stat-card" style={{ borderStyle: 'dashed', borderColor: 'var(--border-strong)' }}>
                        <p className="stat-label">Ano Referência</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                            <button onClick={() => setSelectedYear(prev => prev - 1)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>◀</button>
                            <span style={{ fontSize: '1.75rem', fontWeight: 900 }}>{selectedYear}</span>
                            <button onClick={() => setSelectedYear(prev => prev + 1)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>▶</button>
                        </div>
                    </div>
                </div>

                {/* Financial KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
                    <div className="stat-card" style={{ background: 'rgba(16, 185, 129, 0.05)' }}>
                        <p className="stat-label" style={{ color: 'var(--accent-green)' }}>1. Receita Orçada</p>
                        <p className="stat-value" style={{ color: 'var(--accent-green)' }}>{formatCurrency(stats.totalRevenueBudget)}</p>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(239, 68, 68, 0.05)' }}>
                        <p className="stat-label" style={{ color: 'var(--accent-red)' }}>2. Despesa Orçada</p>
                        <p className="stat-value" style={{ color: 'var(--accent-red)' }}>{formatCurrency(stats.totalExpenseBudget)}</p>
                    </div>
                    <div className="stat-card" style={{ borderLeft: '4px solid var(--accent-blue)' }}>
                        <p className="stat-label">3. Resultado Orçado</p>
                        <p className="stat-value">{formatCurrency(stats.resultValue)}</p>
                    </div>
                    <div className="stat-card" style={{ background: 'var(--gradient-brand)', border: 'none' }}>
                        <p className="stat-label" style={{ color: 'rgba(255,255,255,0.7)' }}>4. % Margem Orçada</p>
                        <p className="stat-value" style={{ color: '#fff' }}>{stats.resultPercent.toFixed(1)}%</p>
                    </div>
                </div>

                {/* Search & Filters */}
                <div style={{ backgroundColor: 'var(--bg-card)', padding: '1rem 1.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-default)', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                        <span>🔍</span>
                        <input type="text" placeholder="Pesquisar Centro de Custo..." className="premium-input" style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '1.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status:</span>
                        <select 
                            value={filterMode} 
                            onChange={(e) => setFilterMode(e.target.value as any)}
                            style={{ 
                                padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', 
                                background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, 
                                cursor: 'pointer', outline: 'none' 
                            }}
                        >
                            <option value="active">✅ Somente Ativos (DRE Oficial)</option>
                            <option value="all">⚠️ Incluir Inativos (DRE Expandida)</option>
                            <option value="inactive">🚫 Somente Inativos</option>
                        </select>
                    </div>
                </div>

                {/* Table */}
                <div className="glass-card" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="premium-table">
                            <thead>
                                <tr>
                                    <th style={{ ...th, textAlign: 'left', width: '350px' }}>Organização / Centro de Custo</th>
                                    <th style={{ ...th, textAlign: 'right', color: 'var(--accent-blue)' }}>RECEITA (ORÇADA)</th>
                                    <th style={{ ...th, textAlign: 'right', color: 'var(--accent-red)' }}>DESPESA (ORÇADA)</th>
                                    <th style={{ ...th, textAlign: 'right', color: 'var(--accent-green)' }}>RESULTADO</th>
                                    <th style={{ ...th, textAlign: 'center' }}>% Margem</th>
                                    <th style={{ ...th, textAlign: 'center' }}>🔒 Cadeado</th>
                                    <th style={{ ...th, textAlign: 'center' }}>Configuração / Status</th>
                                    <th style={{ ...th, textAlign: 'center', width: '150px' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedData.length > 0 ? groupedData.map((group) => {
                                    const isExpanded = expandedTenants.has(group.tenantId) || searchTerm !== '';
                                    const isComplete = group.finishedCount === group.totalCount;

                                    return (
                                        <React.Fragment key={group.tenantId}>
                                            <tr onClick={() => toggleTenant(group.tenantId)} className="hover-row" style={{ background: 'var(--bg-elevated)', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}>
                                                <td style={{ ...td, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                                    <span style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                                                    {group.tenantName}
                                                </td>
                                                <td style={{ ...td, textAlign: 'right', fontWeight: 900, color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.03)' }}>{formatCurrency(group.totalRevenueBudget)}</td>
                                                <td style={{ ...td, textAlign: 'right', fontWeight: 900, color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.03)' }}>{formatCurrency(group.totalExpenseBudget)}</td>
                                                <td style={{ ...td, textAlign: 'right', fontWeight: 900, color: 'var(--accent-green)', background: 'rgba(16, 185, 129, 0.03)' }}>{formatCurrency(group.totalRevenueBudget - group.totalExpenseBudget)}</td>
                                                <td style={{ ...td, textAlign: 'center' }}>
                                                    <span style={{ background: isComplete ? 'var(--accent-green-glow)' : 'var(--accent-red-glow)', color: isComplete ? 'var(--accent-green)' : 'var(--accent-red)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>
                                                        {group.totalRevenueBudget > 0 ? ((group.totalRevenueBudget - group.totalExpenseBudget) / group.totalRevenueBudget * 100).toFixed(1) : '0'}%
                                                    </span>
                                                </td>
                                                <td style={{ ...td, textAlign: 'center' }}>-</td>
                                                <td style={{ ...td, textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                                        {updatingTaxId === group.tenantId ? (
                                                            <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></div>
                                                        ) : (
                                                            <input 
                                                                type="text" 
                                                                defaultValue={group.taxRate} 
                                                                onBlur={(e) => handleTaxRateUpdate(group.tenantId, e.target.value)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                                style={{ 
                                                                    width: '45px', 
                                                                    textAlign: 'center', 
                                                                    background: 'transparent', 
                                                                    border: '1px solid var(--border-subtle)', 
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: 700,
                                                                    padding: '2px'
                                                                }}
                                                            />
                                                        )}
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>% DAS</span>
                                                        <span title="Clique no número para editar" style={{ cursor: 'help', fontSize: '0.8rem', opacity: 0.6 }}>✏️</span>
                                                    </div>
                                                </td>
                                                 <td style={{ ...td, textAlign: 'center' }}>
                                                     <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                                        {userRole === 'MASTER' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setExcelTenantId(group.tenantId); setIsExcelModalOpen(true); }}
                                                                style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.4)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span>📊</span> IMPORTAR
                                                            </button>
                                                        )}
                                                        {userRole === 'MASTER' && (
                                                            <button onClick={(e) => { e.stopPropagation(); setEditingCC(null); setManualCCTenant({ id: group.tenantId, name: group.tenantName }); setIsManualCCModalOpen(true); }} style={{ padding: '0.6rem 0.8rem', fontSize: '0.75rem', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}><span>➕</span> NOVO CC</button>
                                                        )}
                                                     </div>
                                                 </td>
                                             </tr>

                                            {isExpanded && group.costCenters.map((cc) => (
                                                <tr key={cc.costCenterId} className="cc-row" style={{ background: 'var(--bg-surface)' }}>
                                                    <td style={{ ...td, paddingLeft: '3.5rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            {cc.costCenterName}
                                                            <Link href={`/orcamento/${cc.costCenterId}?year=${selectedYear}`} className="btn" style={{ padding: '0.2rem 0.4rem', fontSize: '0.65rem', background: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)' }}>✏️ Orçar</Link>
                                                        </div>
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.02)' }}>{formatCurrency(cc.totalRevenueBudget)}</td>
                                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.02)' }}>{formatCurrency(cc.totalExpenseBudget)}</td>
                                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--accent-green)', background: 'rgba(16, 185, 129, 0.02)' }}>{formatCurrency(cc.totalRevenueBudget - cc.totalExpenseBudget)}</td>
                                                    <td style={{ ...td, textAlign: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                                                        {cc.totalRevenueBudget > 0 ? ((cc.totalRevenueBudget - cc.totalExpenseBudget) / cc.totalRevenueBudget * 100).toFixed(1) : '0'}%
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'center' }}>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); toggleLockStatus(cc, cc.isLocked); }}
                                                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: cc.isLocked ? 'var(--accent-red)' : 'var(--accent-green)' }}
                                                        >
                                                            {cc.isLocked ? '🔒' : '🔓'}
                                                        </button>
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'center' }}>
                                                        <div style={{ 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            justifyContent: 'center',
                                                            gap: '0.4rem',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 800,
                                                            color: cc.status === 'APPROVED' ? 'var(--accent-green)' : cc.status === 'AWAITING_N2' ? 'var(--accent-blue)' : 'var(--text-muted)',
                                                            background: cc.status === 'APPROVED' ? 'var(--accent-green-glow)' : cc.status === 'AWAITING_N2' ? 'rgba(59,130,246,0.1)' : 'rgba(156,163,175,0.1)',
                                                            padding: '0.3rem 0.6rem',
                                                            borderRadius: '8px'
                                                        }}>
                                                            {cc.status === 'APPROVED' ? '✅ APROVADO' : cc.status === 'AWAITING_N2' ? '⏳ AUDITORIA' : cc.status === 'REJECTED' ? '❌ REVISAR' : '🕒 PENDENTE'}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                                            {userRole === 'MASTER' && (
                                                                <>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); setEditingCC({ id: cc.costCenterId, name: cc.costCenterName }); setManualCCTenant({ id: cc.tenantId, name: cc.tenantName }); setIsManualCCModalOpen(true); }} 
                                                                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '0.3rem', cursor: 'pointer' }}
                                                                        title="Editar Nome do C.C"
                                                                    >
                                                                        ✏️
                                                                    </button>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleToggleInactiveCC(cc); }} 
                                                                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '0.3rem', cursor: 'pointer', filter: cc.costCenterName.toUpperCase().includes('[INATIVO]') ? 'grayscale(1)' : 'none' }}
                                                                        title={cc.costCenterName.toUpperCase().includes('[INATIVO]') ? "Reativar" : "Inativar (Ocultar)"}
                                                                    >
                                                                        {cc.costCenterName.toUpperCase().includes('[INATIVO]') ? "👁️‍🗨️" : "🚫"}
                                                                    </button>
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteCC(cc); }} 
                                                                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '0.3rem', cursor: 'pointer' }}
                                                                        title="Excluir C.C Histórico"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                </>
                                                            )}
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setSelectedForAudit(cc); }} 
                                                                style={{ 
                                                                    background: cc.status === 'AWAITING_N2' ? 'var(--accent-blue)' : 'var(--bg-elevated)',
                                                                    color: cc.status === 'AWAITING_N2' ? 'white' : 'var(--text-primary)',
                                                                    border: '1px solid var(--border-subtle)',
                                                                    borderRadius: '8px',
                                                                    padding: '0.4rem 0.8rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 800,
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                    boxShadow: cc.status === 'AWAITING_N2' ? '0 4px 6px -1px rgba(59, 130, 246, 0.3)' : 'none'
                                                                }}
                                                                className="hover-opacity"
                                                            >
                                                                {cc.status === 'AWAITING_N2' ? '🔍 AUDITAR' : '📄 DETALHES'}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td style={{ ...td }}></td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum resultado encontrado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Audit Modal */}
                {selectedForAudit && (
                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setSelectedForAudit(null)}>
                        <div style={{ background: 'var(--bg-card)', padding: '2.5rem', borderRadius: '24px', width: '100%', maxWidth: '600px', border: '1px solid var(--border-default)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.25rem' }}>Auditoria de Orçamento</h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{selectedForAudit.costCenterName} ({selectedForAudit.tenantName})</p>
                                </div>
                                <button onClick={() => setSelectedForAudit(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', opacity: 0.5 }}>×</button>
                            </div>

                            {/* Modal Content - Financial Summary */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
                                <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                                    <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Receita</p>
                                    <p style={{ fontSize: '0.95rem', fontWeight: 900 }}>{formatCurrency(selectedForAudit.totalRevenueBudget)}</p>
                                </div>
                                <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                                    <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent-red)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Despesa</p>
                                    <p style={{ fontSize: '0.95rem', fontWeight: 900 }}>{formatCurrency(selectedForAudit.totalExpenseBudget)}</p>
                                </div>
                                <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                                    <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent-green)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Resultado</p>
                                    <p style={{ fontSize: '0.95rem', fontWeight: 900 }}>{formatCurrency(selectedForAudit.totalRevenueBudget - selectedForAudit.totalExpenseBudget)}</p>
                                </div>
                                <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                    <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent-green)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Margem %</p>
                                    <p style={{ fontSize: '0.95rem', fontWeight: 900 }}>
                                        {selectedForAudit.totalRevenueBudget > 0 
                                            ? `${((selectedForAudit.totalRevenueBudget - selectedForAudit.totalExpenseBudget) / selectedForAudit.totalRevenueBudget * 100).toFixed(1)}%` 
                                            : '0%'}
                                    </p>
                                </div>
                            </div>

                            {/* Status & History */}
                            <div style={{ background: 'var(--bg-elevated)', padding: '1.5rem', borderRadius: '16px', marginBottom: '2.5rem', border: '1px solid var(--border-subtle)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status Atual:</span>
                                    <span style={{ 
                                        fontWeight: 800, 
                                        fontSize: '0.75rem', 
                                        padding: '0.2rem 0.6rem', 
                                        borderRadius: '12px',
                                        background: selectedForAudit.status === 'APPROVED' ? 'var(--accent-green-glow)' : selectedForAudit.status === 'AWAITING_N2' ? 'rgba(59,130,246,0.1)' : 'rgba(156,163,175,0.1)',
                                        color: selectedForAudit.status === 'APPROVED' ? 'var(--accent-green)' : selectedForAudit.status === 'AWAITING_N2' ? 'var(--accent-blue)' : 'var(--text-muted)'
                                    }}>
                                        {selectedForAudit.status === 'APPROVED' ? 'APROVADO MASTER' : selectedForAudit.status === 'AWAITING_N2' ? 'AGUARDANDO MASTER' : 'EM DIGITAÇÃO / PENDENTE'}
                                    </span>
                                </div>
                                
                                {selectedForAudit.n1ApprovedBy && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Submetido por N1:</span>
                                        <span style={{ fontWeight: 600 }}>{selectedForAudit.n1ApprovedBy} em {new Date(selectedForAudit.n1ApprovedAt!).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                )}
                                {selectedForAudit.n2ApprovedBy && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Aprovado por Master:</span>
                                        <span style={{ fontWeight: 600 }}>{selectedForAudit.n2ApprovedBy} em {new Date(selectedForAudit.n2ApprovedAt!).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                {auditActionLoading ? (
                                    <div style={{ width: '100%', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
                                ) : (
                                    <>
                                        {/* Master or N2 Approver can Approve Final or Reject when awaiting N2 */}
                                        {(userRole === 'MASTER' || ['APROVADOR_N2', 'APROVADOR_N1_N2'].includes(selectedForAudit.currentUserAccessLevel)) && selectedForAudit.status === 'AWAITING_N2' && (
                                            <>
                                                <button 
                                                    onClick={() => handleApprovalAction('APPROVE_N2')}
                                                    style={{ flex: 1, padding: '1rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(22,163,74,0.3)' }}
                                                >
                                                    ✅ APROVAR FINAL
                                                </button>
                                                <button 
                                                    onClick={() => handleApprovalAction('REJECT')}
                                                    style={{ flex: 1, padding: '1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(220,38,38,0.3)' }}
                                                >
                                                    ❌ PEDIR REVISÃO
                                                </button>
                                            </>
                                        )}

                                        {/* Master or N2 Approver can Reopen once approved */}
                                        {(userRole === 'MASTER' || ['APROVADOR_N2', 'APROVADOR_N1_N2'].includes(selectedForAudit.currentUserAccessLevel)) && selectedForAudit.status === 'APPROVED' && (
                                            <button 
                                                onClick={() => handleApprovalAction('REOPEN')}
                                                style={{ flex: 1, padding: '1rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}
                                            >
                                                🔓 REABRIR PARA AJUSTES
                                            </button>
                                        )}

                                        {selectedForAudit.status === 'PENDING' && (userRole === 'MASTER' || ['APROVADOR_N1', 'APROVADOR_N1_N2'].includes(selectedForAudit.currentUserAccessLevel)) && (
                                            <button 
                                                onClick={() => handleApprovalAction('SUBMIT_N1')}
                                                style={{ flex: 1, padding: '1rem', background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
                                            >
                                                🚀 FINALIZAR E ENVIAR AO MASTER
                                            </button>
                                        )}

                                        {/* Close button for all states */}
                                        <button 
                                            onClick={() => setSelectedForAudit(null)}
                                            style={{ padding: '1rem 1.5rem', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: '12px', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Fechar
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <ExcelPasteModal 
                    isOpen={isExcelModalOpen}
                    onClose={() => { setIsExcelModalOpen(false); fetchData(); }}
                    tenantId={excelTenantId}
                    companies={setupData.companies}
                    categories={setupData.categories}
                    costCenters={setupData.costCenters}
                    year={selectedYear}
                    viewMode="competencia"
                />

                <ManualCostCenterModal
                    isOpen={isManualCCModalOpen}
                    initialData={editingCC}
                    onClose={() => { setIsManualCCModalOpen(false); setEditingCC(null); }}
                    onSuccess={() => {
                        fetchData();
                        alert(`Centro de Custo ${editingCC ? 'atualizado' : 'criado'} com sucesso!`);
                    }}
                    tenantId={manualCCTenant.id}
                    tenantName={manualCCTenant.name}
                />

                {/* Version Footer */}
                <div style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Budget Hub - Sistema de Planejamento - Versão 
                        <span style={{ fontWeight: 800, marginLeft: '4px' }}>
                            {appVersion}
                        </span>
                    </p>
                </div>

                <style jsx global>{`
                    .brand-text { font-weight: 900; background: var(--gradient-brand); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                    .stat-card { background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius); border: 1px solid var(--border-subtle); }
                    .stat-label { font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; }
                    .stat-value { font-size: 1.5rem; font-weight: 900; color: var(--text-primary); }
                    .glass-card { background: var(--bg-card); border-radius: var(--radius); border: 1px solid var(--border-subtle); }
                    .btn { cursor: pointer; border-radius: 6px; font-weight: 700; border: 1px solid transparent; }
                    .btn-primary { background: var(--accent-blue); color: white; }
                    .btn-secondary { background: var(--bg-elevated); color: var(--text-primary); border-color: var(--border-subtle); }
                    .premium-table { width: 100%; border-collapse: collapse; }
                    .hover-row:hover { background-color: var(--bg-surface) !important; }
                    .spinner { width: 20px; height: 20px; border: 3px solid var(--border-subtle); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 0.8s linear infinite; }
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        </div>
    );
}
