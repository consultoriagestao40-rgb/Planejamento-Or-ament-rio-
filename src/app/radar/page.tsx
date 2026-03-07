'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Company {
    id: string;
    name: string;
    cnpj: string;
}

interface RadarLock {
    tenantId: string;
    month: number;
    year: number;
    isLocked: boolean;
    deadline: string | null;
}

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function RadarManagementPage() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [locks, setLocks] = useState<RadarLock[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [compRes, lockRes, authRes] = await Promise.all([
                fetch('/api/companies'),
                fetch(`/api/radar/lock?year=${selectedYear}`),
                fetch('/api/auth/me')
            ]);

            const [compData, lockData, authData] = await Promise.all([
                compRes.json(),
                lockRes.json(),
                authRes.json()
            ]);

            if (compData.success) setCompanies(compData.companies);
            if (lockData.success) setLocks(lockData.data);
            if (authData.success) setUserRole(authData.user.role);
        } catch (error) {
            console.error('Error fetching radar data:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggleLock = async (tenantId: string, month: number, currentLocked: boolean) => {
        if (userRole !== 'MASTER') return;
        const key = `${tenantId}-${month}`;
        setIsUpdating(key);
        try {
            const res = await fetch('/api/radar/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId,
                    month,
                    year: selectedYear,
                    isLocked: !currentLocked
                })
            });
            const result = await res.json();
            if (result.success) {
                // Update local state
                setLocks(prev => {
                    const idx = prev.findIndex(l => l.tenantId === tenantId && l.month === month);
                    if (idx >= 0) {
                        const newLocks = [...prev];
                        newLocks[idx] = { ...newLocks[idx], isLocked: !currentLocked };
                        return newLocks;
                    }
                    return [...prev, result.data];
                });
            }
        } catch (error) {
            console.error('Error toggling radar lock:', error);
        } finally {
            setIsUpdating(null);
        }
    };

    const updateDeadline = async (tenantId: string, month: number, deadline: string) => {
        if (userRole !== 'MASTER') return;
        try {
            const res = await fetch('/api/radar/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId,
                    month,
                    year: selectedYear,
                    deadline
                })
            });
            const result = await res.json();
            if (result.success) {
                setLocks(prev => {
                    const idx = prev.findIndex(l => l.tenantId === tenantId && l.month === month);
                    if (idx >= 0) {
                        const newLocks = [...prev];
                        newLocks[idx] = { ...newLocks[idx], deadline: result.data.deadline };
                        return newLocks;
                    }
                    return [...prev, result.data];
                });
            }
        } catch (error) {
            console.error('Error updating deadline:', error);
        }
    };

    const getLockState = (tenantId: string, month: number) => {
        const lock = locks.find(l => l.tenantId === tenantId && l.month === month);
        const isPastDeadline = lock?.deadline && new Date() > new Date(lock.deadline);
        return {
            isLocked: lock?.isLocked || false,
            deadline: lock?.deadline ? new Date(lock.deadline).toISOString().split('T')[0] : '',
            isExpired: !!isPastDeadline
        };
    };

    if (loading) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>⏳</div>
                Carregando Gestão de Radar...
            </div>
        );
    }

    return (
        <div style={{ padding: '2rem', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: '#1e293b', margin: 0, letterSpacing: '-0.025em' }}>
                            🎯 Gestão de Radar
                        </h1>
                        <p style={{ color: '#64748b', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                            Controle os prazos e trancamentos dos orçamentos de revisão (Radar) por mês e empresa.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <Link href="/summary" style={{ padding: '0.6rem 1.2rem', backgroundColor: '#fff', color: '#64748b', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            ← Voltar ao Resumo
                        </Link>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                        >
                            <option value={2025}>2025</option>
                            <option value={2026}>2026</option>
                        </select>
                    </div>
                </div>

                <div style={{ backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f1f5f9' }}>
                                    <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0', minWidth: '200px', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 10 }}>Empresa</th>

                                    {MONTHS.map((m, i) => (
                                        <th key={i} style={{ padding: '1.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0', textAlign: 'center' }}>{m}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {companies.map((company) => (
                                    <tr key={company.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700, color: '#1e293b', fontSize: '0.9rem', position: 'sticky', left: 0, background: 'inherit', zIndex: 5 }}>{company.name}</td>

                                        {MONTHS.map((_, i) => {
                                            const monthNum = i + 1;
                                            const { isLocked, deadline, isExpired } = getLockState(company.id, monthNum);
                                            const key = `${company.id}-${monthNum}`;
                                            const effectivelyLocked = isLocked || isExpired;

                                            return (
                                                <td key={i} style={{ padding: '1rem', textAlign: 'center', borderLeft: '1px solid #f1f5f9' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                                                        <button
                                                            onClick={() => toggleLock(company.id, monthNum, isLocked)}
                                                            disabled={userRole !== 'MASTER' || isUpdating === key}
                                                            style={{
                                                                background: effectivelyLocked ? '#fee2e2' : '#f0fdf4',
                                                                border: `1px solid ${effectivelyLocked ? '#fecaca' : '#bbf7d0'}`,
                                                                borderRadius: '6px',
                                                                cursor: (userRole === 'MASTER' && isUpdating !== key) ? 'pointer' : 'default',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 800,
                                                                padding: '0.3rem 0.5rem',
                                                                color: effectivelyLocked ? '#991b1b' : '#166534',
                                                                opacity: userRole === 'MASTER' ? 1 : 0.6,
                                                                width: '100%',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '0.3rem'
                                                            }}
                                                        >
                                                            {isUpdating === key ? '...' : (effectivelyLocked ? '🔒 TRANCADO' : '🔓 ABERTO')}
                                                        </button>
                                                        <input 
                                                            type="date"
                                                            value={deadline}
                                                            onChange={(e) => updateDeadline(company.id, monthNum, e.target.value)}
                                                            disabled={userRole !== 'MASTER'}
                                                            style={{
                                                                fontSize: '0.65rem',
                                                                padding: '0.2rem',
                                                                borderRadius: '4px',
                                                                border: '1px solid #e2e8f0',
                                                                width: '100%',
                                                                color: isExpired ? '#ef4444' : '#64748b',
                                                                backgroundColor: isExpired ? '#fff1f2' : '#fff',
                                                                outline: 'none'
                                                            }}
                                                            title="Prazo limite para edição do Radar"
                                                        />
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
