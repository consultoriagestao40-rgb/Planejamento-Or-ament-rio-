'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ClientLayoutWrapper from '@/components/ClientLayoutWrapper';

interface BillingContract {
    id: string;
    tenantId: string;
    tenantName: string;
    costCenterId: string | null;
    costCenterName: string | null;
    name: string;
    clientData: string | null;
    paymentMethod: string;
    billingDay: number;
    paymentTermDays: number;
    value: number;
    startMonth: number;
    startYear: number;
    endMonth: number | null;
    endYear: number | null;
    isRecurring: boolean;
    isActive: boolean;
    overrides?: BillingOverride[];
    monthlyBudgets: number[];
}

interface BillingOverride {
    id: string;
    billingContractId: string;
    month: number;
    year: number;
    value: number | null;
    billingDay: number | null;
    dueDay: number | null;
    isCancelled: boolean;
    isBilled?: boolean;
}

const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function BillingPage() {
    const [companies, setCompanies] = useState<any[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
    const [activeView, setActiveView] = useState<'billing' | 'payment'>('billing');
    const [contracts, setContracts] = useState<BillingContract[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [showEndedContracts, setShowEndedContracts] = useState<boolean>(false);
    const [sortDay, setSortDay] = useState<number | null>(null);

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState<BillingContract | null>(null);
    const [isCellModalOpen, setIsCellModalOpen] = useState<{
        contract: BillingContract;
        day: number;
        value: number;
        isOverride: boolean;
        isBilled: boolean;
    } | null>(null);

    // Form states
    const [linkCostCenter, setLinkCostCenter] = useState<string>('NEW'); // "NEW" or cost center ID
    const [newName, setNewName] = useState('');
    const [newClientData, setNewClientData] = useState('');
    const [newPaymentMethod, setNewPaymentMethod] = useState('Boleto');
    const [newBillingDay, setNewBillingDay] = useState(5);
    const [newPaymentTermDays, setNewPaymentTermDays] = useState(10);
    const [newValue, setNewValue] = useState('');
    const [newStartMonth, setNewStartMonth] = useState(new Date().getMonth() + 1);
    const [newStartYear, setNewStartYear] = useState(new Date().getFullYear());
    const [newEndMonth, setNewEndMonth] = useState('');
    const [newEndYear, setNewEndYear] = useState('');
    const [newIsRecurring, setNewIsRecurring] = useState(true);
    const [newTenantId, setNewTenantId] = useState('');

    // Config form states
    const [cfgName, setCfgName] = useState('');
    const [cfgClientData, setCfgClientData] = useState('');
    const [cfgPaymentMethod, setCfgPaymentMethod] = useState('');
    const [cfgBillingDay, setCfgBillingDay] = useState(5);
    const [cfgPaymentTermDays, setCfgPaymentTermDays] = useState(10);
    const [cfgValue, setCfgValue] = useState('');
    const [cfgEndMonth, setCfgEndMonth] = useState('');
    const [cfgEndYear, setCfgEndYear] = useState('');
    const [cfgIsRecurring, setCfgIsRecurring] = useState(true);

    // Cell Override states
    const [cellOverrideValue, setCellOverrideValue] = useState('');
    const [cellApplyRecurring, setCellApplyRecurring] = useState(false);
    const [cellIsBilled, setCellIsBilled] = useState(false);
    const [isSavingCell, setIsSavingCell] = useState(false);

    useEffect(() => {
        // Load companies
        fetch('/api/companies')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.companies) {
                    setCompanies(data.companies);
                    const savedTenant = localStorage.getItem('selectedTenantId');
                    if (savedTenant && (savedTenant === 'ALL' || data.companies.find((c: any) => c.id === savedTenant))) {
                        setSelectedTenant(savedTenant);
                    } else if (data.companies.length > 0) {
                        setSelectedTenant(data.companies[0].id);
                        localStorage.setItem('selectedTenantId', data.companies[0].id);
                    }
                }
            })
            .catch(console.error);
    }, []);

    const fetchContracts = () => {
        if (!selectedTenant) return;
        setLoading(true);
        fetch(`/api/billing?tenantId=${selectedTenant}&year=${selectedYear}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setContracts(data.contracts || []);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchContracts();
    }, [selectedTenant, selectedYear]);

    // Fetch cost centers for the active tenant to link them
    useEffect(() => {
        const tenantForCC = isCreateModalOpen ? (newTenantId || (selectedTenant !== 'ALL' ? selectedTenant : '')) : '';
        if (!tenantForCC) {
            setCostCenters([]);
            return;
        }

        fetch(`/api/cost-centers?tenantId=${tenantForCC}`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data) {
                    // Filter out cost centers already linked to an active contract in memory
                    const linkedIds = contracts.map(c => c.costCenterId).filter(Boolean);
                    const unlinked = data.data.filter((cc: any) => !linkedIds.includes(cc.id));
                    setCostCenters(unlinked);
                }
            })
            .catch(console.error);
    }, [isCreateModalOpen, newTenantId, selectedTenant, contracts]);

    useEffect(() => {
        if (selectedTenant && selectedTenant !== 'ALL') {
            setNewTenantId(selectedTenant);
        } else if (companies.length > 0) {
            setNewTenantId(companies[0].id);
        }
    }, [selectedTenant, companies]);

    const handleTenantChange = (id: string) => {
        setSelectedTenant(id);
        localStorage.setItem('selectedTenantId', id);
    };

    // Calculate number of days in selected month
    const daysInMonth = useMemo(() => {
        return new Date(selectedYear, selectedMonth, 0).getDate();
    }, [selectedYear, selectedMonth]);

    const getBillingDetailsForMonth = (contract: BillingContract, m: number, y: number) => {
        // Active range check
        if (y < contract.startYear || (y === contract.startYear && m < contract.startMonth)) {
            return null;
        }
        if (contract.endYear !== null && contract.endMonth !== null) {
            if (y > contract.endYear || (y === contract.endYear && m > contract.endMonth)) {
                return null;
            }
        }
        // Recurring check
        if (!contract.isRecurring) {
            if (y !== contract.startYear || m !== contract.startMonth) {
                return null;
            }
        }

        // Get override
        const override = contract.overrides?.find(o => o.month === m && o.year === y);
        if (override?.isCancelled) {
            return null;
        }

        const value = override?.value !== null && override?.value !== undefined ? override.value : contract.monthlyBudgets[m - 1];
        if (value === 0) return null; // No budget to bill this month

        const billingDay = override?.billingDay !== null && override?.billingDay !== undefined ? override.billingDay : contract.billingDay;

        let dueDate: Date;
        if (override?.dueDay !== null && override?.dueDay !== undefined) {
            dueDate = new Date(y, m - 1, override.dueDay);
        } else {
            dueDate = new Date(y, m - 1, billingDay + contract.paymentTermDays);
        }

        return {
            value,
            billingDay,
            dueDate,
            isBilled: !!override?.isBilled
        };
    };

    // Computes rows mapping contract value to active days on the timeline
    const gridData = useMemo(() => {
        return contracts.map(contract => {
            const dayValues: { [day: number]: { value: number; isOverride: boolean; isBilled: boolean } } = {};

            if (activeView === 'billing') {
                const details = getBillingDetailsForMonth(contract, selectedMonth, selectedYear);
                if (details) {
                    const override = contract.overrides?.find(o => o.month === selectedMonth && o.year === selectedYear);
                    dayValues[details.billingDay] = {
                        value: details.value,
                        isOverride: override?.value !== null && override?.value !== undefined,
                        isBilled: !!override?.isBilled
                    };
                }
            } else {
                // VISÃO DE RECEBIMENTO (due dates)
                // 1. Due dates from billing in the current month
                const currentDetails = getBillingDetailsForMonth(contract, selectedMonth, selectedYear);
                if (currentDetails && currentDetails.dueDate.getMonth() === selectedMonth - 1 && currentDetails.dueDate.getFullYear() === selectedYear) {
                    const override = contract.overrides?.find(o => o.month === selectedMonth && o.year === selectedYear);
                    const day = currentDetails.dueDate.getDate();
                    dayValues[day] = {
                        value: currentDetails.value,
                        isOverride: override?.value !== null && override?.value !== undefined,
                        isBilled: !!override?.isBilled
                    };
                }

                // 2. Due dates from billing in the previous month (rollover)
                const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
                const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
                const prevDetails = getBillingDetailsForMonth(contract, prevMonth, prevYear);
                if (prevDetails && prevDetails.dueDate.getMonth() === selectedMonth - 1 && prevDetails.dueDate.getFullYear() === selectedYear) {
                    const override = contract.overrides?.find(o => o.month === prevMonth && o.year === prevYear);
                    const day = prevDetails.dueDate.getDate();
                    dayValues[day] = {
                        value: (dayValues[day]?.value || 0) + prevDetails.value,
                        isOverride: override?.value !== null && override?.value !== undefined,
                        isBilled: !!override?.isBilled
                    };
                }
            }

            return {
                contract,
                dayValues
            };
        });
    }, [contracts, selectedMonth, selectedYear, activeView]);

    const isContractEnded = (contract: BillingContract) => {
        if (!contract.isActive) return true;
        if (contract.endYear !== null && contract.endMonth !== null) {
            if (selectedYear > contract.endYear || (selectedYear === contract.endYear && selectedMonth > contract.endMonth)) {
                return true;
            }
        }
        return false;
    };

    const filteredGridData = useMemo(() => {
        const list = gridData.filter(({ contract }) => {
            const ended = isContractEnded(contract);
            if (ended && !showEndedContracts) {
                return false;
            }
            return true;
        });

        if (sortDay === null) return list;

        return [...list].sort((a, b) => {
            const valA = a.dayValues[sortDay]?.value || 0;
            const valB = b.dayValues[sortDay]?.value || 0;
            if (valA > 0 && valB === 0) return -1;
            if (valA === 0 && valB > 0) return 1;
            if (valA > 0 && valB > 0) return valB - valA; // highest value first
            return a.contract.name.localeCompare(b.contract.name);
        });
    }, [gridData, selectedMonth, selectedYear, showEndedContracts, sortDay]);

    // Calculate column totals
    const columnTotals = useMemo(() => {
        const totals: { [day: number]: number } = {};
        for (let d = 1; d <= daysInMonth; d++) {
            let sum = 0;
            filteredGridData.forEach(row => {
                if (row.dayValues[d]) {
                    sum += row.dayValues[d].value;
                }
            });
            totals[d] = sum;
        }
        return totals;
    }, [filteredGridData, daysInMonth]);

    const handleCreateContract = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTenantId || !newValue) return;

        let finalName = newName;
        let finalCCId = linkCostCenter;

        if (linkCostCenter !== 'NEW') {
            const ccObj = costCenters.find(cc => cc.id === linkCostCenter);
            if (ccObj) {
                finalName = ccObj.name;
            }
        } else {
            if (!newName) {
                alert('Nome do Cliente é obrigatório ao criar novo Centro de Custo');
                return;
            }
            finalCCId = '';
        }

        try {
            const res = await fetch('/api/billing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: newTenantId,
                    name: finalName,
                    clientData: newClientData || null,
                    paymentMethod: newPaymentMethod,
                    billingDay: newBillingDay,
                    paymentTermDays: newPaymentTermDays,
                    value: parseFloat(newValue),
                    startMonth: newStartMonth,
                    startYear: newStartYear,
                    endMonth: newEndMonth ? parseInt(newEndMonth) : null,
                    endYear: newEndYear ? parseInt(newEndYear) : null,
                    isRecurring: newIsRecurring,
                    costCenterId: finalCCId !== 'NEW' ? finalCCId : undefined
                })
            });

            const data = await res.json();
            if (data.success) {
                fetchContracts();
                setIsCreateModalOpen(false);
                setNewName('');
                setNewClientData('');
                setNewValue('');
                setLinkCostCenter('NEW');
            } else {
                alert(`Erro: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Erro de rede ao salvar faturamento');
        }
    };

    const handleOpenConfig = (contract: BillingContract) => {
        setIsConfigModalOpen(contract);
        setCfgName(contract.name);
        setCfgClientData(contract.clientData || '');
        setCfgPaymentMethod(contract.paymentMethod);
        setCfgBillingDay(contract.billingDay);
        setCfgPaymentTermDays(contract.paymentTermDays);
        setCfgValue((contract.monthlyBudgets[selectedMonth - 1] || contract.value).toString());
        setCfgEndMonth(contract.endMonth ? contract.endMonth.toString() : '');
        setCfgEndYear(contract.endYear ? contract.endYear.toString() : '');
        setCfgIsRecurring(contract.isRecurring);
    };

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isConfigModalOpen) return;

        try {
            const res = await fetch(`/api/billing/${isConfigModalOpen.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: cfgName,
                    clientData: cfgClientData || null,
                    paymentMethod: cfgPaymentMethod,
                    billingDay: cfgBillingDay,
                    paymentTermDays: cfgPaymentTermDays,
                    value: parseFloat(cfgValue),
                    endMonth: cfgEndMonth ? parseInt(cfgEndMonth) : null,
                    endYear: cfgEndYear ? parseInt(cfgEndYear) : null,
                    isRecurring: cfgIsRecurring
                })
            });

            const data = await res.json();
            if (data.success) {
                fetchContracts();
                setIsConfigModalOpen(null);
            } else {
                alert(`Erro: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar configurações do contrato');
        }
    };

    const handleDeleteContract = async (id: string) => {
        if (!confirm('Deseja realmente excluir este contrato e todos os seus orçamentos associados permanentemente?')) return;

        try {
            const res = await fetch(`/api/billing/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                fetchContracts();
                setIsConfigModalOpen(null);
            } else {
                alert(`Erro: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Erro ao excluir contrato');
        }
    };

    const handleOpenCell = (contract: BillingContract, day: number, currentVal: number, isOverride: boolean, isBilled: boolean) => {
        setIsCellModalOpen({ contract, day, value: currentVal, isOverride, isBilled });
        setCellOverrideValue(currentVal.toString());
        setCellApplyRecurring(false);
        setCellIsBilled(isBilled);
    };

    const handleSaveCellOverride = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isCellModalOpen) return;

        const { contract } = isCellModalOpen;
        const val = parseFloat(cellOverrideValue);
        setIsSavingCell(true);

        try {
            if (cellApplyRecurring) {
                // Update recurrent value in contract base
                const res = await fetch(`/api/billing/${contract.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: val, startYear: selectedYear })
                });
                const data = await res.json();
                if (!data.success) {
                    alert(`Erro: ${data.error}`);
                    setIsSavingCell(false);
                    return;
                }
            }

            // Set override for this specific month/year with value and isBilled
            const res = await fetch(`/api/billing/${contract.id}/override`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    month: selectedMonth,
                    year: selectedYear,
                    value: val,
                    isCancelled: false,
                    isBilled: cellIsBilled
                })
            });
            const data = await res.json();
            if (!data.success) {
                alert(`Erro: ${data.error}`);
                setIsSavingCell(false);
                return;
            }

            fetchContracts();
            setIsCellModalOpen(null);
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar alteração de valor');
        } finally {
            setIsSavingCell(false);
        }
    };

    const handleSuspendBilling = async () => {
        if (!isCellModalOpen) return;
        if (!confirm(`Deseja suspender/cancelar o faturamento deste cliente para o mês de ${MONTH_NAMES[selectedMonth - 1]}?`)) return;

        const { contract } = isCellModalOpen;

        try {
            const res = await fetch(`/api/billing/${contract.id}/override`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    month: selectedMonth,
                    year: selectedYear,
                    isCancelled: true
                })
            });
            const data = await res.json();
            if (data.success) {
                fetchContracts();
                setIsCellModalOpen(null);
            } else {
                alert(`Erro: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Erro ao suspender faturamento');
        }
    };

    const fmt = (v: number) => {
        if (!v && v !== 0) return '';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    };

    const formatNumber = (v: number) => {
        if (!v && v !== 0) return '';
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    };

    const isOverdue = (day: number, isBilled: boolean) => {
        if (isBilled) return false;
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const currentDay = today.getDate();

        if (selectedYear < currentYear) return true;
        if (selectedYear === currentYear && selectedMonth < currentMonth) return true;
        if (selectedYear === currentYear && selectedMonth === currentMonth && day < currentDay) return true;

        return false;
    };

    return (
        <div style={{ padding: '2rem 1.5rem', minHeight: '100vh', backgroundColor: 'var(--bg-base)', width: '100%', boxSizing: 'border-box' }}>
                {/* Header Section */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>📅 Cronograma de Faturamento</h1>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Gerencie os cronogramas de faturamento e vencimentos dos contratos ativos e lançamentos avulsos.
                        </p>
                    </div>

                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        style={{
                            padding: '0.5rem 1.2rem',
                            background: 'linear-gradient(135deg, #0f62ac 0%, #0b579f 100%)',
                            color: '#ffffff',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 6px rgba(15, 98, 172, 0.2)'
                        }}
                    >
                        <span>➕</span> Novo Faturamento
                    </button>
                </div>

                {/* Filters and View Toggles Section */}
                <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Company */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Empresa</span>
                            <select
                                value={selectedTenant}
                                onChange={(e) => handleTenantChange(e.target.value)}
                                style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                            >
                                <option value="ALL">Todas as Empresas (Consolidado)</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        {/* Year */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ano</span>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                            >
                                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>

                        {/* Month */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Mês</span>
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                            >
                                {MONTH_NAMES.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
                            </select>
                        </div>

                        {/* Mostrar Encerrados Checkbox */}
                        <div style={{ display: 'flex', alignItems: 'center', height: '36px', marginTop: '1.1rem', marginLeft: '0.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={showEndedContracts}
                                    onChange={(e) => setShowEndedContracts(e.target.checked)}
                                    style={{ accentColor: '#0f62ac', width: '15px', height: '15px' }}
                                />
                                <span>Mostrar Encerrados</span>
                            </label>
                        </div>

                        {/* Visual Status Legend */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.1rem', marginLeft: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(22,163,74,0.3)' }}>
                                <span>✓</span> Faturado
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#b91c1c', background: '#fee2e2', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)' }}>
                                <span>⚠️</span> Pendente / Vencido
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#0f62ac', background: 'rgba(15,98,172,0.08)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(15,98,172,0.2)' }}>
                                <span>📅</span> A Faturar (Previsto)
                            </div>
                        </div>
                    </div>

                    {/* View mode toggle */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginRight: '4px' }}>Modo de Visualização</span>
                        <div style={{ display: 'flex', background: 'rgba(0, 0, 0, 0.05)', padding: '3px', borderRadius: '8px', height: '36px', boxSizing: 'border-box' }}>
                            <button
                                onClick={() => setActiveView('billing')}
                                style={{
                                    padding: '0 1rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: activeView === 'billing' ? '#ffffff' : 'transparent',
                                    color: activeView === 'billing' ? '#0f62ac' : 'var(--text-secondary)',
                                    boxShadow: activeView === 'billing' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                Visão de Faturamento
                            </button>
                            <button
                                onClick={() => setActiveView('payment')}
                                style={{
                                    padding: '0 1rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: activeView === 'payment' ? '#ffffff' : 'transparent',
                                    color: activeView === 'payment' ? '#0f62ac' : 'var(--text-secondary)',
                                    boxShadow: activeView === 'payment' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                Visão de Recebimento
                            </button>
                        </div>
                    </div>
                </div>

                {/* Timeline Grid Spreadsheet Wrapper */}
                <div className="glass-card" style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="spinner" />
                            <span style={{ marginTop: '1rem', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Carregando Cronograma...</span>
                        </div>
                    ) : filteredGridData.length === 0 ? (
                        <div style={{ padding: '5rem', textAlign: 'center' }}>
                            <span style={{ fontSize: '2.5rem' }}>📑</span>
                            <h3 style={{ margin: '1rem 0 0.5rem 0', color: 'var(--text-primary)' }}>Nenhum contrato ou centro de custo ativo</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                                Clique em "Novo Faturamento" para adicionar um cliente ou associar um orçamento.
                            </p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto', width: '100%' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left', minWidth: `${360 + daysInMonth * 92}px` }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '2px solid var(--border-default)' }}>
                                        <th style={{ padding: '0.75rem 1rem', width: '270px', minWidth: '270px', fontWeight: 700, color: 'var(--text-primary)', position: 'sticky', left: 0, background: 'var(--bg-elevated)', zIndex: 10 }}>Cliente / Centro de Custo</th>
                                        <th style={{ padding: '0.75rem 1.25rem', width: '110px', minWidth: '110px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>Orçado Mês</th>
                                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                            const isSorted = sortDay === day;
                                            return (
                                                <th
                                                    key={day}
                                                    onClick={() => setSortDay(prev => prev === day ? null : day)}
                                                    style={{
                                                        padding: '0.65rem 0.25rem',
                                                        textAlign: 'center',
                                                        width: '92px',
                                                        minWidth: '92px',
                                                        fontWeight: 800,
                                                        color: isSorted ? '#ffffff' : 'var(--text-primary)',
                                                        background: isSorted ? '#0f62ac' : 'transparent',
                                                        cursor: 'pointer',
                                                        userSelect: 'none',
                                                        transition: 'all 0.15s ease',
                                                        borderRight: '1px solid var(--border-subtle)'
                                                    }}
                                                    title={isSorted ? `Dia ${day} ordenado no topo. Clique para limpar ordenação.` : `Clique para classificar e subir faturamentos do Dia ${day} para o topo`}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                        <span>{day}</span>
                                                        <span style={{ fontSize: '0.65rem', opacity: isSorted ? 1 : 0.4 }}>
                                                            {isSorted ? '▲' : '⇅'}
                                                        </span>
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredGridData.map(({ contract, dayValues }) => {
                                        const currentMonthBudget = contract.monthlyBudgets[selectedMonth - 1] || 0;
                                        return (
                                            <tr key={contract.id} style={{ borderBottom: '1px solid var(--border-subtle)', height: '44px' }} className="hover-row">
                                                {/* Name, Company & Recurrence badge */}
                                                <td style={{ padding: '0.5rem 1rem', fontWeight: 600, color: 'var(--text-primary)', position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 5 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <button
                                                            onClick={() => handleOpenConfig(contract)}
                                                            style={{
                                                                background: 'rgba(15, 98, 172, 0.06)',
                                                                border: '1px solid rgba(15, 98, 172, 0.18)',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.8rem',
                                                                color: '#0f62ac',
                                                                padding: '4px 6px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                transition: 'all 0.15s ease',
                                                                flexShrink: 0
                                                            }}
                                                            title="Editar / Configurar Contrato"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                                {selectedTenant === 'ALL' && (
                                                                    <span style={{
                                                                        fontSize: '0.62rem',
                                                                        color: '#0f62ac',
                                                                        fontWeight: 800,
                                                                        background: 'rgba(15, 98, 172, 0.08)',
                                                                        padding: '1px 4px',
                                                                        borderRadius: '4px',
                                                                        textTransform: 'uppercase'
                                                                    }}>
                                                                        {contract.tenantName}
                                                                    </span>
                                                                )}
                                                                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{contract.name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                <span style={{
                                                                    fontSize: '0.55rem',
                                                                    padding: '1px 4px',
                                                                    borderRadius: '4px',
                                                                    fontWeight: 800,
                                                                    color: contract.isRecurring ? 'var(--accent-blue)' : '#ea580c',
                                                                    background: contract.isRecurring ? 'rgba(15, 98, 172, 0.08)' : 'rgba(234, 88, 12, 0.08)'
                                                                }}>
                                                                    {contract.isRecurring ? 'RECORRENTE' : 'AVULSO'}
                                                                </span>
                                                                <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>
                                                                    {contract.paymentMethod}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Budgeted amount this month */}
                                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600, color: currentMonthBudget > 0 ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentMonthBudget)}
                                                </td>

                                                {/* Timeline grid cells */}
                                                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                                    const hasVal = dayValues[day];
                                                    if (!hasVal) {
                                                        return (
                                                            <td
                                                                key={day}
                                                                onClick={() => handleOpenCell(contract, day, currentMonthBudget, false, false)}
                                                                style={{
                                                                    padding: '0.35rem 0.25rem',
                                                                    textAlign: 'center',
                                                                    cursor: 'pointer',
                                                                    background: sortDay === day ? 'rgba(15, 98, 172, 0.03)' : 'transparent',
                                                                    color: 'var(--text-secondary)',
                                                                    borderLeft: '1px dashed var(--border-subtle)',
                                                                    borderRight: '1px dashed var(--border-subtle)',
                                                                    minWidth: '92px',
                                                                    width: '92px'
                                                                }}
                                                                className="hover-cell"
                                                            >
                                                                -
                                                            </td>
                                                        );
                                                    }

                                                    const overdue = isOverdue(day, hasVal.isBilled);

                                                    // Visual styling states
                                                    let cellBg = 'rgba(15, 98, 172, 0.06)';
                                                    let cellColor = 'var(--text-primary)';
                                                    let cellBorder = '1px solid rgba(15, 98, 172, 0.12)';

                                                    if (hasVal.isBilled) {
                                                        cellBg = '#dcfce7'; // Light green
                                                        cellColor = '#15803d';
                                                        cellBorder = '1px solid rgba(22, 163, 74, 0.35)';
                                                    } else if (overdue) {
                                                        cellBg = '#fee2e2'; // Light soft red/alert
                                                        cellColor = '#b91c1c';
                                                        cellBorder = '1px solid rgba(239, 68, 68, 0.3)';
                                                    } else if (hasVal.isOverride) {
                                                        cellBg = 'rgba(224, 242, 254, 0.7)';
                                                        cellColor = '#0369a1';
                                                        cellBorder = '1px solid rgba(2, 132, 199, 0.3)';
                                                    }

                                                    return (
                                                        <td
                                                            key={day}
                                                            onClick={() => handleOpenCell(contract, day, hasVal.value, !!hasVal.isOverride, !!hasVal.isBilled)}
                                                            style={{
                                                                padding: '0.35rem 0.25rem',
                                                                textAlign: 'center',
                                                                cursor: 'pointer',
                                                                background: sortDay === day ? 'rgba(15, 98, 172, 0.04)' : 'transparent',
                                                                transition: 'background 0.2s',
                                                                borderLeft: '1px dashed var(--border-subtle)',
                                                                borderRight: '1px dashed var(--border-subtle)',
                                                                minWidth: '92px',
                                                                width: '92px'
                                                            }}
                                                            className="hover-cell"
                                                        >
                                                            <div
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '3px',
                                                                    padding: '3px 6px',
                                                                    borderRadius: '6px',
                                                                    background: cellBg,
                                                                    color: cellColor,
                                                                    border: cellBorder,
                                                                    fontWeight: 700,
                                                                    fontSize: '0.72rem',
                                                                    whiteSpace: 'nowrap',
                                                                    boxSizing: 'border-box',
                                                                    width: '100%',
                                                                    maxWidth: '88px',
                                                                    boxShadow: hasVal.isBilled ? '0 1px 2px rgba(22, 163, 74, 0.1)' : 'none'
                                                                }}
                                                                title={`${hasVal.isBilled ? '✓ FATURADO' : overdue ? '⚠️ PENDENTE / VENCIDO' : 'PREVISTO'}: ${fmt(hasVal.value)}`}
                                                            >
                                                                {hasVal.isBilled && <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>✓</span>}
                                                                <span>{formatNumber(hasVal.value)}</span>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}

                                    {/* Column Total Consolidation */}
                                    <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-default)', fontWeight: 800 }}>
                                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', position: 'sticky', left: 0, background: 'var(--bg-elevated)', zIndex: 10 }}>TOTAL DO DIA</td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                filteredGridData.reduce((acc, { contract }) => acc + (getBillingDetailsForMonth(contract, selectedMonth, selectedYear)?.value || 0), 0)
                                            )}
                                        </td>
                                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                            const daySum = columnTotals[day] || 0;
                                            return (
                                                <td
                                                    key={day}
                                                    style={{
                                                        padding: '0.5rem 0.25rem',
                                                        textAlign: 'center',
                                                        color: daySum > 0 ? '#0f62ac' : 'var(--text-secondary)',
                                                        background: daySum > 0 ? 'rgba(15, 98, 172, 0.08)' : (sortDay === day ? 'rgba(15, 98, 172, 0.04)' : 'transparent'),
                                                        borderLeft: '1px dashed var(--border-subtle)',
                                                        borderRight: '1px dashed var(--border-subtle)',
                                                        minWidth: '92px',
                                                        width: '92px',
                                                        fontSize: '0.72rem',
                                                        whiteSpace: 'nowrap',
                                                        fontWeight: 800
                                                    }}
                                                    title={`Total Dia ${day}: ${fmt(daySum)}`}
                                                >
                                                    {daySum > 0 ? formatNumber(daySum) : '-'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* MODAL: CRIAR NOVO FATURAMENTO */}
                {isCreateModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="glass-card" style={{ width: '540px', background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>➕ Cadastrar Novo Faturamento</h3>
                                <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>✕</button>
                            </div>

                            <form onSubmit={handleCreateContract} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                {/* Company selector inside creation if consolidated view is active */}
                                {selectedTenant === 'ALL' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>EMPRESA DO CONTRATO *</label>
                                        <select
                                            value={newTenantId}
                                            onChange={(e) => setNewTenantId(e.target.value)}
                                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                                        >
                                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>CENTRO DE CUSTO *</label>
                                        <select
                                            value={linkCostCenter}
                                            onChange={(e) => setLinkCostCenter(e.target.value)}
                                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                                        >
                                            <option value="NEW">➕ Criar Novo Centro de Custo/Cliente</option>
                                            {costCenters.map(cc => (
                                                <option key={cc.id} value={cc.id}>{cc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {linkCostCenter === 'NEW' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>NOME DO NOVO CLIENTE / CONTRATO *</label>
                                        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Clean Tech Matriz" style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>VALOR ORÇADO MENSAL (R$) *</label>
                                        <input type="number" step="0.01" value={newValue} onChange={(e) => setNewValue(e.target.value)} required placeholder="10000" style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>RECORRÊNCIA *</label>
                                        <select value={newIsRecurring ? 'true' : 'false'} onChange={(e) => setNewIsRecurring(e.target.value === 'true')} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                            <option value="true">Mensal Recorrente</option>
                                            <option value="false">Faturamento Avulso (Único)</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>DIA DE FATURAMENTO / EMISSÃO (1-31) *</label>
                                        <input type="number" min="1" max="31" value={newBillingDay} onChange={(e) => setNewBillingDay(parseInt(e.target.value))} required style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>VENCIMENTO (DIAS OU DIA DO MÊS) *</label>
                                        <input type="number" min="1" max="31" value={newPaymentTermDays} onChange={(e) => setNewPaymentTermDays(parseInt(e.target.value))} required placeholder="Ex: 10 (10 dias ou dia 10)" style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                    </div>
                                </div>


                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>MÊS DE INÍCIO *</label>
                                        <select value={newStartMonth} onChange={(e) => setNewStartMonth(parseInt(e.target.value))} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ANO DE INÍCIO *</label>
                                        <select value={newStartYear} onChange={(e) => setNewStartYear(parseInt(e.target.value))} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>FORMA DE PAGAMENTO *</label>
                                        <select value={newPaymentMethod} onChange={(e) => setNewPaymentMethod(e.target.value)} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                            <option value="Boleto">Boleto Bancário</option>
                                            <option value="Pix">Pix</option>
                                            <option value="Cartão de Crédito">Cartão de Crédito</option>
                                            <option value="Transferência">Transferência Bancária</option>
                                            <option value="Outro">Outro</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>DADOS DE FATURAMENTO (OPCIONAL)</label>
                                        <input type="text" value={newClientData} onChange={(e) => setNewClientData(e.target.value)} placeholder="CNPJ, Endereço, etc." style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                    </div>
                                </div>

                                {newIsRecurring && (
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.2rem' }}>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>MÊS FINAL (OPCIONAL)</label>
                                            <select value={newEndMonth} onChange={(e) => setNewEndMonth(e.target.value)} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                                <option value="">Não encerra (Indeterminado)</option>
                                                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ANO FINAL (OPCIONAL)</label>
                                            <select value={newEndYear} onChange={(e) => setNewEndYear(e.target.value)} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                                <option value="">Não encerra (Indeterminado)</option>
                                                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                                    <button type="button" onClick={() => setIsCreateModalOpen(false)} style={{ height: '38px', padding: '0 1.25rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700 }}>Cancelar</button>
                                    <button type="submit" style={{ height: '38px', padding: '0 1.5rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #0f62ac 0%, #0b579f 100%)', color: '#ffffff', cursor: 'pointer', fontWeight: 700 }}>Salvar</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL: CONFIGURAÇÃO INDIVIDUAL DO CONTRATO */}
                {isConfigModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="glass-card" style={{ width: '540px', background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>⚙️ Configurações do Faturamento</h3>
                                <button onClick={() => setIsConfigModalOpen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>✕</button>
                            </div>

                            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>NOME DO CLIENTE / CONTRATO</label>
                                    <input type="text" value={cfgName} onChange={(e) => setCfgName(e.target.value)} required style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>VALOR RECORRENTE MENSAL (R$)</label>
                                        <input type="number" step="0.01" value={cfgValue} onChange={(e) => setCfgValue(e.target.value)} required style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>RECORRÊNCIA</label>
                                        <select value={cfgIsRecurring ? 'true' : 'false'} onChange={(e) => setCfgIsRecurring(e.target.value === 'true')} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                            <option value="true">Mensal Recorrente</option>
                                            <option value="false">Faturamento Avulso</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>DIA DE FATURAMENTO (1-31)</label>
                                        <input type="number" min="1" max="31" value={cfgBillingDay} onChange={(e) => setCfgBillingDay(parseInt(e.target.value))} required style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>VENCIMENTO (DIAS OU DIA DO MÊS)</label>
                                        <input type="number" min="1" max="31" value={cfgPaymentTermDays} onChange={(e) => setCfgPaymentTermDays(parseInt(e.target.value))} required style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                    </div>
                                </div>


                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>FORMA DE PAGAMENTO</label>
                                        <select value={cfgPaymentMethod} onChange={(e) => setCfgPaymentMethod(e.target.value)} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                            <option value="Boleto">Boleto Bancário</option>
                                            <option value="Pix">Pix</option>
                                            <option value="Cartão de Crédito">Cartão de Crédito</option>
                                            <option value="Transferência">Transferência Bancária</option>
                                            <option value="Outro">Outro</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>DADOS DE FATURAMENTO</label>
                                        <input type="text" value={cfgClientData} onChange={(e) => setCfgClientData(e.target.value)} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                                    </div>
                                </div>

                                {cfgIsRecurring && (
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.2rem' }}>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>MÊS FINAL (OPCIONAL)</label>
                                            <select value={cfgEndMonth} onChange={(e) => setCfgEndMonth(e.target.value)} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                                <option value="">Não encerra (Indeterminado)</option>
                                                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ANO FINAL (OPCIONAL)</label>
                                            <select value={cfgEndYear} onChange={(e) => setCfgEndYear(e.target.value)} style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                                <option value="">Não encerra (Indeterminado)</option>
                                                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                                    <button type="button" onClick={() => handleDeleteContract(isConfigModalOpen.id)} style={{ height: '38px', padding: '0 1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                                        🗑️ Excluir Contrato
                                    </button>

                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <button type="button" onClick={() => setIsConfigModalOpen(null)} style={{ height: '38px', padding: '0 1.25rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700 }}>Cancelar</button>
                                        <button type="submit" style={{ height: '38px', padding: '0 1.5rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #0f62ac 0%, #0b579f 100%)', color: '#ffffff', cursor: 'pointer', fontWeight: 700 }}>Salvar</button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL: AJUSTE / EDICAO DE CÉLULA (OVERRIDE DO MÊS) */}
                {isCellModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="glass-card" style={{ width: '460px', background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>✏️ Detalhes do Faturamento</h3>
                                <button onClick={() => setIsCellModalOpen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>✕</button>
                            </div>

                            <div style={{ background: 'var(--bg-elevated)', padding: '0.85rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{isCellModalOpen.contract.name}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                    Referência: <strong>{MONTH_NAMES[selectedMonth - 1]} / {selectedYear}</strong> • Dia de Emissão: <strong>Dia {isCellModalOpen.day}</strong>
                                </span>
                            </div>

                            <form onSubmit={handleSaveCellOverride} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                                {/* Status Toggle Box */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                        Status do Faturamento no Mês
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setCellIsBilled(true)}
                                            style={{
                                                padding: '0.65rem 0.75rem',
                                                borderRadius: '8px',
                                                border: cellIsBilled ? '2px solid #16a34a' : '1px solid var(--border-default)',
                                                background: cellIsBilled ? '#dcfce7' : 'var(--bg-elevated)',
                                                color: cellIsBilled ? '#15803d' : 'var(--text-secondary)',
                                                fontWeight: 800,
                                                fontSize: '0.82rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <span>✓</span> Faturado
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCellIsBilled(false)}
                                            style={{
                                                padding: '0.65rem 0.75rem',
                                                borderRadius: '8px',
                                                border: !cellIsBilled ? '2px solid #0f62ac' : '1px solid var(--border-default)',
                                                background: !cellIsBilled ? 'rgba(15, 98, 172, 0.08)' : 'var(--bg-elevated)',
                                                color: !cellIsBilled ? '#0f62ac' : 'var(--text-secondary)',
                                                fontWeight: 800,
                                                fontSize: '0.82rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <span>⏳</span> Pendente
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>VALOR DO FATURAMENTO (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={cellOverrideValue}
                                        onChange={(e) => setCellOverrideValue(e.target.value)}
                                        required
                                        style={{ height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 700 }}
                                    />
                                </div>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={cellApplyRecurring}
                                        onChange={(e) => setCellApplyRecurring(e.target.checked)}
                                        style={{ accentColor: '#0f62ac' }}
                                    />
                                    <span>Alterar valor recorrente (todos os meses futuros)</span>
                                </label>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <button
                                        type="button"
                                        onClick={handleSuspendBilling}
                                        style={{ height: '36px', width: '100%', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                                    >
                                        🚫 Suspender Faturamento deste Mês
                                    </button>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                    <button type="button" onClick={() => setIsCellModalOpen(null)} style={{ height: '38px', padding: '0 1.25rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700 }}>Cancelar</button>
                                    <button type="submit" disabled={isSavingCell} style={{ height: '38px', padding: '0 1.5rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #0f62ac 0%, #0b579f 100%)', color: '#ffffff', cursor: 'pointer', fontWeight: 700 }}>
                                        {isSavingCell ? 'Salvando...' : 'Salvar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
        </div>
    );
}
